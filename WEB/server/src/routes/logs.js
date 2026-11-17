import { Router } from "express";
import { decryptJson } from "../crypto.js";
import { getDb } from "../db.js";
import { log, purgeExpiredLogs } from "../logger.js";

const CLIENT_EVENTS = {
  "report.download.excel": { category: "report", level: "info", label: "Downloaded an Excel report" },
  "report.download.pdf": { category: "report", level: "info", label: "Downloaded a PDF report" },
  "book.switch": { category: "book", level: "info", label: "Switched active book" },
  "ledger.copy": { category: "ledger", level: "info", label: "Copied a statement" },
  "ledger.copy.entry": { category: "ledger", level: "info", label: "Copied an entry" },
  "page.view": { category: "ui", level: "info", label: "Opened a page" },
};

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function wrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function readLimit(value) {
  const limit = Number(value ?? 100);
  if (!Number.isInteger(limit) || limit < 1) throw httpError(400, "Choose how many log rows to load.");
  return Math.min(limit, 500);
}

function readLevel(value) {
  if (value == null || value === "" || value === "all") return null;
  const level = String(value);
  if (!["info", "warn", "error", "security"].includes(level)) {
    throw httpError(400, "Choose info, warn, error, security, or all.");
  }
  return level;
}

function readCategory(value) {
  if (value == null || value === "" || value === "all") return null;
  const category = String(value).trim().slice(0, 32);
  if (!category) return null;
  return category;
}

export function logsRouter() {
  const router = Router();

  router.use(wrap(async (req, res, next) => {
    req.db = await getDb();
    next();
  }));

  router.get("/", wrap(async (req, res) => {
    await purgeExpiredLogs();
    const limit = readLimit(req.query.limit);
    const level = readLevel(req.query.level);
    const category = readCategory(req.query.category);

    // Payloads are sealed — decrypt in memory, then filter.
    const [rows] = await req.db.query(
      `SELECT id, payload_enc, payload_iv, payload_tag, key_id
       FROM activity_logs
       ORDER BY id DESC
       LIMIT 2000`,
    );

    const logs = [];
    let total = 0;
    for (const row of rows) {
      let payload;
      try {
        payload = await decryptJson(req.db, {
          ciphertext: row.payload_enc,
          iv: row.payload_iv,
          tag: row.payload_tag,
          keyId: row.key_id,
        });
      } catch {
        continue;
      }
      if (!payload) continue;
      if (level && payload.level !== level) continue;
      if (category && payload.category !== category) continue;
      total += 1;
      if (logs.length >= limit) continue;
      logs.push({
        id: row.id,
        at: payload.at || null,
        level: payload.level,
        category: payload.category,
        action: payload.action,
        message: payload.message,
        ip: payload.ip,
        meta: payload.meta ?? null,
      });
    }

    res.json({ total, logs });
  }));

  router.post("/event", wrap(async (req, res) => {
    const action = String(req.body?.action ?? "").trim();
    const known = CLIENT_EVENTS[action];
    if (!known) throw httpError(400, "That activity type is not recorded.");
    const message = String(req.body?.message ?? "").trim() || known.label;
    const meta = req.body?.meta && typeof req.body.meta === "object" ? req.body.meta : null;
    log({
      level: known.level,
      category: known.category,
      action,
      message,
      req,
      meta,
    });
    res.status(201).json({ ok: true });
  }));

  router.delete("/", wrap(async (req, res) => {
    await req.db.query("DELETE FROM activity_logs");
    log({
      level: "warn",
      category: "system",
      action: "logs.clear",
      message: "Activity log cleared from the database.",
      req,
    });
    res.json({ ok: true });
  }));

  return router;
}
