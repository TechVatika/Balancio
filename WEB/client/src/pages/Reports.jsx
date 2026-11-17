import { useEffect, useState } from "react";
import { formatRupee } from "../../../shared/money.js";
import { formatDisplayDate } from "../../../shared/statement.js";
import { logEvent } from "../activityLog.js";
import { api } from "../api.js";
import { useBook } from "../book.jsx";

const PRESETS = [
  ["month", "This month"],
  ["last-month", "Last month"],
  ["year", "This year"],
  ["last-year", "Last year"],
  ["all", "All entries"],
  ["custom", "Custom"],
];

const SIDES = [
  ["all", "All lines"],
  ["in", "Money in"],
  ["out", "Money out"],
];

const KINDS = [
  ["statement", "Statement"],
  ["summary", "Monthly summary"],
];

function todayParts() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function iso(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthRange(year, month) {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: iso(year, month, 1), to: iso(year, month, last) };
}

function rangeFor(preset) {
  const today = todayParts();
  if (preset === "month") return monthRange(today.year, today.month);
  if (preset === "last-month") {
    const date = new Date(Date.UTC(today.year, today.month - 2, 1));
    return monthRange(date.getUTCFullYear(), date.getUTCMonth() + 1);
  }
  if (preset === "year") return { from: `${today.year}-01-01`, to: `${today.year}-12-31` };
  if (preset === "last-year") return { from: `${today.year - 1}-01-01`, to: `${today.year - 1}-12-31` };
  return null;
}

function flowClass(amount, direction) {
  const raw = String(amount ?? "0.00");
  if (raw === "0.00" || raw === "-0.00") return "";
  if (direction === "out" || raw.startsWith("-")) return "debit";
  return "credit";
}

function balanceClass(amount) {
  const raw = String(amount ?? "0.00");
  if (raw.startsWith("-") && raw !== "-0.00") return "debit";
  return "";
}

export function Reports() {
  const { notify, tick, books, bookId } = useBook();
  const initial = rangeFor("month");
  const [preset, setPreset] = useState("month");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [side, setSide] = useState("all");
  const [kind, setKind] = useState("statement");
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");

  const rangeError = preset !== "all" && (!from || !to)
    ? "Choose a start date and an end date."
    : preset !== "all" && from > to
      ? "The start date has to be on or before the end date."
      : "";

  useEffect(() => {
    if (rangeError) {
      setLoading(false);
      setError(rangeError);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    const query = preset === "all"
      ? `/api/report?side=${side}`
      : `/api/report?from=${from}&to=${to}&side=${side}`;
    api(query)
      .then((next) => {
        if (!cancelled) setReport(next);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [preset, from, to, side, rangeError, tick]);

  function choosePreset(next) {
    const range = rangeFor(next);
    setPreset(next);
    if (range) {
      setFrom(range.from);
      setTo(range.to);
    }
  }

  const included = SIDES.find(([value]) => value === side)?.[1] ?? "All lines";
  const title = kind === "summary" ? "Monthly summary" : "Statement";
  const period = report ? `${formatDisplayDate(report.from)} – ${formatDisplayDate(report.to)}` : "";
  const showStatementBalance = side === "all";

  function buildReportFile(data) {
    return {
      kind,
      title,
      period,
      included,
      from: data.from,
      to: data.to,
      showStatementBalance,
      broughtForward: data.broughtForward,
      closingBalance: data.closingBalance,
      totals: data.totals,
      rows: data.rows,
      months: data.months,
    };
  }

  async function downloadExcel() {
    if (!report || saving) return;
    setSaving("excel");
    try {
      const { saveMultiBookExcelReport } = await import("../reportExcel.js");
      const query = preset === "all" ? `/api/report?side=${side}` : `/api/report?from=${from}&to=${to}&side=${side}`;
      const list = books ?? [{ id: bookId, name: "Balancio" }];
      const entries = await Promise.all(list.map(async (book) => {
        const data = book.id === bookId ? report : await api(`${query}&book=${book.id}`);
        return { name: book.name, report: buildReportFile(data) };
      }));
      await saveMultiBookExcelReport(entries);
      logEvent("report.download.excel", `Downloaded Excel report (${entries.length} ${entries.length === 1 ? "sheet" : "sheets"}).`, {
        kind,
        side,
        from: report.from,
        to: report.to,
        books: entries.length,
      });
      notify(entries.length > 1 ? "Excel report downloaded — one sheet per book." : "Excel report downloaded.");
    } catch (err) {
      notify(err.message || "The Excel file could not be created.");
    } finally {
      setSaving("");
    }
  }

  async function downloadPdf() {
    if (!report || saving) return;
    setSaving("pdf");
    try {
      const { savePdfReport } = await import("../reportPdf.js");
      await savePdfReport(buildReportFile(report));
      logEvent("report.download.pdf", `Downloaded PDF report ${report.from} to ${report.to}.`, {
        kind,
        side,
        from: report.from,
        to: report.to,
        bookId,
      });
      notify("PDF report downloaded.");
    } catch (err) {
      notify(err.message || "The PDF could not be created.");
    } finally {
      setSaving("");
    }
  }

  return (
    <div className="page report-page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>Download a report</h1>
          <p className="lede">Pick the dates, the lines, and whether you want every entry or a month-by-month summary.</p>
        </div>
      </header>

      <section className="panel report-controls">
        <fieldset className="choice-set">
          <legend>Period</legend>
          <div className="choice-row">
            {PRESETS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={preset === value ? "on" : ""}
                aria-pressed={preset === value}
                onClick={() => choosePreset(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        {preset === "all" ? (
          <p className="report-note">Every line in the book, from the first entry to the last.</p>
        ) : (
          <div className="date-row">
            <label className="field">
              <span>From</span>
              <input
                type="date"
                value={from}
                min="1990-01-01"
                max="2100-12-31"
                onChange={(event) => {
                  setPreset("custom");
                  setFrom(event.target.value);
                }}
              />
            </label>
            <label className="field">
              <span>To</span>
              <input
                type="date"
                value={to}
                min="1990-01-01"
                max="2100-12-31"
                onChange={(event) => {
                  setPreset("custom");
                  setTo(event.target.value);
                }}
              />
            </label>
          </div>
        )}

        <fieldset className="choice-set">
          <legend>Lines</legend>
          <div className="choice-row">
            {SIDES.map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={side === value ? "on" : ""}
                aria-pressed={side === value}
                onClick={() => setSide(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="choice-set">
          <legend>Report</legend>
          <div className="choice-row">
            {KINDS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={kind === value ? "on" : ""}
                aria-pressed={kind === value}
                onClick={() => setKind(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="report-actions">
          <button type="button" className="btn secondary report-dl report-dl--excel" onClick={downloadExcel} disabled={!report || loading || Boolean(rangeError) || Boolean(saving)}>
            <ExcelIcon />
            <span>{saving === "excel" ? "Preparing Excel…" : "Download Excel"}</span>
          </button>
          <button type="button" className="btn secondary report-dl report-dl--pdf" onClick={downloadPdf} disabled={!report || loading || Boolean(rangeError) || Boolean(saving)}>
            <PdfIcon />
            <span>{saving === "pdf" ? "Preparing PDF…" : "Download PDF"}</span>
          </button>
        </div>
        {error && <p className="form-error">{error}</p>}
      </section>

      {loading && !report && <p className="loading">Preparing the report…</p>}

      {report && !rangeError && (
        <section className="panel report-sheet" aria-busy={loading}>
          <p className="eyebrow">Balancio</p>
          <h2>{title}</h2>
          <p className="lede">{`${period}. ${included}.`}</p>
          <dl className="sheet-stats">
            <div>
              <dt>In</dt>
              <dd className={flowClass(report.totals.credit, "in")}>{formatRupee(report.totals.credit)}</dd>
            </div>
            <div>
              <dt>Out</dt>
              <dd className={flowClass(report.totals.debit, "out")}>{formatRupee(report.totals.debit)}</dd>
            </div>
            <div>
              <dt>{showStatementBalance ? "Closing balance" : "Net of shown lines"}</dt>
              <dd className={showStatementBalance ? balanceClass(report.closingBalance) : flowClass(report.totals.net, "in")}>
                {formatRupee(showStatementBalance ? report.closingBalance : report.totals.net)}
              </dd>
            </div>
          </dl>
          {kind === "summary" ? (
            <SummaryTable report={report} />
          ) : (
            <StatementPreview report={report} showStatementBalance={showStatementBalance} />
          )}
        </section>
      )}
    </div>
  );
}

function StatementPreview({ report, showStatementBalance }) {
  if (report.rows.length === 0) {
    return <p className="report-note">No lines in this period.</p>;
  }
  return (
    <div className="sheet-scroll">
      <table className="sheet">
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Description</th>
            <th scope="col" className="num">Credit</th>
            <th scope="col" className="num">Debit</th>
            <th scope="col" className="num">Balance</th>
          </tr>
        </thead>
        <tbody>
          {showStatementBalance && (
            <tr>
              <td data-label="Date" />
              <td data-label="Description">Brought forward</td>
              <td data-label="Credit" className="num" />
              <td data-label="Debit" className="num" />
              <td data-label="Balance" className="num">{formatRupee(report.broughtForward)}</td>
            </tr>
          )}
          {report.rows.map((row) => (
            <tr key={row.id}>
              <td data-label="Date" className="date">{formatDisplayDate(row.date)}</td>
              <td data-label="Description">{row.description}</td>
              <td data-label="Credit" className={row.credit === "0.00" ? "num" : "num credit"}>{formatRupee(row.credit, { empty: true })}</td>
              <td data-label="Debit" className={row.debit === "0.00" ? "num" : "num debit"}>{formatRupee(row.debit, { empty: true })}</td>
              <td data-label="Balance" className="num">{formatRupee(row.balance)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td data-label="" colSpan={2}>{showStatementBalance ? "Period total" : "Shown"} · {report.totals.count} {report.totals.count === 1 ? "entry" : "entries"}</td>
            <td data-label="Credit" className={report.totals.credit === "0.00" ? "num" : "num credit"}>{formatRupee(report.totals.credit)}</td>
            <td data-label="Debit" className={report.totals.debit === "0.00" ? "num" : "num debit"}>{formatRupee(report.totals.debit)}</td>
            <td data-label="Balance" className="num">{formatRupee(showStatementBalance ? report.closingBalance : report.totals.net)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function SummaryTable({ report }) {
  if (report.months.length === 0) {
    return <p className="report-note">No lines in this period.</p>;
  }
  return (
    <>
      {report.side !== "all" && (
        <p className="report-note">In and out follow the lines you included. Balance is the book at the end of that month.</p>
      )}
      <div className="sheet-scroll">
        <table className="sheet">
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col" className="num">In</th>
              <th scope="col" className="num">Out</th>
              <th scope="col" className="num">Net</th>
              <th scope="col" className="num">Balance</th>
            </tr>
          </thead>
          <tbody>
            {report.months.map((month) => (
              <tr key={`${month.year}-${month.month}`}>
                <td data-label="Month">{month.label}</td>
                <td data-label="In" className={month.credit === "0.00" ? "num" : "num credit"}>{formatRupee(month.credit)}</td>
                <td data-label="Out" className={month.debit === "0.00" ? "num" : "num debit"}>{formatRupee(month.debit)}</td>
                <td data-label="Net" className={`num ${flowClass(month.net, "in")}`}>{formatRupee(month.net)}</td>
                <td data-label="Balance" className="num">{formatRupee(month.closingBalance)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td data-label="">Total</td>
              <td data-label="In" className={report.totals.credit === "0.00" ? "num" : "num credit"}>{formatRupee(report.totals.credit)}</td>
              <td data-label="Out" className={report.totals.debit === "0.00" ? "num" : "num debit"}>{formatRupee(report.totals.debit)}</td>
              <td data-label="Net" className={`num ${flowClass(report.totals.net, "in")}`}>{formatRupee(report.totals.net)}</td>
              <td data-label="Balance" className="num">{formatRupee(report.closingBalance)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

function ExcelIcon() {
  return (
    <svg className="report-dl__icon" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z" opacity="0.18" />
      <path fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z" />
      <path fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" d="M14 2v6h6" />
      <path fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" d="M8.2 17.2 11 12.2l2.8 5M9 15.2h4" />
    </svg>
  );
}

function PdfIcon() {
  return (
    <svg className="report-dl__icon" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z" opacity="0.18" />
      <path fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z" />
      <path fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" d="M14 2v6h6" />
      <path fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" d="M8.5 12.5h2.2a1.4 1.4 0 0 1 0 2.8H8.5v-4.3Zm0 2.8V17M13.2 17v-4.5h1.3a1.6 1.6 0 0 1 0 3.2H13.2Zm4.3-4.5v4.5" />
    </svg>
  );
}
