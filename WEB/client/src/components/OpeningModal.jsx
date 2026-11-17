import { useEffect, useState } from "react";
import { toPaise } from "../../../shared/money.js";
import { api } from "../api.js";
import { useBook } from "../book.jsx";

export function OpeningModal({ openingBalance, onClose }) {
  const { refresh, notify } = useBook();
  const [amount, setAmount] = useState(openingBalance);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function onSubmit(event) {
    event.preventDefault();
    const trimmed = amount.trim();
    if (!trimmed) {
      setError("Enter an opening balance. Use 0 if the book starts empty.");
      return;
    }
    if (toPaise(trimmed) == null) {
      setError("Enter the opening balance as a number. Use a minus if the book starts overdrawn.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api("/api/settings", { method: "PUT", body: { openingBalance: trimmed } });
      refresh();
      notify("Opening balance saved.");
      onClose();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="modal-back">
      <form className="modal" onSubmit={onSubmit}>
        <p className="eyebrow">Before the first entry</p>
        <h2>Opening balance</h2>
        <p className="modal-copy">This is the balance already on hand before any line in Balancio. Every later balance starts from here.</p>
        <label className="field">
          <span>Amount</span>
          <input
            autoFocus
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0.00"
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn" disabled={saving}>{saving ? "Saving…" : "Save balance"}</button>
        </div>
      </form>
    </div>
  );
}
