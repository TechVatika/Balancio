import { useEffect, useState } from "react";
import { paiseToAmount, toPaise } from "../../../shared/money.js";
import { api } from "../api.js";
import { useBook } from "../book.jsx";
import { formatDisplayDate } from "../../../shared/statement.js";

function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function EntryModal({ entry, onClose, onSaved }) {
  const { notify } = useBook();
  const startingSide = entry && entry.debit !== "0.00" ? "debit" : "credit";
  const startingAmount = entry ? (entry.credit !== "0.00" ? entry.credit : entry.debit) : "";
  const [date, setDate] = useState(entry?.date || todayIso());
  const [description, setDescription] = useState(entry?.description || "");
  const [side, setSide] = useState(startingSide);
  const [amount, setAmount] = useState(startingAmount);
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
    const paise = toPaise(amount);
    if (!description.trim()) {
      setError("Enter a description.");
      return;
    }
    if (paise == null || paise <= 0) {
      setError("Enter the amount without a minus. Choose credit for money in, or debit for money out.");
      return;
    }
    const body = {
      date,
      description: description.trim(),
      credit: side === "credit" ? paiseToAmount(paise) : "0.00",
      debit: side === "debit" ? paiseToAmount(paise) : "0.00",
    };
    setSaving(true);
    setError("");
    try {
      if (entry) await api(`/api/transactions/${entry.id}`, { method: "PUT", body });
      else await api("/api/transactions", { method: "POST", body });
      notify(entry ? "Entry updated." : `Saved to ${formatDisplayDate(body.date)}.`);
      onSaved(body);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="modal-back" onMouseDown={entry ? undefined : onClose}>
      <form className="modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={onSubmit}>
        <p className="eyebrow">{entry ? "Edit line" : "New line"}</p>
        <h2>{entry ? "Update this entry" : "Add an entry"}</h2>
        <label className="field">
          <span>Date</span>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
        </label>
        <label className="field">
          <span>Description</span>
          <textarea
            rows={2}
            maxLength={500}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Salary, rent, UPI, ATM…"
            required
          />
        </label>
        <div className="field">
          <span>Side</span>
          <div className="segment" role="group" aria-label="Credit or debit">
            <button type="button" aria-pressed={side === "credit"} className={side === "credit" ? "on" : ""} onClick={() => setSide("credit")}>
              Credit · in
            </button>
            <button type="button" aria-pressed={side === "debit"} className={side === "debit" ? "on" : ""} onClick={() => setSide("debit")}>
              Debit · out
            </button>
          </div>
        </div>
        <label className="field">
          <span>Amount</span>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0.00"
            required
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn" disabled={saving}>{saving ? "Saving…" : entry ? "Save changes" : "Add entry"}</button>
        </div>
      </form>
    </div>
  );
}
