/** Shared keyboard helpers — Ledgerly-style single keys and G-then chords. */

export const SHORTCUTS = [
  { keys: "N", action: "New entry" },
  { keys: "P", action: "Paste entries (ledger)" },
  { keys: "/", action: "Focus search (ledger)" },
  { keys: "B", action: "Opening balance" },
  { keys: "G then O", action: "Go to Overview" },
  { keys: "G then M", action: "Go to Month ledger" },
  { keys: "G then Y", action: "Go to Year ledger" },
  { keys: "G then R", action: "Go to Reports" },
  { keys: "G then L", action: "Go to Activity" },
  { keys: "G then A", action: "Go to Account" },
  { keys: "?", action: "Show keyboard shortcuts" },
];

export function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

export function plainKey(event) {
  if (event.metaKey || event.ctrlKey || event.altKey) return null;
  if (isTypingTarget(event.target)) return null;
  return event.key;
}

export const EVENTS = {
  NEW_ENTRY: "balancio:new-entry",
  PASTE: "balancio:paste",
  FOCUS_SEARCH: "balancio:focus-search",
};

export function emitShortcut(name) {
  window.dispatchEvent(new CustomEvent(name));
}

export function takePendingNewEntry() {
  try {
    if (sessionStorage.getItem("balancio:open-entry") === "1") {
      sessionStorage.removeItem("balancio:open-entry");
      return true;
    }
  } catch {
    // Private browsing.
  }
  return false;
}

export function markPendingNewEntry() {
  try {
    sessionStorage.setItem("balancio:open-entry", "1");
  } catch {
    // Private browsing.
  }
}
