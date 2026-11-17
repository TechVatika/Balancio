import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "./db.js";
import { clientAgent, clientIp } from "./loginLock.js";

const LEVELS = new Set(["info", "warn", "error", "security"]);
/** All Balancio .log files live in WEB/logs/ (one folder for activity + any diverted process logs). */
const LOG_DIR = fileURLToPath(new URL("../../logs", import.meta.url));
const MAX_MESSAGE = 500;

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

function stamp() {
  return new Date().toISOString();
}

function dayFile() {
  const day = stamp().slice(0, 10);
  return path.join(LOG_DIR, `balancio-${day}.log`);
}

function clip(value, max = MAX_MESSAGE) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function appendFileLog(entry) {
  try {
    ensureLogDir();
    const line = JSON.stringify({
      at: stamp(),
      level: entry.level,
      category: entry.category,
      action: entry.action,
      message: entry.message,
      ip: entry.ip || undefined,
      meta: entry.meta || undefined,
    });
    fs.appendFileSync(dayFile(), `${line}\n`, "utf8");
  } catch {
    // File logging must never break the app.
  }
}

function consoleLine(entry) {
  const prefix = `[${entry.level}] ${entry.category}.${entry.action}`;
  const ip = entry.ip ? ` ip=${entry.ip}` : "";
  const line = `${prefix}${ip} ${entry.message}`;
  if (entry.level === "error") console.error(line);
  else if (entry.level === "warn" || entry.level === "security") console.warn(line);
  else console.log(line);
}

/**
 * Persist an activity log to MySQL + daily file + console.
 * Never throws — logging failures are swallowed.
 */
export async function writeLog({
  level = "info",
  category = "system",
  action,
  message,
  ip = null,
  meta = null,
  req = null,
} = {}) {
  const agent = req ? clientAgent(req) : null;
  const baseMeta = meta && typeof meta === "object" ? { ...meta } : {};
  if (agent && baseMeta.userAgent == null) baseMeta.userAgent = agent;
  const entry = {
    level: LEVELS.has(level) ? level : "info",
    category: clip(category, 32) || "system",
    action: clip(action, 64) || "unknown",
    message: clip(message) || "—",
    ip: ip || (req ? clientIp(req) : null),
    meta: Object.keys(baseMeta).length ? baseMeta : null,
  };

  consoleLine(entry);
  appendFileLog(entry);

  try {
    const db = await getDb();
    await db.query(
      `INSERT INTO activity_logs (level, category, action, message, ip, meta)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        entry.level,
        entry.category,
        entry.action,
        entry.message,
        entry.ip,
        entry.meta ? JSON.stringify(entry.meta) : null,
      ],
    );
  } catch {
    // DB may be down during early boot or outages — file/console already have it.
  }

  return entry;
}

/** Fire-and-forget helper for route handlers. */
export function log(options) {
  writeLog(options).catch(() => {});
}
