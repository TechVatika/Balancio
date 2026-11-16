import crypto from "node:crypto";
import { ensureSecret } from "./secrets.js";

const ALGO = "aes-256-gcm";

function masterKey() {
  const hex = ensureSecret("MASTER_KEY", () => crypto.randomBytes(32).toString("hex"));
  return Buffer.from(hex, "hex");
}

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function seal(plainBuffer, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plainBuffer), cipher.final()]);
  return { ciphertext, iv, tag: cipher.getAuthTag() };
}

function open(ciphertext, key, iv, tag) {
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

const keyCache = new Map(); // key_date -> 32-byte data key

/** Returns today's data key, creating and wrapping a fresh one in encryption_keys if today has none yet. */
export async function getTodayKey(pool) {
  return getKeyForDate(pool, todayIso());
}

export async function getKeyForDate(pool, keyDate) {
  if (keyCache.has(keyDate)) return keyCache.get(keyDate);

  const [rows] = await pool.query(
    "SELECT wrapped_key, `iv`, tag FROM encryption_keys WHERE key_date = ?",
    [keyDate],
  );
  if (rows.length) {
    const row = rows[0];
    const dataKey = open(row.wrapped_key, masterKey(), row.iv, row.tag);
    keyCache.set(keyDate, dataKey);
    return dataKey;
  }

  const dataKey = crypto.randomBytes(32);
  const wrapped = seal(dataKey, masterKey());
  try {
    await pool.query(
      "INSERT INTO encryption_keys (key_date, wrapped_key, `iv`, tag) VALUES (?, ?, ?, ?)",
      [keyDate, wrapped.ciphertext, wrapped.iv, wrapped.tag],
    );
  } catch (error) {
    // Another request created today's key between our SELECT and INSERT — read it back instead of erroring.
    if (error.code !== "ER_DUP_ENTRY") throw error;
    keyCache.delete(keyDate);
    return getKeyForDate(pool, keyDate);
  }
  keyCache.set(keyDate, dataKey);
  return dataKey;
}

/** Encrypts text with today's data key. Returns the ciphertext parts plus which day's key was used. */
export async function encryptField(pool, text) {
  const keyDate = todayIso();
  const key = await getKeyForDate(pool, keyDate);
  const { ciphertext, iv, tag } = seal(Buffer.from(String(text ?? ""), "utf8"), key);
  return { ciphertext, iv, tag, keyDate };
}

/** Decrypts a field using the data key recorded for its key_date. */
export async function decryptField(pool, { ciphertext, iv, tag, keyDate }) {
  if (ciphertext == null) return "";
  const key = await getKeyForDate(pool, keyDate);
  return open(ciphertext, key, iv, tag).toString("utf8");
}

export async function listKeyHistory(pool) {
  const [rows] = await pool.query(
    "SELECT key_date, created_at FROM encryption_keys ORDER BY key_date DESC LIMIT 30",
  );
  return rows;
}
