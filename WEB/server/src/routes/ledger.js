import { Router } from "express";
import { getDb } from "../db.js";
import { decryptField, encryptField } from "../crypto.js";
import { log } from "../logger.js";
import { paiseToAmount, toPaise, toUnsignedPaise } from "../../../shared/money.js";
import { fyBounds, fyLabel, fyStartFromIso, monthName, parseDate } from "../../../shared/statement.js";

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function wrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function localToday() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { year, month, iso };
}

function shiftMonth(year, month, delta) {
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

function monthBounds(year, month) {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, "0");
  return {
    from: `${year}-${mm}-01`,
    to: `${year}-${mm}-${String(last).padStart(2, "0")}`,
  };
}

function publicRow(row) {
  return {
    id: row.id,
    date: row.date,
    description: row.description,
    credit: row.credit,
    debit: row.debit,
    balance: row.balance,
  };
}

function readBookId(value) {
  const bookId = Number(value ?? 1);
  if (!Number.isInteger(bookId) || bookId <= 0) throw httpError(400, "Choose a valid book.");
  return bookId;
}

async function loadBook(db, bookId) {
  const [books] = await db.query("SELECT opening_balance FROM books WHERE id = ?", [bookId]);
  if (!books.length) throw httpError(404, "That book could not be found.");
  const openingPaise = toPaise(books[0].opening_balance);
  if (openingPaise == null) throw new Error("The opening balance is stored in an unexpected format.");

  const [txns] = await db.query(
    `SELECT id, DATE_FORMAT(txn_date, '%Y-%m-%d') AS txn_date,
            description_enc, description_iv, description_tag, key_date, credit, debit
     FROM transactions
     WHERE book_id = ?
     ORDER BY txn_date ASC, id ASC`,
    [bookId],
  );

  let balancePaise = openingPaise;
  const rows = [];
  for (const txn of txns) {
    const creditPaise = toPaise(txn.credit);
    const debitPaise = toPaise(txn.debit);
    if (creditPaise == null || debitPaise == null) {
      throw new Error(`Entry ${txn.id} has an amount that could not be read.`);
    }
    balancePaise += creditPaise - debitPaise;
    const description = await decryptField(db, {
      ciphertext: txn.description_enc,
      iv: txn.description_iv,
      tag: txn.description_tag,
      keyDate: txn.key_date,
    });
    rows.push({
      id: txn.id,
      date: txn.txn_date,
      description,
      credit: paiseToAmount(creditPaise),
      debit: paiseToAmount(debitPaise),
      balance: paiseToAmount(balancePaise),
      creditPaise,
      debitPaise,
      balancePaise,
    });
  }

  return { openingPaise, closingPaise: balancePaise, rows };
}

function yearList(book, extraYear) {
  const years = new Set([localToday().year]);
  if (extraYear) years.add(extraYear);
  for (const row of book.rows) years.add(Number(row.date.slice(0, 4)));
  return [...years].sort((a, b) => b - a);
}

function fyList(book, extraFy) {
  const fys = new Set([fyStartFromIso(localToday().iso)]);
  if (extraFy != null) fys.add(extraFy);
  for (const row of book.rows) fys.add(fyStartFromIso(row.date));
  return [...fys].sort((a, b) => b - a);
}

function sliceBook(book, from, to) {
  const earlier = book.rows.filter((row) => row.date < from);
  const broughtPaise = earlier.length ? earlier[earlier.length - 1].balancePaise : book.openingPaise;
  const rows = book.rows.filter((row) => row.date >= from && row.date <= to);
  const creditPaise = rows.reduce((sum, row) => sum + row.creditPaise, 0);
  const debitPaise = rows.reduce((sum, row) => sum + row.debitPaise, 0);
  const closingPaise = rows.length ? rows[rows.length - 1].balancePaise : broughtPaise;
  return {
    broughtForward: paiseToAmount(broughtPaise),
    closingBalance: paiseToAmount(closingPaise),
    totals: {
      credit: paiseToAmount(creditPaise),
      debit: paiseToAmount(debitPaise),
      net: paiseToAmount(creditPaise - debitPaise),
      count: rows.length,
    },
    rows: rows.map(publicRow),
  };
}

function assertEntry(body) {
  if (!body || typeof body !== "object") throw httpError(400, "That entry could not be read.");
  const date = parseDate(body.date);
  if (!date) throw httpError(400, "Enter a valid date.");
  const description = String(body.description ?? "").replace(/\s+/g, " ").trim();
  if (!description) throw httpError(400, "Enter a description.");
  if (description.length > 500) throw httpError(400, "Keep the description under 500 characters.");

  const creditPaise = toUnsignedPaise(body.credit ?? 0);
  const debitPaise = toUnsignedPaise(body.debit ?? 0);
  if (creditPaise == null || debitPaise == null) throw httpError(400, "Enter amounts as numbers.");
  if (creditPaise > 0 && debitPaise > 0) throw httpError(400, "An entry can be a credit or a debit, not both.");
  if (creditPaise === 0 && debitPaise === 0) throw httpError(400, "Enter an amount.");

  return {
    date,
    description,
    credit: paiseToAmount(creditPaise),
    debit: paiseToAmount(debitPaise),
  };
}

function matchesSide(row, side) {
  if (side === "in") return row.credit !== "0.00";
  if (side === "out") return row.debit !== "0.00";
  return true;
}

function readSide(value) {
  if (value == null || value === "" || value === "all") return "all";
  if (value === "in" || value === "out") return value;
  throw httpError(400, "Choose all lines, money in, or money out.");
}

function readBound(value, label) {
  if (value == null || String(value).trim() === "") return null;
  const date = parseDate(value);
  if (!date) throw httpError(400, `Choose a valid ${label}.`);
  return date;
}

function sumPublic(rows) {
  let credit = 0;
  let debit = 0;
  for (const row of rows) {
    credit += toPaise(row.credit) ?? 0;
    debit += toPaise(row.debit) ?? 0;
  }
  return {
    credit: paiseToAmount(credit),
    debit: paiseToAmount(debit),
    net: paiseToAmount(credit - debit),
    count: rows.length,
  };
}

function monthKeys(from, to) {
  const keys = [];
  let year = Number(from.slice(0, 4));
  let month = Number(from.slice(5, 7));
  const endYear = Number(to.slice(0, 4));
  const endMonth = Number(to.slice(5, 7));
  while (year < endYear || (year === endYear && month <= endMonth)) {
    keys.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
    if (keys.length > 36) return null;
  }
  return keys;
}

function buildMonths(book, from, to, side) {
  const slice = sliceBook(book, from, to);
  const grouped = new Map();
  for (const row of slice.rows) {
    if (!matchesSide(row, side)) continue;
    const key = row.date.slice(0, 7);
    const list = grouped.get(key);
    if (list) list.push(row);
    else grouped.set(key, [row]);
  }
  const span = monthKeys(from, to);
  const keys = span ?? [...grouped.keys()].sort();
  const months = [];
  for (const key of keys) {
    const rows = grouped.get(key) ?? [];
    if (!span && rows.length === 0) continue;
    const [year, month] = key.split("-").map(Number);
    const bounds = monthBounds(year, month);
    const monthSlice = sliceBook(book, bounds.from, bounds.to);
    const creditPaise = rows.reduce((sum, row) => sum + (toPaise(row.credit) ?? 0), 0);
    const debitPaise = rows.reduce((sum, row) => sum + (toPaise(row.debit) ?? 0), 0);
    months.push({
      year,
      month,
      label: `${monthName(month)} ${year}`,
      credit: paiseToAmount(creditPaise),
      debit: paiseToAmount(debitPaise),
      net: paiseToAmount(creditPaise - debitPaise),
      count: rows.length,
      closingBalance: monthSlice.closingBalance,
    });
  }
  if (months.every((month) => month.count === 0)) return [];
  if (side !== "all") return months.filter((month) => month.count > 0);
  return months;
}

function readPeriod(query) {
  const year = Number(query.year);
  const hasMonth = query.month != null && query.month !== "";
  const month = hasMonth ? Number(query.month) : null;
  if (!Number.isInteger(year) || year < 1990 || year > 2100) throw httpError(400, "Choose a valid year.");
  if (month != null && (!Number.isInteger(month) || month < 1 || month > 12)) {
    throw httpError(400, "Choose a valid month.");
  }
  return { year, month };
}

export function ledgerRouter() {
  const router = Router();

  router.use(wrap(async (req, res, next) => {
    req.db = await getDb();
    next();
  }));

  router.get("/health", (req, res) => {
    res.json({ ok: true });
  });

  router.get("/meta", wrap(async (req, res) => {
    const bookId = readBookId(req.query.book);
    const book = await loadBook(req.db, bookId);
    res.json({
      openingBalance: paiseToAmount(book.openingPaise),
      balance: paiseToAmount(book.closingPaise),
      years: yearList(book),
      fys: fyList(book),
    });
  }));

  router.get("/overview", wrap(async (req, res) => {
    const bookId = readBookId(req.query.book);
    const book = await loadBook(req.db, bookId);
    const today = localToday();
    const bounds = monthBounds(today.year, today.month);
    const monthSlice = sliceBook(book, bounds.from, bounds.to);
    const fyStart = fyStartFromIso(today.iso);
    const fyRange = fyBounds(fyStart);
    const yearSlice = sliceBook(book, fyRange.from, fyRange.to);
    const recent = [...book.rows].sort((a, b) => b.id - a.id).slice(0, 6).map(publicRow);
    const previousPoint = shiftMonth(today.year, today.month, -1);
    const previousBounds = monthBounds(previousPoint.year, previousPoint.month);
    const previousSlice = sliceBook(book, previousBounds.from, previousBounds.to);
    const trend = [];
    for (let offset = 5; offset >= 0; offset -= 1) {
      const point = shiftMonth(today.year, today.month, -offset);
      const range = monthBounds(point.year, point.month);
      const slice = sliceBook(book, range.from, range.to);
      trend.push({
        year: point.year,
        month: point.month,
        label: monthName(point.month).slice(0, 3),
        credit: slice.totals.credit,
        debit: slice.totals.debit,
      });
    }
    res.json({
      openingBalance: paiseToAmount(book.openingPaise),
      balance: paiseToAmount(book.closingPaise),
      entryCount: book.rows.length,
      today,
      month: { year: today.year, month: today.month, label: `${monthName(today.month)} ${today.year}`, ...monthSlice },
      year: { year: fyStart, label: fyLabel(fyStart), ...yearSlice },
      previous: {
        year: previousPoint.year,
        month: previousPoint.month,
        label: `${monthName(previousPoint.month)} ${previousPoint.year}`,
        totals: previousSlice.totals,
      },
      trend,
      recent,
    });
  }));

  router.get("/ledger", wrap(async (req, res) => {
    const { year, month } = readPeriod(req.query);
    const bookId = readBookId(req.query.book);
    const book = await loadBook(req.db, bookId);
    const range = month
      ? monthBounds(year, month)
      : fyBounds(year);
    const slice = sliceBook(book, range.from, range.to);
    res.json({
      year,
      month,
      label: month ? `${monthName(month)} ${year}` : fyLabel(year),
      years: month ? yearList(book, year) : fyList(book, year),
      openingBalance: paiseToAmount(book.openingPaise),
      ...slice,
    });
  }));

  router.get("/report", wrap(async (req, res) => {
    let from = readBound(req.query.from, "start date");
    let to = readBound(req.query.to, "end date");
    if ((from == null) !== (to == null)) throw httpError(400, "Choose both a start date and an end date.");
    const side = readSide(req.query.side);
    const bookId = readBookId(req.query.book);
    const book = await loadBook(req.db, bookId);
    if (from == null) {
      const today = localToday().iso;
      from = book.rows[0]?.date ?? today;
      to = book.rows.length ? book.rows[book.rows.length - 1].date : from;
      if (to < from) to = from;
    }
    if (from > to) throw httpError(400, "The start date has to be on or before the end date.");
    const slice = sliceBook(book, from, to);
    const rows = slice.rows.filter((row) => matchesSide(row, side));
    res.json({
      from,
      to,
      side,
      broughtForward: slice.broughtForward,
      closingBalance: slice.closingBalance,
      totals: sumPublic(rows),
      rows,
      months: buildMonths(book, from, to, side),
    });
  }));

  router.put("/settings", wrap(async (req, res) => {
    const bookId = readBookId(req.body?.bookId);
    const paise = toPaise(req.body?.openingBalance);
    if (paise == null) throw httpError(400, "Enter the opening balance as a number.");
    const amount = paiseToAmount(paise);
    const [result] = await req.db.query("UPDATE books SET opening_balance = ? WHERE id = ?", [amount, bookId]);
    if (result.affectedRows === 0) throw httpError(404, "That book could not be found.");
    log({
      level: "info",
      category: "ledger",
      action: "opening.update",
      message: `Opening balance set to ${amount} for book #${bookId}.`,
      req,
      meta: { bookId, openingBalance: amount },
    });
    res.json({ openingBalance: amount });
  }));

  router.post("/transactions", wrap(async (req, res) => {
    const bookId = readBookId(req.body?.bookId);
    const entry = assertEntry(req.body);
    const sealed = await encryptField(req.db, entry.description);
    const [result] = await req.db.query(
      `INSERT INTO transactions (book_id, txn_date, description_enc, description_iv, description_tag, key_date, credit, debit)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [bookId, entry.date, sealed.ciphertext, sealed.iv, sealed.tag, sealed.keyDate, entry.credit, entry.debit],
    );
    log({
      level: "info",
      category: "ledger",
      action: "entry.create",
      message: `Added entry #${result.insertId} on ${entry.date}.`,
      req,
      meta: {
        bookId,
        entryId: result.insertId,
        date: entry.date,
        credit: entry.credit,
        debit: entry.debit,
      },
    });
    res.status(201).json({ id: result.insertId, ...entry });
  }));

  router.post("/transactions/bulk", wrap(async (req, res) => {
    const bookId = readBookId(req.body?.bookId);
    const entries = req.body?.entries;
    if (!Array.isArray(entries) || entries.length === 0) throw httpError(400, "Nothing to add.");
    if (entries.length > 500) throw httpError(400, "Paste up to 500 lines at a time.");
    const clean = entries.map(assertEntry);
    const sealed = await Promise.all(clean.map((entry) => encryptField(req.db, entry.description)));
    const connection = await req.db.getConnection();
    try {
      await connection.beginTransaction();
      for (let index = 0; index < clean.length; index += 1) {
        const entry = clean[index];
        const seal = sealed[index];
        await connection.query(
          `INSERT INTO transactions (book_id, txn_date, description_enc, description_iv, description_tag, key_date, credit, debit)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [bookId, entry.date, seal.ciphertext, seal.iv, seal.tag, seal.keyDate, entry.credit, entry.debit],
        );
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    log({
      level: "info",
      category: "ledger",
      action: "entry.bulk",
      message: `Pasted ${clean.length} entries into book #${bookId}.`,
      req,
      meta: { bookId, added: clean.length },
    });
    res.status(201).json({ added: clean.length });
  }));

  router.put("/transactions/:id", wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw httpError(400, "That entry could not be found.");
    const entry = assertEntry(req.body);
    const sealed = await encryptField(req.db, entry.description);
    const [result] = await req.db.query(
      `UPDATE transactions
       SET txn_date = ?, description_enc = ?, description_iv = ?, description_tag = ?, key_date = ?, credit = ?, debit = ?
       WHERE id = ?`,
      [entry.date, sealed.ciphertext, sealed.iv, sealed.tag, sealed.keyDate, entry.credit, entry.debit, id],
    );
    if (result.affectedRows === 0) throw httpError(404, "That entry is no longer in the book.");
    log({
      level: "info",
      category: "ledger",
      action: "entry.update",
      message: `Updated entry #${id} (${entry.date}).`,
      req,
      meta: { entryId: id, date: entry.date, credit: entry.credit, debit: entry.debit },
    });
    res.json({ id, ...entry });
  }));

  router.delete("/transactions/:id", wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw httpError(400, "That entry could not be found.");
    const [result] = await req.db.query("DELETE FROM transactions WHERE id = ?", [id]);
    if (result.affectedRows === 0) throw httpError(404, "That entry is no longer in the book.");
    log({
      level: "warn",
      category: "ledger",
      action: "entry.delete",
      message: `Deleted entry #${id}.`,
      req,
      meta: { entryId: id },
    });
    res.json({ ok: true });
  }));

  router.use((req, res) => {
    res.status(404).json({ error: "Not found." });
  });

  return router;
}
