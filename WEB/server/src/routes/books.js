import { Router } from "express";
import { getDb } from "../db.js";
import { log } from "../logger.js";
import { paiseToAmount, toPaise } from "../../../shared/money.js";

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function wrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function assertName(value) {
  const name = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!name) throw httpError(400, "Enter a name for the book.");
  if (name.length > 100) throw httpError(400, "Keep the book name under 100 characters.");
  return name;
}

export function booksRouter() {
  const router = Router();

  router.use(wrap(async (req, res, next) => {
    req.db = await getDb();
    next();
  }));

  router.get("/", wrap(async (req, res) => {
    const [rows] = await req.db.query(
      `SELECT b.id, b.name, b.opening_balance, COUNT(t.id) AS entry_count
       FROM books b
       LEFT JOIN transactions t ON t.book_id = b.id
       GROUP BY b.id, b.name, b.opening_balance
       ORDER BY b.id ASC`,
    );
    res.json({
      books: rows.map((row) => ({
        id: row.id,
        name: row.name,
        openingBalance: paiseToAmount(toPaise(row.opening_balance) ?? 0),
        entryCount: Number(row.entry_count),
      })),
    });
  }));

  router.post("/", wrap(async (req, res) => {
    const name = assertName(req.body?.name);
    try {
      const [result] = await req.db.query("INSERT INTO books (name) VALUES (?)", [name]);
      log({
        level: "info",
        category: "book",
        action: "create",
        message: `Created book “${name}”.`,
        req,
        meta: { bookId: result.insertId, name },
      });
      res.status(201).json({ id: result.insertId, name, openingBalance: "0.00", entryCount: 0 });
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") throw httpError(409, "A book with that name already exists.");
      throw error;
    }
  }));

  router.put("/:id", wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw httpError(400, "That book could not be found.");
    const name = assertName(req.body?.name);
    try {
      const [result] = await req.db.query("UPDATE books SET name = ? WHERE id = ?", [name, id]);
      if (result.affectedRows === 0) throw httpError(404, "That book could not be found.");
      log({
        level: "info",
        category: "book",
        action: "rename",
        message: `Renamed book #${id} to “${name}”.`,
        req,
        meta: { bookId: id, name },
      });
      res.json({ id, name });
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") throw httpError(409, "A book with that name already exists.");
      throw error;
    }
  }));

  router.delete("/:id", wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw httpError(400, "That book could not be found.");
    const [[{ total }]] = await req.db.query("SELECT COUNT(*) AS total FROM books");
    if (total <= 1) throw httpError(400, "Keep at least one book.");
    const [[{ count }]] = await req.db.query("SELECT COUNT(*) AS count FROM transactions WHERE book_id = ?", [id]);
    if (count > 0) throw httpError(400, "This book still has entries in it. Move or delete them first.");
    const [[book]] = await req.db.query("SELECT name FROM books WHERE id = ?", [id]);
    const [result] = await req.db.query("DELETE FROM books WHERE id = ?", [id]);
    if (result.affectedRows === 0) throw httpError(404, "That book could not be found.");
    log({
      level: "warn",
      category: "book",
      action: "delete",
      message: `Deleted book “${book?.name ?? id}”.`,
      req,
      meta: { bookId: id, name: book?.name ?? null },
    });
    res.json({ ok: true });
  }));

  return router;
}
