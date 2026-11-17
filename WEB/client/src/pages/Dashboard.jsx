import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatRupee, paiseToAmount, toPaise } from "../../../shared/money.js";
import { formatDisplayDate, monthName } from "../../../shared/statement.js";
import { api } from "../api.js";
import { useBook } from "../book.jsx";
import { EntryModal } from "../components/EntryModal.jsx";
import { EVENTS, takePendingNewEntry } from "../shortcuts.js";

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
    if (takePendingNewEntry()) setAdding(true);
    function onNew() {
      setAdding(true);
    }
    window.addEventListener(EVENTS.NEW_ENTRY, onNew);
    return () => window.removeEventListener(EVENTS.NEW_ENTRY, onNew);
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
          <div>
            <h2>{monthName(data.today.month)} cashflow</h2>
            <p className="muted chart-subhead">Running balance, money in, and money out across the month</p>
          </div>
          <p className="legend chart-legend">
            <span className="swatch balance">Balance</span>
            <span className="swatch credit">In</span>
            <span className="swatch debit">Out</span>
          </p>
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

      <section className="panel">
        <header className="panel-head">
          <h2>Largest payments</h2>
          <span className="muted">{monthName(data.today.month)}</span>
        </header>
        <OutflowList rows={data.month.rows} />
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

function niceScale(min, max, ticks = 4) {
  const padMin = Math.min(min, 0);
  const padMax = Math.max(max, 0);
  if (padMin === padMax) return { min: padMin - 100, max: padMax + 100, ticks: [padMin - 100, 0, padMax + 100] };
  const rawSpan = padMax - padMin;
  const rough = rawSpan / Math.max(ticks - 1, 1);
  const pow = 10 ** Math.floor(Math.log10(Math.abs(rough) || 1));
  const niceStep = [1, 2, 2.5, 5, 10].map((n) => n * pow).find((n) => n >= rough) || rough;
  const niceMin = Math.floor(padMin / niceStep) * niceStep;
  const niceMax = Math.ceil(padMax / niceStep) * niceStep;
  const values = [];
  for (let value = niceMin; value <= niceMax + niceStep / 2; value += niceStep) values.push(value);
  return { min: niceMin, max: niceMax, ticks: values };
}

function compactRupee(paise) {
  const rupees = (paise ?? 0) / 100;
  const abs = Math.abs(rupees);
  const sign = rupees < 0 ? "−" : "";
  if (abs >= 10000000) return `${sign}${(abs / 10000000).toFixed(abs >= 100000000 ? 0 : 1)}Cr`;
  if (abs >= 100000) return `${sign}${(abs / 100000).toFixed(abs >= 1000000 ? 0 : 1)}L`;
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
  return `${sign}${Math.round(abs)}`;
}

function buildSeriesPath(points, key, toX, toY) {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${toX(point.day).toFixed(1)} ${toY(point[key]).toFixed(1)}`)
    .join(" ");
}

function MonthTrendChart({ rows, broughtForward, year, month }) {
  const [hover, setHover] = useState(null);

  const chart = useMemo(() => {
    if (!rows?.length) return null;

    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    let creditPaise = 0;
    let debitPaise = 0;
    const points = [{
      day: 1,
      balance: toPaise(broughtForward) ?? 0,
      credit: 0,
      debit: 0,
      label: formatDisplayDate(`${year}-${String(month).padStart(2, "0")}-01`),
      description: "Brought forward",
      entryCredit: "0.00",
      entryDebit: "0.00",
    }];

    for (const row of rows) {
      creditPaise += toPaise(row.credit) ?? 0;
      debitPaise += toPaise(row.debit) ?? 0;
      points.push({
        day: Number(row.date.slice(8, 10)),
        balance: toPaise(row.balance) ?? 0,
        credit: creditPaise,
        debit: debitPaise,
        label: formatDisplayDate(row.date),
        description: row.description,
        entryCredit: row.credit,
        entryDebit: row.debit,
      });
    }

    const values = points.flatMap((point) => [point.balance, point.credit, point.debit]);
    const scale = niceScale(Math.min(...values), Math.max(...values), 5);
    const width = 720;
    const height = 280;
    const margin = { top: 16, right: 18, bottom: 36, left: 58 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    const span = scale.max - scale.min || 1;
    const toX = (day) => margin.left + ((day - 1) / Math.max(daysInMonth - 1, 1)) * plotW;
    const toY = (value) => margin.top + plotH - ((value - scale.min) / span) * plotH;
    const dayTicks = [];
    const step = daysInMonth <= 14 ? 2 : daysInMonth <= 21 ? 3 : 5;
    for (let day = 1; day <= daysInMonth; day += step) dayTicks.push(day);
    if (dayTicks[dayTicks.length - 1] !== daysInMonth) dayTicks.push(daysInMonth);

    return {
      points,
      scale,
      width,
      height,
      margin,
      plotW,
      plotH,
      toX,
      toY,
      dayTicks,
      daysInMonth,
      balancePath: buildSeriesPath(points, "balance", toX, toY),
      creditPath: buildSeriesPath(points, "credit", toX, toY),
      debitPath: buildSeriesPath(points, "debit", toX, toY),
      areaPath: `${buildSeriesPath(points, "balance", toX, toY)} L ${toX(points[points.length - 1].day).toFixed(1)} ${toY(0).toFixed(1)} L ${toX(points[0].day).toFixed(1)} ${toY(0).toFixed(1)} Z`,
    };
  }, [rows, broughtForward, year, month]);

  if (!chart) return <p className="muted">This month’s cashflow will appear here once you add an entry.</p>;

  const {
    points, scale, width, height, margin, plotW, plotH, toX, toY, dayTicks,
    balancePath, creditPath, debitPath, areaPath,
  } = chart;
  const active = hover == null ? null : points[Math.max(0, Math.min(points.length - 1, hover))];

  function onMove(event) {
    const svg = event.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * width;
    let best = 0;
    let bestDist = Infinity;
    points.forEach((point, index) => {
      const dist = Math.abs(toX(point.day) - x);
      if (dist < bestDist) {
        best = index;
        bestDist = dist;
      }
    });
    setHover(best);
  }

  return (
    <div className="trend-wrap">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="trend-chart detailed"
        role="img"
        aria-label={`Balance, money in, and money out across ${monthName(month)}`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {scale.ticks.map((tick) => (
          <g key={`y-${tick}`}>
            <line
              x1={margin.left}
              x2={margin.left + plotW}
              y1={toY(tick)}
              y2={toY(tick)}
              className={tick === 0 ? "trend-zero" : "trend-grid"}
            />
            <text x={margin.left - 10} y={toY(tick) + 4} className="trend-axis" textAnchor="end">
              {compactRupee(tick)}
            </text>
          </g>
        ))}

        {dayTicks.map((day) => (
          <text key={`x-${day}`} x={toX(day)} y={height - 12} className="trend-axis" textAnchor="middle">
            {day}
          </text>
        ))}

        <path d={areaPath} className="trend-area" />
        <path d={creditPath} className="trend-line credit" fill="none" />
        <path d={debitPath} className="trend-line debit" fill="none" />
        <path d={balancePath} className="trend-line balance" fill="none" />

        {points.map((point, index) => (
          <g key={`pts-${index}`}>
            <circle cx={toX(point.day)} cy={toY(point.credit)} r="3" className="trend-dot credit" />
            <circle cx={toX(point.day)} cy={toY(point.debit)} r="3" className="trend-dot debit" />
            <circle cx={toX(point.day)} cy={toY(point.balance)} r="3.5" className="trend-dot balance" />
          </g>
        ))}

        {active && (
          <g className="trend-hover">
            <line
              x1={toX(active.day)}
              x2={toX(active.day)}
              y1={margin.top}
              y2={margin.top + plotH}
              className="trend-crosshair"
            />
            <circle cx={toX(active.day)} cy={toY(active.balance)} r="5.5" className="trend-dot balance active" />
            <circle cx={toX(active.day)} cy={toY(active.credit)} r="5" className="trend-dot credit active" />
            <circle cx={toX(active.day)} cy={toY(active.debit)} r="5" className="trend-dot debit active" />
          </g>
        )}
      </svg>

      {active && (
        <aside className="trend-tooltip" aria-live="polite">
          <p className="trend-tooltip-date">{active.label}</p>
          <p className="trend-tooltip-desc">{active.description}</p>
          <dl>
            <div><dt>Balance</dt><dd className={active.balance < 0 ? "debit" : "credit"}>{formatRupee(paiseToAmount(active.balance))}</dd></div>
            <div><dt>In (cum.)</dt><dd className="credit">{formatRupee(paiseToAmount(active.credit))}</dd></div>
            <div><dt>Out (cum.)</dt><dd className="debit">{formatRupee(paiseToAmount(active.debit))}</dd></div>
            {(active.entryCredit !== "0.00" || active.entryDebit !== "0.00") && (
              <div>
                <dt>This entry</dt>
                <dd className={active.entryCredit !== "0.00" ? "credit" : "debit"}>
                  {active.entryCredit !== "0.00" ? formatRupee(active.entryCredit) : `−${formatRupee(active.entryDebit)}`}
                </dd>
              </div>
            )}
          </dl>
        </aside>
      )}
    </div>
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
