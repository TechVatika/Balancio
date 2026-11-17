import { decryptField, encryptJson, getTodayKey } from "./crypto.js";

async function columnExists(pool, table, column) {
  const [rows] = await pool.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  return rows.length > 0;
}

async function ensurePayloadColumns(pool, table, encSize) {
  if (!(await columnExists(pool, table, "payload_enc"))) {
    await pool.query(
      `ALTER TABLE \`${table}\`
       ADD COLUMN payload_enc VARBINARY(${encSize}) NULL,
       ADD COLUMN payload_iv BINARY(12) NULL,
       ADD COLUMN payload_tag BINARY(16) NULL`,
    );
  }
  if (!(await columnExists(pool, table, "key_id"))) {
    await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN key_id INT UNSIGNED NULL`);
  }
}

async function dropColumnsIfPresent(pool, table, columns) {
  for (const column of columns) {
    if (await columnExists(pool, table, column)) {
      await pool.query(`ALTER TABLE \`${table}\` DROP COLUMN \`${column}\``);
    }
  }
}

async function sealTransactions(pool) {
  await ensurePayloadColumns(pool, "transactions", 4000);
  const hasLegacyDate = await columnExists(pool, "transactions", "txn_date");
  if (!hasLegacyDate) return;

  const hasDescEnc = await columnExists(pool, "transactions", "description_enc");
  const [rows] = await pool.query(
    `SELECT id,
            DATE_FORMAT(txn_date, '%Y-%m-%d') AS txn_date,
            credit, debit,
            ${hasDescEnc ? "description_enc, description_iv, description_tag, key_date" : "NULL AS description_enc, NULL AS description_iv, NULL AS description_tag, NULL AS key_date"}
     FROM transactions
     WHERE payload_enc IS NULL`,
  );

  for (const row of rows) {
    let description = "";
    if (row.description_enc) {
      description = await decryptField(pool, {
        ciphertext: row.description_enc,
        iv: row.description_iv,
        tag: row.description_tag,
        keyDate: row.key_date,
      });
    }
    const sealed = await encryptJson(pool, {
      date: row.txn_date,
      description,
      credit: String(row.credit ?? "0.00"),
      debit: String(row.debit ?? "0.00"),
    });
    await pool.query(
      `UPDATE transactions
       SET payload_enc = ?, payload_iv = ?, payload_tag = ?, key_id = ?
       WHERE id = ?`,
      [sealed.ciphertext, sealed.iv, sealed.tag, sealed.keyId, row.id],
    );
  }

  await dropColumnsIfPresent(pool, "transactions", [
    "txn_date",
    "credit",
    "debit",
    "description",
    "description_enc",
    "description_iv",
    "description_tag",
  ]);
  await pool.query("ALTER TABLE transactions MODIFY payload_enc VARBINARY(4000) NOT NULL");
  await pool.query("ALTER TABLE transactions MODIFY payload_iv BINARY(12) NOT NULL");
  await pool.query("ALTER TABLE transactions MODIFY payload_tag BINARY(16) NOT NULL");
  if (rows.length) console.log(`Sealed ${rows.length} transaction(s) — dates, amounts, and text are ciphertext.`);
}

async function sealBooks(pool) {
  await ensurePayloadColumns(pool, "books", 2000);
  const hasName = await columnExists(pool, "books", "name");
  if (!hasName) {
    const [[{ total }]] = await pool.query("SELECT COUNT(*) AS total FROM books");
    if (Number(total) === 0) {
      const sealed = await encryptJson(pool, { name: "General", openingBalance: "0.00" });
      await pool.query(
        `INSERT INTO books (id, payload_enc, payload_iv, payload_tag, key_id)
         VALUES (1, ?, ?, ?, ?)`,
        [sealed.ciphertext, sealed.iv, sealed.tag, sealed.keyId],
      );
    }
    return;
  }

  const [rows] = await pool.query(
    "SELECT id, name, opening_balance FROM books WHERE payload_enc IS NULL",
  );
  for (const row of rows) {
    const sealed = await encryptJson(pool, {
      name: row.name,
      openingBalance: String(row.opening_balance ?? "0.00"),
    });
    await pool.query(
      `UPDATE books
       SET payload_enc = ?, payload_iv = ?, payload_tag = ?, key_id = ?
       WHERE id = ?`,
      [sealed.ciphertext, sealed.iv, sealed.tag, sealed.keyId, row.id],
    );
  }

  // Drop unique name index before dropping the column.
  try {
    await pool.query("ALTER TABLE books DROP INDEX idx_book_name");
  } catch {
    // Index may already be gone.
  }
  await dropColumnsIfPresent(pool, "books", ["name", "opening_balance"]);
  await pool.query("ALTER TABLE books MODIFY payload_enc VARBINARY(2000) NOT NULL");
  await pool.query("ALTER TABLE books MODIFY payload_iv BINARY(12) NOT NULL");
  await pool.query("ALTER TABLE books MODIFY payload_tag BINARY(16) NOT NULL");
  if (rows.length) console.log(`Sealed ${rows.length} book(s) — names and opening balances are ciphertext.`);
}

async function sealActivityLogs(pool) {
  await ensurePayloadColumns(pool, "activity_logs", 8000);
  const hasMessage = await columnExists(pool, "activity_logs", "message");
  if (!hasMessage) return;

  const [rows] = await pool.query(
    `SELECT id, level, category, action, message, ip, meta
     FROM activity_logs
     WHERE payload_enc IS NULL`,
  );
  for (const row of rows) {
    let meta = row.meta;
    if (typeof meta === "string") {
      try {
        meta = JSON.parse(meta);
      } catch {
        meta = null;
      }
    }
    const sealed = await encryptJson(pool, {
      level: row.level,
      category: row.category,
      action: row.action,
      message: row.message,
      ip: row.ip,
      meta,
    });
    await pool.query(
      `UPDATE activity_logs
       SET payload_enc = ?, payload_iv = ?, payload_tag = ?, key_id = ?
       WHERE id = ?`,
      [sealed.ciphertext, sealed.iv, sealed.tag, sealed.keyId, row.id],
    );
  }

  await dropColumnsIfPresent(pool, "activity_logs", [
    "level",
    "category",
    "action",
    "message",
    "ip",
    "meta",
  ]);
  // Rows with no payload yet should not exist; make sealed columns required when table has data.
  const [[{ total }]] = await pool.query("SELECT COUNT(*) AS total FROM activity_logs");
  if (Number(total) > 0) {
    await pool.query("ALTER TABLE activity_logs MODIFY payload_enc VARBINARY(8000) NOT NULL");
    await pool.query("ALTER TABLE activity_logs MODIFY payload_iv BINARY(12) NOT NULL");
    await pool.query("ALTER TABLE activity_logs MODIFY payload_tag BINARY(16) NOT NULL");
  }
  if (rows.length) console.log(`Sealed ${rows.length} activity log row(s).`);
}

/**
 * Move all sensitive columns into AES-GCM sealed payloads so MySQL only exposes ids
 * (and book_id for routing). Dates live inside the ciphertext.
 */
export async function migrateSealedStorage(pool) {
  await getTodayKey(pool);
  await sealTransactions(pool);
  await sealBooks(pool);
  await sealActivityLogs(pool);
}
