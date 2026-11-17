import { Router } from "express";
import { getDb } from "../db.js";
import { log } from "../logger.js";

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
    const limit = readLimit(req.query.limit);
    const level = readLevel(req.query.level);
    const category = readCategory(req.query.category);
    const clauses = [];
    const params = [];
    if (level) {
      clauses.push("level = ?");
      params.push(level);
    }
    if (category) {
      clauses.push("category = ?");
      params.push(category);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const [rows] = await req.db.query(
      `SELECT id, created_at, level, category, action, message, ip, meta
       FROM activity_logs
       ${where}
       ORDER BY id DESC
       LIMIT ?`,
      [...params, limit],
    );
    const [[{ total }]] = await req.db.query(
      `SELECT COUNT(*) AS total FROM activity_logs ${where}`,
      params,
    );
    res.json({
      total: Number(total),
      logs: rows.map((row) => ({
        id: row.id,
        at: row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at),
        level: row.level,
        category: row.category,
        action: row.action,
        message: row.message,
        ip: row.ip,
        meta: typeof row.meta === "string" ? JSON.parse(row.meta) : row.meta,
      })),
    });
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
