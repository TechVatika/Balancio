import { useEffect } from "react";
import { SHORTCUTS } from "../shortcuts.js";

export function ShortcutsHelp({ onClose }) {
  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-back" role="presentation">
      <div className="modal shortcuts-modal" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title">
        <h2 id="shortcuts-title">Keyboard shortcuts</h2>
        <p className="modal-copy">Same idea as Ledgerly — press a key when you are not typing in a field.</p>
        <ul className="shortcut-list">
          {SHORTCUTS.map((row) => (
            <li key={row.keys}>
              <kbd>{row.keys}</kbd>
              <span>{row.action}</span>
            </li>
          ))}
        </ul>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
