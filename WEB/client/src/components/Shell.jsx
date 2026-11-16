import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { formatRupee } from "../../../shared/money.js";
import { fyLabel, fyStartFromDate } from "../../../shared/statement.js";
import { api } from "../api.js";
import { useBook } from "../book.jsx";
import { askPrompt, flash } from "../dialog.js";
import { OpeningModal } from "./OpeningModal.jsx";

const NEW_BOOK = "__new__";

function FyBadge() {
  const { meta } = useBook();
  const location = useLocation();
  const navigate = useNavigate();
  const todayStart = fyStartFromDate();

  const onYearPage = location.pathname === "/year";
  const urlYear = onYearPage ? Number(new URLSearchParams(location.search).get("year")) : NaN;
  const activeStart = Number.isInteger(urlYear) ? urlYear : todayStart;

  const options = Array.from(new Set([todayStart, activeStart, ...(meta?.fys ?? [])])).sort((a, b) => b - a);

  function onChange(event) {
    navigate(`/year?year=${event.target.value}`);
  }

  return (
    <select className="fy-badge" aria-label="Financial year" title="Financial year" value={activeStart} onChange={onChange}>
      {options.map((start) => (
        <option key={start} value={start}>{fyLabel(start)}</option>
      ))}
    </select>
  );
}

function BookPicker() {
  const { books, bookId, setBookId, refreshBooks } = useBook();
  if (!books) return null;

  async function onChange(event) {
    const { value } = event.target;
    if (value !== NEW_BOOK) {
      setBookId(Number(value));
      return;
    }
    const name = await askPrompt({ title: "New book", placeholder: "e.g. Petty Cash", confirmText: "Create" });
    if (!name) return;
    try {
      const book = await api("/api/books", { method: "POST", body: { name } });
      await refreshBooks();
      setBookId(book.id);
      flash("Book created.");
    } catch (error) {
      flash(error.message, "error");
    }
  }

  return (
    <label className="book-picker">
      <span>Book</span>
      <select aria-label="Active book" value={bookId} onChange={onChange}>
        {books.map((book) => (
          <option key={book.id} value={book.id}>{book.name}</option>
        ))}
        <option value={NEW_BOOK}>+ New book…</option>
      </select>
    </label>
  );
}

export function Shell({ children }) {
  const { pathname } = useLocation();
  const { meta, metaError, refresh, toast } = useBook();
  const [openingOpen, setOpeningOpen] = useState(false);

  useEffect(() => {
    const titles = {
      "/": "Overview",
      "/month": "Month ledger",
      "/year": "Year ledger",
      "/reports": "Reports",
      "/account": "Account",
    };
    document.title = `${titles[pathname] ?? "Balancio"} · Balancio`;
  }, [pathname]);

  return (
    <div className="shell">
      <aside className="rail">
        <div className="brand">
          <img className="mark" src="/logo.png" alt="" />
          <div>
            <div className="brand-name">Balancio</div>
            <div className="brand-tag">Your money, in balance.</div>
          </div>
        </div>
        <hr className="rail-divider" />
        <BookPicker />
        <nav className="nav">
          <NavLink to="/" end>Overview</NavLink>
          <NavLink to="/month">Month ledger</NavLink>
          <NavLink to="/year">Year ledger</NavLink>
          <NavLink to="/reports">Reports</NavLink>
          <NavLink to="/account">Account</NavLink>
        </nav>
        <div className="rail-foot">
          <button type="button" className="opening-btn" onClick={() => setOpeningOpen(true)} disabled={!meta}>
            <span>Current balance</span>
            <strong className={meta && meta.balance.startsWith("-") ? "debit" : ""}>{meta ? formatRupee(meta.balance) : "—"}</strong>
          </button>
          <p className="rail-note">Your personal ledger. Credit is money in, debit is money out.</p>
        </div>
      </aside>
      <main className="canvas" id="content">
        <FyBadge />
        {metaError && meta && <p className="form-error banner">{metaError}</p>}
        {metaError && !meta ? (
          <section className="panel connection">
            <p className="eyebrow">Can’t open the book</p>
            <h1>MySQL isn’t ready yet.</h1>
            <p>{metaError}</p>
            <button type="button" className="btn" onClick={refresh}>Try again</button>
          </section>
        ) : meta ? (
          children
        ) : (
          <p className="loading">Opening the book…</p>
        )}
      </main>
      {openingOpen && meta && (
        <OpeningModal openingBalance={meta.openingBalance} onClose={() => setOpeningOpen(false)} />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
