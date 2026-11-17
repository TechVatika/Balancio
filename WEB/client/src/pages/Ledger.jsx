import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { formatRupee, paiseToAmount, toPaise } from "../../../shared/money.js";
import { MONTH_NAMES, formatDisplayDate, fyLabel, fyStartFromDate, fyStartFromIso, monthName, statementToTsv } from "../../../shared/statement.js";
import { logEvent } from "../activityLog.js";
import { api } from "../api.js";
import { useBook } from "../book.jsx";
import { askConfirm, flash } from "../dialog.js";
import { EntryModal } from "../components/EntryModal.jsx";
import { PasteModal } from "../components/PasteModal.jsx";
import { StatementTable } from "../components/StatementTable.jsx";
import { EVENTS, takePendingNewEntry } from "../shortcuts.js";

function todayParts() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function readPeriod(params, mode) {
  const today = todayParts();
  const defaultYear = mode === "month" ? today.year : fyStartFromDate();
  const parsedYear = Number(params.get("year"));
  const parsedMonth = Number(params.get("month"));
  const year = Number.isInteger(parsedYear) && parsedYear >= 1990 && parsedYear <= 2100
    ? parsedYear
    : defaultYear;
  const month = Number.isInteger(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12
    ? parsedMonth
    : today.month;
  return { year, month: mode === "month" ? month : null };
}

export function Ledger({ mode }) {
  const [params, setParams] = useSearchParams();
  const { tick, refresh, notify } = useBook();
  const period = readPeriod(params, mode);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [pasting, setPasting] = useState(false);
  const [query, setQuery] = useState("");
  const [side, setSide] = useState("all");

  useEffect(() => {
    const next = new URLSearchParams();
    next.set("year", String(period.year));
    if (mode === "month") next.set("month", String(period.month));
    if (params.toString() !== next.toString()) setParams(next, { replace: true });
  }, [mode, params, period.month, period.year, setParams]);

  useEffect(() => {
    let cancelled = false;
    setError("");
    const query = mode === "month"
      ? `/api/ledger?year=${period.year}&month=${period.month}`
      : `/api/ledger?year=${period.year}`;
    api(query)
      .then((next) => {
        if (!cancelled) setData(next);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, period.month, period.year, tick]);

  useEffect(() => {
    setQuery("");
    setSide("all");
  }, [mode, period.month, period.year]);

  useEffect(() => {
    if (takePendingNewEntry()) setAdding(true);
    function onNew() {
      setAdding(true);
    }
    function onPaste() {
      setPasting(true);
    }
    function onSearch() {
      const input = document.querySelector(".ledger-search, input[aria-label='Search entries'], input[placeholder*='Search']");
      if (input instanceof HTMLInputElement) {
        input.focus();
        input.select();
      }
    }
    window.addEventListener(EVENTS.NEW_ENTRY, onNew);
    window.addEventListener(EVENTS.PASTE, onPaste);
    window.addEventListener(EVENTS.FOCUS_SEARCH, onSearch);
    return () => {
      window.removeEventListener(EVENTS.NEW_ENTRY, onNew);
      window.removeEventListener(EVENTS.PASTE, onPaste);
      window.removeEventListener(EVENTS.FOCUS_SEARCH, onSearch);
    };
  }, []);

  function goTo(next) {
    const paramsNext = { year: String(next.year) };
    if (mode === "month") paramsNext.month = String(next.month);
    setParams(paramsNext);
  }

  function shift(delta) {
    if (mode === "year") {
      goTo({ year: period.year + delta });
      return;
    }
    const date = new Date(Date.UTC(period.year, period.month - 1 + delta, 1));
    goTo({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 });
  }

  function jumpToEntry(date) {
    if (mode === "month") {
      const [year, month] = date.split("-").map(Number);
      goTo({ year, month });
    } else {
      goTo({ year: fyStartFromIso(date) });
    }
  }

  async function copyStatement() {
    if (!visible) return;
    const text = statementToTsv({
      title: `Balancio — ${visible.label}`,
      broughtForward: visible.broughtForward,
      rows: visible.rows,
      closingBalance: visible.closingBalance,
    });
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    logEvent("ledger.copy", `Copied statement for ${visible.label}.`, {
      mode,
      label: visible.label,
      rows: visible.rows.length,
    });
    notify("Statement copied. Paste it into a sheet, a note, or a message.");
  }

  async function copyLine(row) {
    const text = [
      row.date,
      row.description,
      row.credit === "0.00" ? "" : row.credit,
      row.debit === "0.00" ? "" : row.debit,
      row.balance,
    ].join("\t");
    const copied = await writeClipboard(text);
    if (copied) {
      logEvent("ledger.copy.entry", `Copied entry #${row.id} (${row.date}).`, {
        entryId: row.id,
        date: row.date,
      });
    }
    flash(copied ? "Line copied." : "The line could not be copied.", copied ? "success" : "error");
  }

  async function duplicate(row) {
    const ok = await askConfirm({
      title: "Duplicate this entry?",
      text: `${entryName(row)} will be added again on the same date.`,
      confirmText: "Duplicate",
    });
    if (!ok) return;
    try {
      await api("/api/transactions", {
        method: "POST",
        body: {
          date: row.date,
          description: row.description,
          credit: row.credit,
          debit: row.debit,
        },
      });
      flash("Entry duplicated.");
      refresh();
    } catch (err) {
      flash(err.message, "error");
    }
  }

  async function remove(row) {
    const ok = await askConfirm({
      title: "Delete this entry?",
      text: `${entryName(row)} will leave the book, and the balance will be recalculated.`,
      confirmText: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/transactions/${row.id}`, { method: "DELETE" });
      flash("Entry deleted.");
      refresh();
    } catch (err) {
      flash(err.message, "error");
    }
  }

  const today = todayParts();
  const todayFyStart = fyStartFromDate();
  const monthFyStart = fyStartFromIso(`${period.year}-${String(period.month ?? 1).padStart(2, "0")}-01`);
  const label = mode === "month" ? `${monthName(period.month)} ${period.year}` : fyLabel(period.year);
  const visible = data && data.year === period.year && (mode === "year" ? data.month == null : data.month === period.month)
    ? data
    : null;
  const years = Array.from(new Set([period.year, ...(data?.years ?? [])])).sort((a, b) => b - a);
  const onToday = mode === "year"
    ? period.year === todayFyStart
    : period.year === today.year && period.month === today.month;
  const otherPath = mode === "month"
    ? `/year?year=${monthFyStart}`
    : `/month?year=${today.year}&month=${today.month}`;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">{mode === "month" ? "Month ledger" : "Financial year ledger"}</p>
          <div className="period-switch">
            <button type="button" className="icon-btn" onClick={() => shift(-1)} aria-label="Previous period">‹</button>
            <h1>{label}</h1>
            <button type="button" className="icon-btn" onClick={() => shift(1)} aria-label="Next period">›</button>
          </div>
          {visible && (
            <p className={visible.closingBalance.startsWith("-") ? "lede debit" : "lede"}>
              {`Closing balance ${formatRupee(visible.closingBalance)}${onToday && mode === "month" ? ". This is the current month." : "."}`}
            </p>
          )}
        </div>
        <div className="toolbar">
          {!onToday && (
            <button type="button" className="btn quiet" onClick={() => goTo(mode === "year" ? { year: todayFyStart } : today)}>Today</button>
          )}
          {mode === "month" && (
            <select
              aria-label="Month"
              value={period.month}
              onChange={(event) => goTo({ year: period.year, month: Number(event.target.value) })}
            >
              {MONTH_NAMES.map((name, index) => (
                <option key={name} value={index + 1}>{name}</option>
              ))}
            </select>
          )}
          <select
            aria-label={mode === "year" ? "Financial year" : "Year"}
            value={period.year}
            onChange={(event) => goTo({ year: Number(event.target.value), month: period.month ?? today.month })}
          >
            {years.map((year) => (
              <option key={year} value={year}>{mode === "year" ? fyLabel(year) : year}</option>
            ))}
          </select>
          <button type="button" className="btn secondary" onClick={copyStatement} disabled={!visible}><CopyGlyph /> Copy statement</button>
          <button type="button" className="btn secondary" onClick={() => setPasting(true)}><PasteGlyph /> Paste</button>
          <button type="button" className="btn" onClick={() => setAdding(true)}><PlusGlyph /> Add entry</button>
        </div>
      </header>

      <p className="cross-link">
        <Link to={otherPath} className="text-link">
          {mode === "month" ? `See the full ${fyLabel(monthFyStart)} ledger` : "Open the current month"}
        </Link>
      </p>

      {error && (
        <section className="panel connection">
          <p>{error}</p>
          <button type="button" className="btn" onClick={refresh}>Try again</button>
        </section>
      )}

      {!visible && !error && <p className="loading">Turning to that page…</p>}

      {visible && (
        <LedgerStatement
          visible={visible}
          query={query}
          side={side}
          onQuery={setQuery}
          onSide={setSide}
          onEdit={setEditing}
          onCopy={copyLine}
          onDuplicate={duplicate}
          onDelete={remove}
        />
      )}

      {adding && (
        <EntryModal
          onClose={() => setAdding(false)}
          onSaved={(entry) => {
            setAdding(false);
            jumpToEntry(entry.date);
            refresh();
          }}
        />
      )}
      {editing && (
        <EntryModal
          entry={editing}
          onClose={() => setEditing(null)}
          onSaved={(entry) => {
            setEditing(null);
            jumpToEntry(entry.date);
            refresh();
          }}
        />
      )}
      {pasting && (
        <PasteModal
          onClose={() => setPasting(false)}
          onSaved={(rows) => {
            setPasting(false);
            const earliest = [...rows].sort((a, b) => a.date.localeCompare(b.date))[0];
            if (earliest) jumpToEntry(earliest.date);
            refresh();
          }}
        />
      )}
    </div>
  );
}

async function writeClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.left = "-9999px";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

function Glyph({ children }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

function CopyGlyph() {
  return (
    <Glyph>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </Glyph>
  );
}

function PasteGlyph() {
  return (
    <Glyph>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" />
      <path d="M9 12h6" />
      <path d="M9 16h6" />
    </Glyph>
  );
}

function PlusGlyph() {
  return (
    <Glyph>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </Glyph>
  );
}

function entryName(row) {
  const name = String(row.description ?? "").trim();
  if (name.length <= 80) return name;
  return `${name.slice(0, 77)}…`;
}

function matchingRows(rows, query, side) {
  const needle = query.trim().toLowerCase();
  return rows.filter((row) => {
    const text = `${row.date} ${formatDisplayDate(row.date)} ${row.description} ${row.credit} ${row.debit}`.toLowerCase();
    const matchesText = !needle || text.includes(needle);
    const matchesSide = side === "all"
      || (side === "in" && row.credit !== "0.00")
      || (side === "out" && row.debit !== "0.00");
    return matchesText && matchesSide;
  });
}

function sumRows(rows) {
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

function LedgerStatement({ visible, query, side, onQuery, onSide, onEdit, onCopy, onDuplicate, onDelete }) {
  const filtering = query.trim() !== "" || side !== "all";
  const rows = useMemo(() => matchingRows(visible.rows, query, side), [visible.rows, query, side]);
  const totals = filtering ? sumRows(rows) : visible.totals;

  return (
    <>
      <div className="filters">
        <input
          type="search"
          className="ledger-search"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Search description, date, or amount"
          aria-label="Search entries"
        />
        <div className="side-filter" role="group" aria-label="Money in or out">
          {[
            ["all", "All"],
            ["in", "In"],
            ["out", "Out"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={side === value ? "on" : ""}
              aria-pressed={side === value}
              onClick={() => onSide(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {filtering && (
        <p className="filter-count">{rows.length} of {visible.rows.length} lines</p>
      )}
      <StatementTable
        kicker="Your money, in balance."
        title={visible.label}
        note="Your personal ledger. Credit is money in, debit is money out."
        broughtForward={visible.broughtForward}
        closingBalance={filtering ? totals.net : visible.closingBalance}
        totals={totals}
        rows={rows}
        totalLabel={filtering ? "Shown" : "Period total"}
        emptyMessage={filtering ? "No lines match this search." : "No entries in this period. Add one, or paste a statement."}
        showBroughtForward={!filtering}
        onEdit={onEdit}
        onCopy={onCopy}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
      />
    </>
  );
}
