import { paiseToAmount, toPaise, toUnsignedPaise } from "./money.js";

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const MONTH_INDEX = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

export function monthName(month) {
  return MONTH_NAMES[month - 1] ?? "";
}

/** Indian financial year (1 Apr – 31 Mar) helpers. A "start year" of 2026 means FY 2026-27. */
export function fyStartFromDate(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  return month >= 4 ? year : year - 1;
}

export function fyStartFromIso(iso) {
  const month = Number(String(iso).slice(5, 7));
  const year = Number(String(iso).slice(0, 4));
  return month >= 4 ? year : year - 1;
}

export function fyLabel(startYear) {
  return `FY ${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

export function fyBounds(startYear) {
  return { from: `${startYear}-04-01`, to: `${startYear + 1}-03-31` };
}

/** Convenience wrapper: the FY label for a given date (defaults to today). */
export function financialYearLabel(date = new Date()) {
  return fyLabel(fyStartFromDate(date));
}

export function formatDisplayDate(iso) {
  const [year, month, day] = String(iso).split("-").map(Number);
  const short = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  if (!year || !month || !day) return String(iso ?? "");
  return `${day} ${short[month - 1]} ${year}`;
}

function isoDate(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseDate(value) {
  const s = String(value ?? "").trim();
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (match) return isoDate(match[1], match[2], match[3]);
  match = /^(\d{1,2})[/. -](\d{1,2})[/. -](\d{4})$/.exec(s);
  if (match) return isoDate(match[3], match[2], match[1]);
  match = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(s);
  if (match) {
    const month = MONTH_INDEX[match[2].toLowerCase()];
    if (!month) return null;
    return isoDate(match[3], month, match[1]);
  }
  return null;
}

function splitCsv(line) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function splitRow(line) {
  if (line.includes("\t")) return line.split("\t").map((cell) => cell.trim());
  if (line.includes(",")) return splitCsv(line);
  const wide = line.split(/\s{2,}/).map((cell) => cell.trim()).filter((cell) => cell.length);
  if (wide.length > 1) return wide;
  return [line.trim()];
}

const HEADER_KEYS = {
  date: "date",
  "txn date": "date",
  "transaction date": "date",
  "value date": "date",
  description: "description",
  narration: "description",
  particulars: "description",
  details: "description",
  remarks: "description",
  credit: "credit",
  deposit: "credit",
  deposits: "credit",
  cr: "credit",
  debit: "debit",
  withdrawal: "debit",
  withdrawals: "debit",
  dr: "debit",
  balance: "balance",
  "closing balance": "balance",
};

function headerMap(cells) {
  const map = {};
  cells.forEach((cell, index) => {
    const key = HEADER_KEYS[cell.toLowerCase().replace(/\s+/g, " ").trim()];
    if (key && map[key] == null) map[key] = index;
  });
  if (map.date == null) return null;
  if (map.description == null && map.credit == null && map.debit == null) return null;
  return map;
}

function looksDated(value) {
  return /^\d/.test(String(value ?? "").trim());
}

export function parseStatement(text) {
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const rows = [];
  const errors = [];
  let skipped = 0;
  let columns = null;
  let start = 0;

  if (lines.length) {
    const mapped = headerMap(splitRow(lines[0]));
    if (mapped) {
      columns = mapped;
      start = 1;
    }
  }

  for (let index = start; index < lines.length; index += 1) {
    const lineNo = index + 1;
    const line = lines[index];
    if (/^[-_=]{3,}$/.test(line)) {
      skipped += 1;
      continue;
    }

    const cells = splitRow(line);
    const first = cells[0] ?? "";
    if (!looksDated(first)) {
      skipped += 1;
      continue;
    }

    let dateRaw = "";
    let description = "";
    let creditRaw = "";
    let debitRaw = "";
    let singleRaw = null;

    if (columns) {
      dateRaw = cells[columns.date] ?? "";
      description = columns.description != null ? cells[columns.description] ?? "" : "";
      creditRaw = columns.credit != null ? cells[columns.credit] ?? "" : "";
      debitRaw = columns.debit != null ? cells[columns.debit] ?? "" : "";
    } else if (cells.length >= 4) {
      [dateRaw, description, creditRaw, debitRaw] = cells;
    } else if (cells.length === 3) {
      [dateRaw, description, singleRaw] = cells;
    } else {
      errors.push({ line: lineNo, message: "Use date, description, credit, and debit — separated by a tab or a comma." });
      continue;
    }

    const date = parseDate(dateRaw);
    if (!date) {
      errors.push({ line: lineNo, message: `Could not read the date “${dateRaw}”. Use 16-11-2026 or 2026-11-16.` });
      continue;
    }

    description = String(description ?? "").replace(/\s+/g, " ").trim();
    if (!description) {
      errors.push({ line: lineNo, message: "Description is empty." });
      continue;
    }
    if (description.length > 500) {
      errors.push({ line: lineNo, message: "Description is longer than 500 characters." });
      continue;
    }

    let creditPaise = 0;
    let debitPaise = 0;
    if (singleRaw != null) {
      const signed = toPaise(singleRaw);
      if (signed == null) {
        errors.push({ line: lineNo, message: `Could not read the amount “${singleRaw}”.` });
        continue;
      }
      if (signed < 0) debitPaise = -signed;
      else creditPaise = signed;
    } else {
      creditPaise = toUnsignedPaise(creditRaw);
      debitPaise = toUnsignedPaise(debitRaw);
      if (creditPaise == null) {
        errors.push({ line: lineNo, message: `Could not read credit “${creditRaw}”.` });
        continue;
      }
      if (debitPaise == null) {
        errors.push({ line: lineNo, message: `Could not read debit “${debitRaw}”.` });
        continue;
      }
    }

    if (creditPaise > 0 && debitPaise > 0) {
      errors.push({ line: lineNo, message: "A line can be a credit or a debit, not both." });
      continue;
    }
    if (creditPaise === 0 && debitPaise === 0) {
      errors.push({ line: lineNo, message: "Amount is missing." });
      continue;
    }

    rows.push({
      date,
      description,
      credit: paiseToAmount(creditPaise),
      debit: paiseToAmount(debitPaise),
    });
  }

  return { rows, errors, skipped };
}

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function csvLine(cells) {
  return cells.map(csvCell).join(",");
}

export function reportToCsv({
  title,
  period,
  included,
  totals,
  rows = [],
  months = [],
  broughtForward,
  closingBalance,
  showStatementBalance,
}) {
  const lines = [
    csvLine(["Balancio"]),
    csvLine(["Report", title]),
    csvLine(["Period", period]),
    csvLine(["Included", included]),
    csvLine(["Money in", totals.credit]),
    csvLine(["Money out", totals.debit]),
    csvLine(["Net", totals.net]),
    csvLine(["Entries", totals.count]),
  ];
  if (showStatementBalance) {
    lines.push(csvLine(["Brought forward", broughtForward]));
    lines.push(csvLine(["Closing balance", closingBalance]));
  } else {
    lines.push(csvLine(["Book balance at period end", closingBalance]));
  }
  lines.push("");
  if (title === "Monthly summary") {
    lines.push(csvLine(["Month", "Money in", "Money out", "Net", "Balance at month end", "Entries"]));
    for (const month of months) {
      lines.push(csvLine([month.label, month.credit, month.debit, month.net, month.closingBalance, month.count]));
    }
    lines.push(csvLine([
      "Total",
      totals.credit,
      totals.debit,
      totals.net,
      closingBalance,
      totals.count,
    ]));
  } else {
    lines.push(csvLine(["Date", "Description", "Credit", "Debit", "Balance"]));
    if (showStatementBalance) lines.push(csvLine(["", "Brought forward", "", "", broughtForward]));
    for (const row of rows) {
      lines.push(csvLine([
        row.date,
        row.description,
        row.credit === "0.00" ? "" : row.credit,
        row.debit === "0.00" ? "" : row.debit,
        row.balance,
      ]));
    }
    lines.push(csvLine([
      "",
      showStatementBalance ? "Closing balance" : "Net of shown lines",
      totals.credit,
      totals.debit,
      showStatementBalance ? closingBalance : totals.net,
    ]));
  }
  return `${lines.join("\r\n")}\r\n`;
}

export function statementToTsv({ title, broughtForward, rows, closingBalance }) {
  const lines = [
    title,
    "Date\tDescription\tCredit\tDebit\tBalance",
    `\tBrought forward\t\t\t${broughtForward}`,
  ];
  for (const row of rows) {
    lines.push(
      [
        row.date,
        String(row.description).replace(/[\t\r\n]+/g, " "),
        row.credit === "0.00" ? "" : row.credit,
        row.debit === "0.00" ? "" : row.debit,
        row.balance,
      ].join("\t"),
    );
  }
  lines.push(`\tClosing balance\t\t\t${closingBalance}`);
  return lines.join("\n");
}
