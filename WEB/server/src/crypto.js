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

/** Opaque day lookup token — not a readable calendar date in MySQL. */
export function dayToken(iso = todayIso()) {
  return crypto.createHmac("sha256", masterKey()).update(`day:${iso}`).digest("hex");
}

/** Opaque month token for activity-log retention (current calendar month). */
export function monthToken(date = new Date()) {
  const ym = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  return crypto.createHmac("sha256", masterKey()).update(`month:${ym}`).digest("hex");
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

const keyCacheById = new Map();
const keyCacheByToken = new Map();

/** Returns today's data key row id + bytes, creating a wrapped key if needed. */
export async function getTodayKey(pool) {
  const token = dayToken();
  if (keyCacheByToken.has(token)) {
    const cached = keyCacheByToken.get(token);
    return cached;
  }

  const [rows] = await pool.query(
    "SELECT id, wrapped_key, `iv`, tag FROM encryption_keys WHERE day_token = ?",
    [token],
  );
  if (rows.length) {
    const row = rows[0];
    const dataKey = open(row.wrapped_key, masterKey(), row.iv, row.tag);
    const value = { keyId: Number(row.id), key: dataKey };
    keyCacheByToken.set(token, value);
    keyCacheById.set(value.keyId, dataKey);
    return value;
  }

  const dataKey = crypto.randomBytes(32);
  const wrapped = seal(dataKey, masterKey());
  try {
    const [result] = await pool.query(
      "INSERT INTO encryption_keys (day_token, wrapped_key, `iv`, tag) VALUES (?, ?, ?, ?)",
      [token, wrapped.ciphertext, wrapped.iv, wrapped.tag],
    );
    const keyId = Number(result.insertId);
    const value = { keyId, key: dataKey };
    keyCacheByToken.set(token, value);
    keyCacheById.set(keyId, dataKey);
    return value;
  } catch (error) {
    if (error.code !== "ER_DUP_ENTRY") throw error;
    keyCacheByToken.delete(token);
    return getTodayKey(pool);
  }
}

/** @deprecated kept for one-shot migrations that still know a calendar day */
export async function getKeyForDate(pool, keyDate) {
  const token = dayToken(keyDate);
  if (keyCacheByToken.has(token)) return keyCacheByToken.get(token).key;

  const [rows] = await pool.query(
    "SELECT id, wrapped_key, `iv`, tag FROM encryption_keys WHERE day_token = ?",
    [token],
  );
  if (rows.length) {
    const row = rows[0];
    const dataKey = open(row.wrapped_key, masterKey(), row.iv, row.tag);
    const value = { keyId: Number(row.id), key: dataKey };
    keyCacheByToken.set(token, value);
    keyCacheById.set(value.keyId, dataKey);
    return dataKey;
  }
  const today = await getTodayKey(pool);
  return today.key;
}

export async function getKeyById(pool, keyId) {
  const id = Number(keyId);
  if (keyCacheById.has(id)) return keyCacheById.get(id);
  const [rows] = await pool.query(
    "SELECT wrapped_key, `iv`, tag FROM encryption_keys WHERE id = ?",
    [id],
  );
  if (!rows.length) throw new Error("Encryption key is missing.");
  const row = rows[0];
  const dataKey = open(row.wrapped_key, masterKey(), row.iv, row.tag);
  keyCacheById.set(id, dataKey);
  return dataKey;
}

/** Encrypts text with today's data key. Returns ciphertext parts plus opaque key id. */
export async function encryptField(pool, text) {
  const { keyId, key } = await getTodayKey(pool);
  const { ciphertext, iv, tag } = seal(Buffer.from(String(text ?? ""), "utf8"), key);
  return { ciphertext, iv, tag, keyId };
}

/** Decrypts a field using the data key id stored with the row. */
export async function decryptField(pool, { ciphertext, iv, tag, keyId, keyDate }) {
  if (ciphertext == null) return "";
  let key;
  if (keyId != null) {
    key = await getKeyById(pool, keyId);
  } else if (keyDate) {
    // Legacy sealed rows during migration.
    key = await getKeyForDate(pool, keyDate);
  } else {
    throw new Error("Missing encryption key reference.");
  }
  return open(ciphertext, key, iv, tag).toString("utf8");
}

export async function encryptJson(pool, value) {
  return encryptField(pool, JSON.stringify(value ?? null));
}

export async function decryptJson(pool, sealed) {
  const text = await decryptField(pool, sealed);
  if (!text) return null;
  return JSON.parse(text);
}

export function sealWithMaster(plainBuffer) {
  return seal(Buffer.isBuffer(plainBuffer) ? plainBuffer : Buffer.from(String(plainBuffer), "utf8"), masterKey());
}

export function openWithMaster(ciphertext, iv, tag) {
  return open(ciphertext, masterKey(), iv, tag);
}

export async function listKeyHistory(pool) {
  const [rows] = await pool.query(
    "SELECT id FROM encryption_keys ORDER BY id DESC LIMIT 30",
  );
  return rows.map((row) => ({ id: Number(row.id) }));
}

export { todayIso };
