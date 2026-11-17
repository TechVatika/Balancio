import crypto from "node:crypto";
import { decryptJson, encryptJson, getTodayKey, monthToken } from "./crypto.js";
import { ensureSecret } from "./secrets.js";

async function columnExists(pool, table, column) {
  const [rows] = await pool.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  return rows.length > 0;
}

async function dropColumnsIfPresent(pool, table, columns) {
  for (const column of columns) {
    if (await columnExists(pool, table, column)) {
      await pool.query(`ALTER TABLE \`${table}\` DROP COLUMN \`${column}\``);
    }
  }
}

function masterKey() {
  const hex = ensureSecret("MASTER_KEY", () => crypto.randomBytes(32).toString("hex"));
  return Buffer.from(hex, "hex");
}

function dayTokenFromIso(iso) {
  return crypto.createHmac("sha256", masterKey()).update(`day:${String(iso).slice(0, 10)}`).digest("hex");
}

/** Must run before any encrypt/decrypt after switching to opaque day tokens. */
export async function migrateEncryptionKeyTable(pool) {
  await reshapeEncryptionKeys(pool);
}

/**
 * Replace readable key_date / timestamps with opaque key ids and month tokens.
 */
export async function migrateHideDates(pool) {
  await reshapeEncryptionKeys(pool);
  await getTodayKey(pool);
  await swapKeyDateForKeyId(pool, "transactions");
  await swapKeyDateForKeyId(pool, "books");
  await swapKeyDateForKeyId(pool, "activity_logs");
  await sealLogTimestamps(pool);
  await dropColumnsIfPresent(pool, "transactions", ["created_at", "updated_at", "key_date"]);
  await dropColumnsIfPresent(pool, "books", ["created_at", "updated_at", "key_date"]);
  await dropColumnsIfPresent(pool, "activity_logs", ["created_at", "key_date"]);
}

async function reshapeEncryptionKeys(pool) {
  if (!(await columnExists(pool, "encryption_keys", "id"))) {
    await pool.query(
      "ALTER TABLE encryption_keys ADD COLUMN id INT UNSIGNED NOT NULL AUTO_INCREMENT UNIQUE FIRST",
    );
  }
  if (!(await columnExists(pool, "encryption_keys", "day_token"))) {
    await pool.query("ALTER TABLE encryption_keys ADD COLUMN day_token CHAR(64) NULL");
  }

  if (await columnExists(pool, "encryption_keys", "key_date")) {
    const [rows] = await pool.query(
      `SELECT id, DATE_FORMAT(key_date, '%Y-%m-%d') AS key_date
       FROM encryption_keys
       WHERE day_token IS NULL OR day_token = ''`,
    );
    for (const row of rows) {
      await pool.query("UPDATE encryption_keys SET day_token = ? WHERE id = ?", [
        dayTokenFromIso(row.key_date),
        row.id,
      ]);
    }
  }

  // Ensure every key has a token (brand-new empty rows shouldn't exist).
  const today = dayTokenFromIso(new Date().toISOString().slice(0, 10));
  await pool.query(
    "UPDATE encryption_keys SET day_token = ? WHERE day_token IS NULL OR day_token = ''",
    [today],
  );
  await pool.query("ALTER TABLE encryption_keys MODIFY day_token CHAR(64) NOT NULL");

  try {
    await pool.query("ALTER TABLE encryption_keys DROP PRIMARY KEY");
  } catch {
    // Already switched.
  }
  try {
    await pool.query("ALTER TABLE encryption_keys ADD PRIMARY KEY (id)");
  } catch {
    // Already primary.
  }
  try {
    await pool.query("ALTER TABLE encryption_keys ADD UNIQUE KEY idx_day_token (day_token)");
  } catch {
    // Already unique.
  }

  await dropColumnsIfPresent(pool, "encryption_keys", ["key_date", "created_at"]);
}

async function swapKeyDateForKeyId(pool, table) {
  if (!(await columnExists(pool, table, "key_id"))) {
    await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN key_id INT UNSIGNED NULL`);
  }

  if (await columnExists(pool, table, "key_date")) {
    const [dated] = await pool.query(
      `SELECT id, DATE_FORMAT(key_date, '%Y-%m-%d') AS key_date
       FROM \`${table}\`
       WHERE key_id IS NULL AND key_date IS NOT NULL`,
    );
    for (const row of dated) {
      const token = dayTokenFromIso(row.key_date);
      const [keys] = await pool.query("SELECT id FROM encryption_keys WHERE day_token = ?", [token]);
      let keyId = keys[0]?.id;
      if (!keyId) {
        keyId = (await getTodayKey(pool)).keyId;
      }
      await pool.query(`UPDATE \`${table}\` SET key_id = ? WHERE id = ?`, [keyId, row.id]);
    }
  }

  const today = await getTodayKey(pool);
  await pool.query(`UPDATE \`${table}\` SET key_id = ? WHERE key_id IS NULL`, [today.keyId]);
  await pool.query(`ALTER TABLE \`${table}\` MODIFY key_id INT UNSIGNED NOT NULL`);
}

async function sealLogTimestamps(pool) {
  if (!(await columnExists(pool, "activity_logs", "month_token"))) {
    await pool.query("ALTER TABLE activity_logs ADD COLUMN month_token CHAR(64) NULL");
  }

  const hasCreated = await columnExists(pool, "activity_logs", "created_at");
  const hasKeyDate = await columnExists(pool, "activity_logs", "key_date");
  const [rows] = await pool.query(
    `SELECT id, payload_enc, payload_iv, payload_tag, key_id
            ${hasKeyDate ? ", key_date" : ", NULL AS key_date"}
            ${hasCreated ? ", created_at" : ""}
     FROM activity_logs
     WHERE month_token IS NULL OR month_token = ''`,
  );

  for (const row of rows) {
    let payload = {};
    try {
      payload = await decryptJson(pool, {
        ciphertext: row.payload_enc,
        iv: row.payload_iv,
        tag: row.payload_tag,
        keyId: row.key_id,
        keyDate: row.key_date,
      }) || {};
    } catch {
      payload = {};
    }

    let atIso = payload.at;
    if (!atIso && hasCreated && row.created_at) {
      const raw = row.created_at instanceof Date
        ? row.created_at.toISOString()
        : `${String(row.created_at).replace(" ", "T")}`;
      atIso = raw.includes("Z") || /[+-]\d\d:\d\d$/.test(raw) ? raw : `${raw}.000Z`;
    }
    if (!atIso) atIso = new Date().toISOString();

    const sealed = await encryptJson(pool, { ...payload, at: atIso });
    const when = new Date(atIso);
    const token = Number.isNaN(when.getTime()) ? monthToken() : monthToken(when);
    await pool.query(
      `UPDATE activity_logs
       SET payload_enc = ?, payload_iv = ?, payload_tag = ?, key_id = ?, month_token = ?
       WHERE id = ?`,
      [sealed.ciphertext, sealed.iv, sealed.tag, sealed.keyId, token, row.id],
    );
  }

  await pool.query(
    "UPDATE activity_logs SET month_token = ? WHERE month_token IS NULL OR month_token = ''",
    [monthToken()],
  );
  await pool.query("ALTER TABLE activity_logs MODIFY month_token CHAR(64) NOT NULL");
  try {
    await pool.query("ALTER TABLE activity_logs DROP INDEX idx_logs_created");
  } catch {
    // optional
  }
  try {
    await pool.query("ALTER TABLE activity_logs ADD INDEX idx_logs_month (month_token)");
  } catch {
    // optional
  }
}
