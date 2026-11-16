import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatRupee, paiseToAmount, toPaise } from "../../../shared/money.js";
import { formatDisplayDate, monthName } from "../../../shared/statement.js";
import { api } from "../api.js";
import { useBook } from "../book.jsx";
import { EntryModal } from "../components/EntryModal.jsx";

function flowClass(amount, direction) {
  const raw = String(amount ?? "0.00");
  if (raw === "0.00" || raw === "-0.00") return "";
  if (direction === "out" || raw.startsWith("-")) return "debit";
  return "credit";
}

export function Dashboard() {
  const { tick, refresh } = useBook();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    function onKey(event) {
      if (event.key.toLowerCase() !== "n" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      setAdding(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setError("");
    api("/api/overview")
      .then((next) => {
        if (!cancelled) setData(next);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  if (error && !data) {
    return (
      <section className="panel connection">
        <h1>The overview didn’t load.</h1>
        <p>{error}</p>
        <button type="button" className="btn" onClick={refresh}>Try again</button>
      </section>
    );
  }

  if (!data) return <p className="loading">Opening the book…</p>;

  const monthPath = `/month?year=${data.today.year}&month=${data.today.month}`;
  const yearPath = `/year?year=${data.year.year}`;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">On hand · {formatDisplayDate(data.today.iso)}</p>
          <h1 className={data.balance.startsWith("-") ? "hero-balance debit" : "hero-balance"}>
            {formatRupee(data.balance)}
          </h1>
          <p className="lede">
            {data.entryCount === 0
              ? "The book is empty. Add the first line, or paste a statement you already have."
              : `Running balance after ${data.entryCount} ${data.entryCount === 1 ? "entry" : "entries"}.`}
          </p>
        </div>
        <div className="toolbar">
          <button type="button" className="btn" onClick={() => setAdding(true)}>Add entry</button>
          <Link className="btn secondary" to={monthPath}>Open this month</Link>
          <Link className="btn secondary" to="/reports">Reports</Link>
        </div>
      </header>

      <div className="stat-grid">
        <article className="stat">
          <p className="eyebrow">This month</p>
          <h2>{monthName(data.today.month)}</h2>
          <dl>
            <div><dt>In</dt><dd className={flowClass(data.month.totals.credit, "in")}>{formatRupee(data.month.totals.credit)}</dd></div>
            <div><dt>Out</dt><dd className={flowClass(data.month.totals.debit, "out")}>{formatRupee(data.month.totals.debit)}</dd></div>
            <div><dt>Net</dt><dd className={flowClass(data.month.totals.net, "in")}>{formatRupee(data.month.totals.net)}</dd></div>
          </dl>
          <Link to={monthPath} className="text-link">Open the month ledger</Link>
        </article>
        <article className="stat">
          <p className="eyebrow">This financial year</p>
          <h2>{data.year.label}</h2>
          <dl>
            <div><dt>In</dt><dd className={flowClass(data.year.totals.credit, "in")}>{formatRupee(data.year.totals.credit)}</dd></div>
            <div><dt>Out</dt><dd className={flowClass(data.year.totals.debit, "out")}>{formatRupee(data.year.totals.debit)}</dd></div>
            <div><dt>Net</dt><dd className={flowClass(data.year.totals.net, "in")}>{formatRupee(data.year.totals.net)}</dd></div>
          </dl>
          <Link to={yearPath} className="text-link">Open the year ledger</Link>
        </article>
      </div>

      <section className="panel">
        <header className="panel-head">
          <h2>{monthName(data.today.month)} balance trend</h2>
        </header>
        <MonthTrendChart
          rows={data.month.rows}
          broughtForward={data.month.broughtForward}
          year={data.today.year}
          month={data.today.month}
        />
      </section>

      <section className="panel">
        <header className="panel-head">
          <h2>Last six months</h2>
          <p className="legend"><span className="credit">In</span><span className="debit">Out</span></p>
        </header>
        <FlowChart months={data.trend ?? []} />
        {data.previous && (
          <p className="compare">
            {`Outflow ${movement(data.month.totals.debit, data.previous.totals.debit)} ${data.previous.label}.`}
          </p>
        )}
      </section>

      <section className="panel">
        <header className="panel-head">
          <h2>Largest payments</h2>
          <span className="muted">{monthName(data.today.month)}</span>
        </header>
        <OutflowList rows={data.month.rows} />
      </section>

      <section className="panel">
        <header className="panel-head">
          <h2>Latest entries</h2>
          <Link to={monthPath} className="text-link">Month ledger</Link>
        </header>
        {data.recent.length === 0 ? (
          <p className="muted">Nothing recorded yet.</p>
        ) : (
          <ul className="recent-list">
            {data.recent.map((row) => (
              <li key={row.id}>
                <span className="date">{formatDisplayDate(row.date)}</span>
                <span className="desc">{row.description}</span>
                <strong className={row.credit !== "0.00" ? "credit" : "debit"}>
                  {row.credit !== "0.00" ? formatRupee(row.credit) : `−${formatRupee(row.debit)}`}
                </strong>
              </li>
            ))}
          </ul>
        )}
      </section>

      {adding && (
        <EntryModal
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function movement(current, previous) {
  const delta = (toPaise(current) ?? 0) - (toPaise(previous) ?? 0);
  if (delta === 0) return "matches";
  const amount = formatRupee(paiseToAmount(Math.abs(delta)));
  return delta > 0 ? `is ${amount} more than` : `is ${amount} less than`;
}

function MonthTrendChart({ rows, broughtForward, year, month }) {
  if (!rows || !rows.length) return <p className="muted">This month’s running balance will appear here once you add an entry.</p>;

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const points = [{ day: 1, balance: toPaise(broughtForward) ?? 0 }];
  for (const row of rows) {
    points.push({ day: Number(row.date.slice(8, 10)), balance: toPaise(row.balance) ?? 0 });
  }

  const values = points.map((point) => point.balance);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const span = max - min || 1;
  const width = 600;
  const height = 160;
  const pad = 10;
  const toX = (day) => pad + ((day - 1) / Math.max(daysInMonth - 1, 1)) * (width - pad * 2);
  const toY = (value) => height - pad - ((value - min) / span) * (height - pad * 2);
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${toX(point.day).toFixed(1)} ${toY(point.balance).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  const negative = last.balance < 0;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="trend-chart" role="img" aria-label={`Running balance across ${monthName(month)}`}>
      {min < 0 && max > 0 && (
        <line x1={pad} x2={width - pad} y1={toY(0)} y2={toY(0)} className="trend-zero" />
      )}
      <path d={path} className={negative ? "trend-line debit" : "trend-line"} fill="none" />
      <circle cx={toX(last.day)} cy={toY(last.balance)} r="4" className={negative ? "trend-dot debit" : "trend-dot"} />
    </svg>
  );
}

function FlowChart({ months }) {
  const peak = Math.max(1, ...months.flatMap((month) => [toPaise(month.credit) ?? 0, toPaise(month.debit) ?? 0]));
  if (!months.length) return <p className="muted">The last six months will appear here.</p>;
  return (
    <div className="bars" role="img" aria-label="Money in and out over the last six months">
      {months.map((month) => (
        <div className="bar-col" key={`${month.year}-${month.month}`}>
          <div className="bar-pair">
            <span className="bar in" style={{ height: `${((toPaise(month.credit) ?? 0) / peak) * 100}%` }} />
            <span className="bar out" style={{ height: `${((toPaise(month.debit) ?? 0) / peak) * 100}%` }} />
          </div>
          <span>{month.label}</span>
        </div>
      ))}
    </div>
  );
}

function OutflowList({ rows }) {
  const payments = [...(rows ?? [])]
    .filter((row) => row.debit !== "0.00")
    .sort((a, b) => (toPaise(b.debit) ?? 0) - (toPaise(a.debit) ?? 0))
    .slice(0, 5);
  if (!payments.length) return <p className="muted">No money went out this month.</p>;
  return (
    <ul className="recent-list">
      {payments.map((row) => (
        <li key={row.id}>
          <span className="date">{formatDisplayDate(row.date)}</span>
          <span className="desc">{row.description}</span>
          <strong className="debit">{formatRupee(row.debit)}</strong>
        </li>
      ))}
    </ul>
  );
}
