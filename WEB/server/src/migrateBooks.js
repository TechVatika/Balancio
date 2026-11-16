async function tableExists(pool, table) {
  const [rows] = await pool.query(
    "SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
    [table],
  );
  return rows.length > 0;
}

/** One-time move of the old single `settings.opening_balance` row into the default "General" book. */
export async function migrateLegacySettings(pool) {
  if (!(await tableExists(pool, "settings"))) return;

  const [rows] = await pool.query("SELECT opening_balance FROM settings WHERE id = 1");
  if (rows.length) {
    await pool.query("UPDATE books SET opening_balance = ? WHERE id = 1", [rows[0].opening_balance]);
  }
  await pool.query("DROP TABLE settings");
  console.log("Moved the old opening balance into the General book and removed the legacy settings table.");
}
