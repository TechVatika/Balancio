import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { formatRupee } from "../../../shared/money.js";
import { fyLabel, fyStartFromDate } from "../../../shared/statement.js";
import { api } from "../api.js";
import { useBook } from "../book.jsx";
import { askPrompt, flash } from "../dialog.js";
import { EVENTS, emitShortcut, markPendingNewEntry, plainKey } from "../shortcuts.js";
import { OpeningModal } from "./OpeningModal.jsx";
import { RailMenu } from "./RailMenu.jsx";
import { ShortcutsHelp } from "./ShortcutsHelp.jsx";

function FyPicker() {
  const { meta } = useBook();
  const location = useLocation();
  const navigate = useNavigate();
  const todayStart = fyStartFromDate();

  const onYearPage = location.pathname === "/year";
  const urlYear = onYearPage ? Number(new URLSearchParams(location.search).get("year")) : NaN;
  const activeStart = Number.isInteger(urlYear) ? urlYear : todayStart;

  const options = Array.from(new Set([todayStart, activeStart, ...(meta?.fys ?? [])]))
    .sort((a, b) => b - a)
    .map((start) => ({
      value: start,
      label: fyLabel(start),
      hint: start === todayStart ? "Current" : undefined,
    }));

  return (
    <RailMenu
      className="rail-field"
      label="Financial year"
      ariaLabel="Financial year"
      value={activeStart}
      options={options}
      onChange={(year) => navigate(`/year?year=${year}`)}
    />
  );
}

function BookPicker() {
  const { books, bookId, setBookId, refreshBooks } = useBook();
  if (!books) return null;

  const active = books.find((book) => book.id === bookId) ?? books[0];

  async function createBook() {
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
    <div className="book-picker">
      <div className="book-picker__head">
        <span className="rail-field__label">Book</span>
        <button type="button" className="book-picker__add" onClick={createBook}>
          + New
        </button>
      </div>
      <RailMenu
        className="book-picker__control"
        buttonClassName="book-picker__select"
        ariaLabel="Active book"
        value={active?.id ?? bookId}
        options={books.map((book) => ({
          value: book.id,
          label: book.name,
          hint: `${book.entryCount} ${book.entryCount === 1 ? "entry" : "entries"}`,
        }))}
        onChange={(id) => setBookId(Number(id))}
      />
      {active && (
        <p className="book-picker__meta">
          <span>{active.entryCount} {active.entryCount === 1 ? "entry" : "entries"}</span>
          <span aria-hidden="true">·</span>
          <span>Open {formatRupee(active.openingBalance)}</span>
        </p>
      )}
    </div>
  );
}

const GO_ROUTES = {
  o: "/",
  m: "/month",
  y: "/year",
  r: "/reports",
  l: "/activity",
  a: "/account",
};

export function Shell() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { meta, metaError, refresh, toast } = useBook();
  const [openingOpen, setOpeningOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const goArmedUntil = useRef(0);

  useEffect(() => {
    const titles = {
      "/": "Overview",
      "/month": "Month ledger",
      "/year": "Year ledger",
      "/reports": "Reports",
      "/activity": "Activity",
      "/account": "Account",
    };
    document.title = `${titles[pathname] ?? "Balancio"} · Balancio`;
  }, [pathname]);

  useEffect(() => {
    function onKey(event) {
      if (shortcutsOpen || openingOpen) return;
      const key = plainKey(event);
      if (key == null) return;

      const now = Date.now();
      if (now < goArmedUntil.current) {
        const route = GO_ROUTES[key.toLowerCase()];
        goArmedUntil.current = 0;
        if (route) {
          event.preventDefault();
          navigate(route);
        }
        return;
      }

      if (key === "?" || (key === "/" && event.shiftKey)) {
        event.preventDefault();
        setShortcutsOpen(true);
        return;
      }

      const lower = key.toLowerCase();
      if (lower === "g") {
        event.preventDefault();
        goArmedUntil.current = now + 1500;
        return;
      }
      if (lower === "n") {
        event.preventDefault();
        if (pathname === "/" || pathname === "/month" || pathname === "/year") {
          emitShortcut(EVENTS.NEW_ENTRY);
        } else {
          markPendingNewEntry();
          navigate("/month");
        }
        return;
      }
      if (lower === "p") {
        event.preventDefault();
        if (pathname === "/month" || pathname === "/year") {
          emitShortcut(EVENTS.PASTE);
        } else {
          navigate("/month");
          window.setTimeout(() => emitShortcut(EVENTS.PASTE), 0);
        }
        return;
      }
      if (key === "/") {
        event.preventDefault();
        if (pathname === "/month" || pathname === "/year") {
          emitShortcut(EVENTS.FOCUS_SEARCH);
        } else {
          navigate("/month");
          window.setTimeout(() => emitShortcut(EVENTS.FOCUS_SEARCH), 0);
        }
        return;
      }
      if (lower === "b") {
        event.preventDefault();
        if (meta) setOpeningOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, pathname, meta, shortcutsOpen, openingOpen]);

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
        <div className="rail-controls">
          <FyPicker />
          <BookPicker />
        </div>
        <hr className="rail-divider" />
        <nav className="nav">
          <NavLink to="/" end>Overview</NavLink>
          <NavLink to="/month">Month ledger</NavLink>
          <NavLink to="/year">Year ledger</NavLink>
          <NavLink to="/reports">Reports</NavLink>
          <NavLink to="/activity">Activity</NavLink>
          <NavLink to="/account">Account</NavLink>
        </nav>
        <div className="rail-foot">
          <hr className="rail-divider" />
          <button type="button" className="opening-btn" onClick={() => setOpeningOpen(true)} disabled={!meta}>
            <span>Current balance</span>
            <strong className={meta && meta.balance.startsWith("-") ? "debit" : ""}>{meta ? formatRupee(meta.balance) : "—"}</strong>
          </button>
          <p className="rail-note">Your personal ledger. Credit is money in, debit is money out.</p>
          <p className="rail-note rail-shortcuts">Press <kbd>?</kbd> for shortcuts</p>
        </div>
      </aside>
      <main className="canvas" id="content">
        {metaError && meta && <p className="form-error banner">{metaError}</p>}
        {metaError && !meta ? (
          <section className="panel connection">
            <p className="eyebrow">Can’t open the book</p>
            <h1>MySQL isn’t ready yet.</h1>
            <p>{metaError}</p>
            <button type="button" className="btn" onClick={refresh}>Try again</button>
          </section>
        ) : meta ? (
          <Outlet />
        ) : (
          <p className="loading">Opening the book…</p>
        )}
      </main>
      {openingOpen && meta && (
        <OpeningModal openingBalance={meta.openingBalance} onClose={() => setOpeningOpen(false)} />
      )}
      {shortcutsOpen && <ShortcutsHelp onClose={() => setShortcutsOpen(false)} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
