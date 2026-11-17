import { useEffect, useId, useRef, useState } from "react";
import { formatRupee } from "../../../shared/money.js";
import { formatDisplayDate } from "../../../shared/statement.js";

function balanceClass(value, { bold = true } = {}) {
  const base = bold ? "num balance" : "num";
  return String(value ?? "0.00").startsWith("-") ? `${base} debit` : base;
}

export function StatementTable({
  kicker,
  title,
  note,
  broughtForward,
  closingBalance,
  totals,
  rows,
  onEdit,
  onCopy,
  onDuplicate,
  onDelete,
  totalLabel = "Period total",
  emptyMessage = "No entries in this period. Add one, or paste a statement.",
  showBroughtForward = true,
}) {
  return (
    <section className="passbook">
      <header className="passbook-head">
        <div className="passbook-brand">
          <img className="passbook-mark" src="/logo.png" alt="" />
          <div>
            <p className="passbook-kicker">{kicker}</p>
            <p className="passbook-product">Balancio · Passbook statement</p>
          </div>
        </div>
        <div className="passbook-title-block">
          <h2>{title}</h2>
          <p className="passbook-note">{note}</p>
        </div>
        <div className="passbook-stamp" aria-hidden="true">STATEMENT</div>
      </header>
      <div className="passbook-scroll">
        <table className="statement">
          <colgroup>
            <col className="col-date" />
            <col className="col-desc" />
            <col className="col-num" />
            <col className="col-num" />
            <col className="col-num" />
            <col className="col-actions" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Description</th>
              <th scope="col" className="num">Credit</th>
              <th scope="col" className="num">Debit</th>
              <th scope="col" className="num">Balance</th>
              <th scope="col" className="actions-col"><span className="sr">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {showBroughtForward && (
            <tr className="bf-row">
              <td data-label="Date" />
              <td data-label="Description">Brought forward</td>
              <td data-label="Credit" className="num" />
              <td data-label="Debit" className="num" />
              <td data-label="Balance" className={balanceClass(broughtForward, { bold: false })}>{formatRupee(broughtForward)}</td>
              <td data-label="" />
            </tr>
            )}
            {rows.length === 0 && (
              <tr className="empty-row">
                <td colSpan={6}>{emptyMessage}</td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id}>
                <td data-label="Date" className="date">{formatDisplayDate(row.date)}</td>
                <td data-label="Description" className="desc">{row.description}</td>
                <td data-label="Credit" className={row.credit === "0.00" ? "num" : "num credit"}>{formatRupee(row.credit, { empty: true })}</td>
                <td data-label="Debit" className={row.debit === "0.00" ? "num" : "num debit"}>{formatRupee(row.debit, { empty: true })}</td>
                <td data-label="Balance" className={balanceClass(row.balance)}>{formatRupee(row.balance)}</td>
                <RowActions
                  row={row}
                  onEdit={onEdit}
                  onCopy={onCopy}
                  onDuplicate={onDuplicate}
                  onDelete={onDelete}
                />
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td data-label="" colSpan={2}>{totalLabel} · {totals.count} {totals.count === 1 ? "entry" : "entries"}</td>
              <td data-label="Credit" className={totals.credit === "0.00" ? "num" : "num credit"}>{formatRupee(totals.credit)}</td>
              <td data-label="Debit" className={totals.debit === "0.00" ? "num" : "num debit"}>{formatRupee(totals.debit)}</td>
              <td data-label="Balance" className={balanceClass(closingBalance)}>{formatRupee(closingBalance)}</td>
              <td data-label="" />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function RowActions({ row, onEdit, onCopy, onDuplicate, onDelete }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return undefined;
    function onDoc(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    }
    function onKey(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function run(action) {
    setOpen(false);
    action(row);
  }

  return (
    <td data-label="" className="row-actions">
      <div className="row-actions__inline">
        <IconButton label="Edit" onClick={() => onEdit(row)}><PencilIcon /></IconButton>
        <IconButton label="Copy" onClick={() => onCopy(row)}><CopyIcon /></IconButton>
        <IconButton label="Duplicate" onClick={() => onDuplicate(row)}><DuplicateIcon /></IconButton>
        <IconButton label="Delete" danger onClick={() => onDelete(row)}><TrashIcon /></IconButton>
      </div>

      <div className="row-actions__menu" ref={rootRef}>
        <button
          type="button"
          className="row-actions__more"
          aria-label="Row actions"
          title="Actions"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen((value) => !value)}
        >
          <MoreIcon />
        </button>
        {open && (
          <div id={menuId} className="row-actions__dropdown" role="menu">
            <button type="button" role="menuitem" onClick={() => run(onEdit)}>
              <PencilIcon /> Edit
            </button>
            <button type="button" role="menuitem" onClick={() => run(onCopy)}>
              <CopyIcon /> Copy
            </button>
            <button type="button" role="menuitem" onClick={() => run(onDuplicate)}>
              <DuplicateIcon /> Duplicate
            </button>
            <button type="button" role="menuitem" className="danger" onClick={() => run(onDelete)}>
              <TrashIcon /> Delete
            </button>
          </div>
        )}
      </div>
    </td>
  );
}

function IconButton({ label, danger = false, onClick, children }) {
  return (
    <button type="button" className={danger ? "danger" : ""} aria-label={label} title={label} onClick={onClick}>
      {children}
    </button>
  );
}

function Glyph({ children }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

function MoreIcon() {
  return (
    <Glyph>
      <circle cx="12" cy="5" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="1.4" fill="currentColor" stroke="none" />
    </Glyph>
  );
}

function PencilIcon() {
  return (
    <Glyph>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z" />
    </Glyph>
  );
}

function CopyIcon() {
  return (
    <Glyph>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </Glyph>
  );
}

function DuplicateIcon() {
  return (
    <Glyph>
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </Glyph>
  );
}

function TrashIcon() {
  return (
    <Glyph>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </Glyph>
  );
}
