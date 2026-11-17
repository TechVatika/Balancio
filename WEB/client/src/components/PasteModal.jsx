import { useEffect, useMemo, useState } from "react";
import { formatRupee } from "../../../shared/money.js";
import { formatDisplayDate, parseStatement } from "../../../shared/statement.js";
import { api } from "../api.js";
import { useBook } from "../book.jsx";

function exampleText() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();
  const date = `${day}-${month}-${year}`;
  return [
    "Date, Description, Credit, Debit",
    `${date}, Salary, 85000, 0`,
    `${date}, House rent, 0, 15000`,
    `${date}, "UPI — tea", 0, 40`,
  ].join("\n");
}

export function PasteModal({ onClose, onSaved }) {
  const { notify } = useBook();
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const parsed = useMemo(() => parseStatement(text), [text]);

  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function onSubmit(event) {
    event.preventDefault();
    if (!parsed.rows.length || parsed.errors.length) return;
    setSaving(true);
    setError("");
    try {
      await api("/api/transactions/bulk", { method: "POST", body: { entries: parsed.rows } });
      notify(parsed.rows.length === 1 ? "1 entry pasted." : `${parsed.rows.length} entries pasted.`);
      onSaved(parsed.rows);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  const blocked = parsed.errors.length > 0 || parsed.rows.length === 0;

  return (
    <div className="modal-back">
      <form className="modal wide" onSubmit={onSubmit}>
        <p className="eyebrow">Bring a statement in</p>
        <h2>Paste entries</h2>
        <p className="modal-copy">
          One line per entry: date, description, credit, debit. Tabs or commas both work.
          A bank header such as Date, Narration, Debit, Credit is read by name.
        </p>
        <label className="field">
          <span>Statement text</span>
          <textarea
            autoFocus
            rows={7}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={"Date, Description, Credit, Debit\n16-11-2026, Salary, 85000, 0\n16-11-2026, House rent, 0, 15000"}
          />
        </label>
        <button type="button" className="btn quiet" onClick={() => setText(exampleText())}>Fill an example</button>

        {parsed.rows.length > 0 && (
          <div className="preview">
            <p>{parsed.rows.length} {parsed.rows.length === 1 ? "entry" : "entries"} ready</p>
            <ul>
              {parsed.rows.slice(0, 6).map((row, index) => (
                <li key={`${row.date}-${index}`}>
                  <span>{formatDisplayDate(row.date)}</span>
                  <span>{row.description}</span>
                  <strong className={row.credit !== "0.00" ? "credit" : "debit"}>
                    {row.credit !== "0.00" ? formatRupee(row.credit) : formatRupee(row.debit)}
                  </strong>
                </li>
              ))}
            </ul>
            {parsed.rows.length > 6 && <p className="muted">and {parsed.rows.length - 6} more</p>}
          </div>
        )}

        {parsed.errors.length > 0 && (
          <ul className="error-list">
            {parsed.errors.slice(0, 6).map((item) => (
              <li key={`${item.line}-${item.message}`}>Line {item.line}: {item.message}</li>
            ))}
          </ul>
        )}
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn" disabled={saving || blocked}>
            {saving ? "Adding…" : parsed.rows.length ? `Add ${parsed.rows.length}` : "Add entries"}
          </button>
        </div>
      </form>
    </div>
  );
}
