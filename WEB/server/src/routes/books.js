import { Router } from "express";
import { getDb } from "../db.js";
import { decryptJson, encryptJson } from "../crypto.js";
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

async function decodeBook(db, row) {
  const payload = await decryptJson(db, {
    ciphertext: row.payload_enc,
    iv: row.payload_iv,
    tag: row.payload_tag,
    keyId: row.key_id,
  });
  return {
    id: row.id,
    name: String(payload?.name ?? "Book"),
    openingBalance: paiseToAmount(toPaise(payload?.openingBalance ?? "0.00") ?? 0),
  };
}

async function listDecodedBooks(db) {
  const [rows] = await db.query(
    "SELECT id, payload_enc, payload_iv, payload_tag, key_id FROM books ORDER BY id ASC",
  );
  const books = [];
  for (const row of rows) {
    books.push(await decodeBook(db, row));
  }
  return books;
}

export function booksRouter() {
  const router = Router();

  router.use(wrap(async (req, res, next) => {
    req.db = await getDb();
    next();
  }));

  router.get("/", wrap(async (req, res) => {
    const books = await listDecodedBooks(req.db);
    const [counts] = await req.db.query(
      `SELECT book_id, COUNT(*) AS entry_count
       FROM transactions
       GROUP BY book_id`,
    );
    const countByBook = new Map(counts.map((row) => [Number(row.book_id), Number(row.entry_count)]));
    res.json({
      books: books.map((book) => ({
        ...book,
        entryCount: countByBook.get(book.id) ?? 0,
      })),
    });
  }));

  router.post("/", wrap(async (req, res) => {
    const name = assertName(req.body?.name);
    const existing = await listDecodedBooks(req.db);
    if (existing.some((book) => book.name.toLowerCase() === name.toLowerCase())) {
      throw httpError(409, "A book with that name already exists.");
    }
    const sealed = await encryptJson(req.db, { name, openingBalance: "0.00" });
    const [result] = await req.db.query(
      `INSERT INTO books (payload_enc, payload_iv, payload_tag, key_id)
       VALUES (?, ?, ?, ?)`,
      [sealed.ciphertext, sealed.iv, sealed.tag, sealed.keyId],
    );
    log({
      level: "info",
      category: "book",
      action: "create",
      message: `Created book #${result.insertId}.`,
      req,
      meta: { bookId: result.insertId },
    });
    res.status(201).json({ id: result.insertId, name, openingBalance: "0.00", entryCount: 0 });
  }));

  router.put("/:id", wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw httpError(400, "That book could not be found.");
    const name = assertName(req.body?.name);
    const books = await listDecodedBooks(req.db);
    const current = books.find((book) => book.id === id);
    if (!current) throw httpError(404, "That book could not be found.");
    if (books.some((book) => book.id !== id && book.name.toLowerCase() === name.toLowerCase())) {
      throw httpError(409, "A book with that name already exists.");
    }
    const sealed = await encryptJson(req.db, {
      name,
      openingBalance: current.openingBalance,
    });
    await req.db.query(
      `UPDATE books
       SET payload_enc = ?, payload_iv = ?, payload_tag = ?, key_id = ?
       WHERE id = ?`,
      [sealed.ciphertext, sealed.iv, sealed.tag, sealed.keyId, id],
    );
    log({
      level: "info",
      category: "book",
      action: "rename",
      message: `Renamed book #${id}.`,
      req,
      meta: { bookId: id },
    });
    res.json({ id, name });
  }));

  router.delete("/:id", wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw httpError(400, "That book could not be found.");
    const [[{ total }]] = await req.db.query("SELECT COUNT(*) AS total FROM books");
    if (total <= 1) throw httpError(400, "Keep at least one book.");
    const [[{ count }]] = await req.db.query("SELECT COUNT(*) AS count FROM transactions WHERE book_id = ?", [id]);
    if (count > 0) throw httpError(400, "This book still has entries in it. Move or delete them first.");
    const [result] = await req.db.query("DELETE FROM books WHERE id = ?", [id]);
    if (result.affectedRows === 0) throw httpError(404, "That book could not be found.");
    log({
      level: "warn",
      category: "book",
      action: "delete",
      message: `Deleted book #${id}.`,
      req,
      meta: { bookId: id },
    });
    res.json({ ok: true });
  }));

  return router;
}
