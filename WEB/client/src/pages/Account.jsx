import { useEffect, useState } from "react";
import { formatRupee } from "../../../shared/money.js";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { useBook } from "../book.jsx";
import { askConfirm, askPrompt, flash } from "../dialog.js";
import { formatDisplayDate } from "../../../shared/statement.js";

export function Account() {
  const { logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  async function onLogout() {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Account</p>
          <h1>Login &amp; security</h1>
          <p className="lede">Your password, session, and the encryption keys protecting this book.</p>
        </div>
        <div className="toolbar">
          <button type="button" className="btn secondary" onClick={onLogout} disabled={loggingOut}>
            {loggingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </header>

      <section className="panel">
        <header className="panel-head">
          <h2>Login details</h2>
        </header>
        <p className="muted">Single account password. There is no username — one password unlocks the whole book.</p>
        <ChangePasswordForm />
      </section>

      <section className="panel">
        <header className="panel-head">
          <h2>Books</h2>
        </header>
        <p className="muted">Each book is its own ledger, with its own opening balance and entries. Switch books from the sidebar.</p>
        <BookManager />
      </section>

      <section className="panel">
        <header className="panel-head">
          <h2>Data encryption</h2>
        </header>
        <p className="muted">
          Entry descriptions are encrypted at rest with AES-256-GCM. A new key is generated the first time the
          app is used each day; past keys are kept (wrapped by a separate master key) so older entries stay
          readable. Keys themselves are never shown here.
        </p>
        <KeyHistory />
      </section>
    </div>
  );
}

function ChangePasswordForm() {
  const { changePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    setError("");
    setDone(false);
    if (newPassword !== confirm) {
      setError("The new passwords don’t match.");
      return;
    }
    setSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="form-grid" onSubmit={onSubmit}>
      <label className="field">
        <span>Current password</span>
        <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
      </label>
      <label className="field">
        <span>New password</span>
        <input type="password" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />
      </label>
      <label className="field">
        <span>Confirm new password</span>
        <input type="password" minLength={8} value={confirm} onChange={(event) => setConfirm(event.target.value)} required />
      </label>
      {error && <p className="form-error">{error}</p>}
      {done && <p className="form-success">Password updated.</p>}
      <button type="submit" className="btn" disabled={saving}>{saving ? "Saving…" : "Change password"}</button>
    </form>
  );
}

function BookManager() {
  const { books, bookId, setBookId, refreshBooks } = useBook();
  const [busyId, setBusyId] = useState(null);

  if (!books) return <p className="loading">Loading books…</p>;

  async function onRename(book) {
    const name = await askPrompt({ title: "Rename book", initialValue: book.name, confirmText: "Save" });
    if (!name || name === book.name) return;
    setBusyId(book.id);
    try {
      await api(`/api/books/${book.id}`, { method: "PUT", body: { name } });
      await refreshBooks();
    } catch (error) {
      flash(error.message, "error");
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(book) {
    const ok = await askConfirm({
      title: "Delete this book?",
      text: `"${book.name}" will be removed. This can’t be undone.`,
      confirmText: "Delete",
      danger: true,
    });
    if (!ok) return;
    setBusyId(book.id);
    try {
      await api(`/api/books/${book.id}`, { method: "DELETE" });
      const next = await refreshBooks();
      if (bookId === book.id) setBookId(next[0]?.id ?? 1);
      flash("Book deleted.");
    } catch (error) {
      flash(error.message, "error");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <ul className="recent-list key-list">
      {books.map((book) => {
        const canDelete = book.entryCount === 0 && books.length > 1;
        return (
          <li key={book.id}>
            <span className="date">{book.name}{book.id === bookId ? " · active" : ""}</span>
            <span className="desc">{formatRupee(book.openingBalance)} opening · {book.entryCount} {book.entryCount === 1 ? "entry" : "entries"}</span>
            <span className="book-actions">
              <button type="button" className="btn quiet" disabled={busyId === book.id} onClick={() => onRename(book)}>Rename</button>
              <button
                type="button"
                className="btn quiet"
                disabled={busyId === book.id || !canDelete}
                title={canDelete ? "" : "Move or delete its entries first, and keep at least one book."}
                onClick={() => onDelete(book)}
              >
                Delete
              </button>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function KeyHistory() {
  const [keys, setKeys] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api("/api/security/keys")
      .then((data) => {
        if (!cancelled) setKeys(data.keys);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <p className="form-error">{error}</p>;
  if (!keys) return <p className="loading">Loading key history…</p>;
  if (!keys.length) return <p className="muted">No encryption key yet — it’s created the first time an entry is saved.</p>;

  return (
    <ul className="recent-list key-list">
      {keys.map((key) => (
        <li key={key.keyDate}>
          <span className="date">{formatDisplayDate(key.keyDate)}</span>
          <span className="desc">Daily encryption key</span>
          <strong className="muted">{key.keyDate === keys[0].keyDate ? "Active" : "Retained"}</strong>
        </li>
      ))}
    </ul>
  );
}
