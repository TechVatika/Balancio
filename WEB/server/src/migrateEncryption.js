import { encryptField, getTodayKey } from "./crypto.js";

async function columnExists(pool, table, column) {
  const [rows] = await pool.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  return rows.length > 0;
}

/** One-time move of any plaintext `description` rows into encrypted columns, then drops the old column. */
export async function migrateDescriptionEncryption(pool) {
  await getTodayKey(pool); // make sure today's key exists before we need it
  if (!(await columnExists(pool, "transactions", "description"))) return;

  const [rows] = await pool.query(
    "SELECT id, description FROM transactions WHERE description_enc IS NULL",
  );
  for (const row of rows) {
    const { ciphertext, iv, tag, keyDate } = await encryptField(pool, row.description ?? "");
    await pool.query(
      "UPDATE transactions SET description_enc = ?, description_iv = ?, description_tag = ?, key_date = ? WHERE id = ?",
      [ciphertext, iv, tag, keyDate, row.id],
    );
  }
  await pool.query("ALTER TABLE transactions DROP COLUMN description");
  if (rows.length) console.log(`Encrypted ${rows.length} existing description(s) and removed the old plain-text column.`);
}
