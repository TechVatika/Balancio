import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import { askConfirm, flash } from "../dialog.js";

const LEVELS = [
  ["all", "All levels"],
  ["info", "Info"],
  ["warn", "Warnings"],
  ["error", "Errors"],
  ["security", "Security"],
];

const CATEGORIES = [
  ["all", "All categories"],
  ["auth", "Auth"],
  ["book", "Books"],
  ["ledger", "Ledger"],
  ["report", "Reports"],
  ["ui", "Pages"],
  ["system", "System"],
];

function formatWhen(value) {
  const raw = String(value ?? "");
  const date = new Date(raw.includes("T") ? raw : raw.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return raw;
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  const time = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return `${dd}-${mm}-${yyyy}, ${time}`;
}

function formatIp(ip) {
  const value = String(ip ?? "").trim();
  if (!value) return "";
  if (value === "127.0.0.1" || value === "::1") return `${value} (this machine)`;
  return value;
}

function formatMeta(meta) {
  if (!meta || typeof meta !== "object") return null;
  const copy = { ...meta };
  const agent = copy.userAgent;
  delete copy.userAgent;
  return { rest: Object.keys(copy).length ? copy : null, agent: agent || null };
}

export function Activity() {
  const [level, setLevel] = useState("all");
  const [category, setCategory] = useState("all");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ limit: "200" });
    if (level !== "all") params.set("level", level);
    if (category !== "all") params.set("category", category);
    return api(`/api/logs?${params}`)
      .then((next) => setData(next))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [level, category]);

  useEffect(() => {
    load();
  }, [load]);

  async function onClear() {
    const ok = await askConfirm({
      title: "Clear activity log?",
      text: "This removes every stored activity row from the database. Daily log files on the server are kept.",
      confirmText: "Clear log",
      danger: true,
    });
    if (!ok) return;
    setClearing(true);
    try {
      await api("/api/logs", { method: "DELETE" });
      flash("Activity log cleared.");
      await load();
    } catch (err) {
      flash(err.message, "error");
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Activity</p>
          <h1>System log</h1>
        </div>
        <div className="toolbar">
          <button type="button" className="btn secondary" onClick={load} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <button type="button" className="btn secondary" onClick={onClear} disabled={clearing || !data?.logs?.length}>
            {clearing ? "Clearing…" : "Clear log"}
          </button>
        </div>
      </header>

      <section className="panel">
        <div className="log-filters">
          <label className="field">
            <span>Level</span>
            <select value={level} onChange={(event) => setLevel(event.target.value)}>
              {LEVELS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Category</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              {CATEGORIES.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <p className="muted log-count">
            {data ? `${data.logs.length} shown · ${data.total} total` : "—"}
          </p>
        </div>

        {error && <p className="form-error">{error}</p>}

        {!error && loading && !data && <p className="loading">Loading activity…</p>}

        {!error && data && data.logs.length === 0 && (
          <p className="muted">No activity matches these filters yet.</p>
        )}

        {data && data.logs.length > 0 && (
          <ul className="log-list">
            {data.logs.map((row) => (
              <li key={row.id} className={`log-item level-${row.level}`}>
                <div className="log-meta">
                  <span className={`log-level ${row.level}`}>{row.level}</span>
                  <span className="log-category">{row.category}.{row.action}</span>
                  <time dateTime={row.at}>{formatWhen(row.at)}</time>
                </div>
                <p className="log-message">{row.message}</p>
                <div className="log-foot">
                  {row.ip && <span className="muted">IP {formatIp(row.ip)}</span>}
                  {(() => {
                    const detail = formatMeta(row.meta);
                    if (!detail) return null;
                    return (
                      <>
                        {detail.rest && (
                          <code className="log-meta-json">{JSON.stringify(detail.rest)}</code>
                        )}
                        {detail.agent && (
                          <span className="muted log-agent" title={detail.agent}>{detail.agent}</span>
                        )}
                      </>
                    );
                  })()}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
