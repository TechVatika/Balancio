import fs from "node:fs";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });

function dbConfig() {
  const host = process.env.DB_HOST || "127.0.0.1";
  const port = Number(process.env.DB_PORT || 3306);
  const user = process.env.DB_USER || "root";
  const password = process.env.DB_PASSWORD ?? "";
  const database = process.env.DB_NAME || "balancio";
  if (!/^[A-Za-z0-9_]+$/.test(database)) {
    throw new Error("DB_NAME may only contain letters, numbers, and underscores.");
  }
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("DB_PORT is not a valid port.");
  }
  return { host, port, user, password, database };
}

async function openPool() {
  const config = dbConfig();
  const bootstrap = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
  });
  await bootstrap.query(
    `CREATE DATABASE IF NOT EXISTS \`${config.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await bootstrap.end();

  const pool = mysql.createPool({
    ...config,
    waitForConnections: true,
    connectionLimit: 10,
    dateStrings: true,
    charset: "utf8mb4",
  });

  const sql = fs.readFileSync(new URL("../schema.sql", import.meta.url), "utf8");
  const statements = sql
    .replace(/^\s*--.*$/gm, "")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
  for (const statement of statements) {
    await pool.query(statement);
  }
  const { migrateLegacySettings } = await import("./migrateBooks.js");
  await migrateLegacySettings(pool);
  const { migrateDescriptionEncryption } = await import("./migrateEncryption.js");
  await migrateDescriptionEncryption(pool);
  return pool;
}

let pool = null;
let opening = null;

export function getDb() {
  if (pool) return Promise.resolve(pool);
  if (!opening) {
    opening = openPool()
      .then((next) => {
        pool = next;
        return next;
      })
      .finally(() => {
        opening = null;
      });
  }
  return opening;
}

export function dropDb() {
  const current = pool;
  pool = null;
  if (current) current.end().catch(() => {});
}

export function databaseErrorMessage(error) {
  if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND" || error.code === "ETIMEDOUT") {
    return "MySQL is not running. Start MySQL, then refresh. Balancio uses 127.0.0.1 port 3306 unless web/server/.env says otherwise.";
  }
  if (error.code === "ER_ACCESS_DENIED_ERROR") {
    return "MySQL refused the username or password. Set DB_USER and DB_PASSWORD in web/server/.env, then refresh.";
  }
  return error.message || "Could not open the MySQL database.";
}

export function isDatabaseError(error) {
  return ["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "ER_ACCESS_DENIED_ERROR", "PROTOCOL_CONNECTION_LOST"].includes(error.code);
}
