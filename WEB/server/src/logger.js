import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dayToken, encryptJson, monthToken, sealWithMaster } from "./crypto.js";
import { getDb } from "./db.js";
import { clientAgent, clientIp } from "./loginLock.js";

const LEVELS = new Set(["info", "warn", "error", "security"]);
/** All Balancio .log files live in WEB/logs/ (one folder for activity + any diverted process logs). */
const LOG_DIR = fileURLToPath(new URL("../../logs", import.meta.url));
const MAX_MESSAGE = 500;
const PURGE_COOLDOWN_MS = 60 * 60 * 1000;
let lastPurgeAt = 0;

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

/** First instant of the current local calendar month — older logs are removed. */
function currentMonthStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

function currentYearMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function purgeOldLogFiles(monthStart) {
  let removed = 0;
  if (!fs.existsSync(LOG_DIR)) return removed;
  for (const name of fs.readdirSync(LOG_DIR)) {
    if (!name.endsWith(".log")) continue;
    const full = path.join(LOG_DIR, name);
    // Opaque balancio-*.log names: drop files whose mtime is before this month.
    let drop = false;
    try {
      drop = fs.statSync(full).mtime < monthStart;
    } catch {
      drop = false;
    }
    if (!drop) continue;
    try {
      fs.unlinkSync(full);
      removed += 1;
    } catch {
      // Skip locked/unreadable files.
    }
  }
  return removed;
}

/**
 * Drop MySQL activity rows and WEB/logs files from previous calendar months.
 * Safe to call often; runs at most once per hour unless force is set.
 */
export async function purgeExpiredLogs({ force = false } = {}) {
  const now = Date.now();
  if (!force && now - lastPurgeAt < PURGE_COOLDOWN_MS) return { rows: 0, files: 0 };
  lastPurgeAt = now;

  let rows = 0;
  try {
    const db = await getDb();
    const keep = monthToken();
    const [result] = await db.query(
      "DELETE FROM activity_logs WHERE month_token <> ?",
      [keep],
    );
    rows = Number(result?.affectedRows ?? 0);
  } catch {
    // DB may be unavailable during boot.
  }

  const files = purgeOldLogFiles(currentMonthStart());

  if (rows > 0 || files > 0) {
    writeLog({
      level: "info",
      category: "system",
      action: "logs.month_purge",
      message: `Cleared previous-month logs (${rows} database ${rows === 1 ? "row" : "rows"}, ${files} ${files === 1 ? "file" : "files"}).`,
      meta: { rows, files, keptFrom: currentYearMonth() },
    }).catch(() => {});
  }

  return { rows, files };
}

function stamp() {
  return new Date().toISOString();
}

function dayFile() {
  // Filename uses an opaque day token — not a readable calendar date.
  return path.join(LOG_DIR, `balancio-${dayToken()}.log`);
}

function clip(value, max = MAX_MESSAGE) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function appendFileLog(entry) {
  try {
    ensureLogDir();
    const sealed = sealWithMaster(Buffer.from(JSON.stringify({
      at: stamp(),
      level: entry.level,
      category: entry.category,
      action: entry.action,
      message: entry.message,
      ip: entry.ip || undefined,
      meta: entry.meta || undefined,
    }), "utf8"));
    // On-disk lines are ciphertext only — open with MASTER_KEY if you need recovery.
    const line = JSON.stringify({
      v: 1,
      enc: sealed.ciphertext.toString("base64"),
      iv: sealed.iv.toString("base64"),
      tag: sealed.tag.toString("base64"),
    });
    fs.appendFileSync(dayFile(), `${line}\n`, "utf8");
  } catch {
    // File logging must never break the app.
  }
}

function consoleLine(entry) {
  // Console must not print amounts, descriptions, or IPs — only opaque action labels.
  const line = `[${entry.level}] ${entry.category}.${entry.action}`;
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
    const at = stamp();
    const sealed = await encryptJson(db, {
      at,
      level: entry.level,
      category: entry.category,
      action: entry.action,
      message: entry.message,
      ip: entry.ip,
      meta: entry.meta,
    });
    await db.query(
      `INSERT INTO activity_logs (payload_enc, payload_iv, payload_tag, key_id, month_token)
       VALUES (?, ?, ?, ?, ?)`,
      [sealed.ciphertext, sealed.iv, sealed.tag, sealed.keyId, monthToken()],
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
