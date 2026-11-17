import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { logEvent } from "./activityLog.js";
import { api, setActiveBookIdSource } from "./api.js";

const BookContext = createContext(null);
const STORAGE_KEY = "balancio_book_id";

function readStoredBookId() {
  try {
    const value = Number(window.localStorage.getItem(STORAGE_KEY));
    return Number.isInteger(value) && value > 0 ? value : 1;
  } catch {
    return 1;
  }
}

export function BookProvider({ children }) {
  const [tick, setTick] = useState(0);
  const [meta, setMeta] = useState(null);
  const [metaError, setMetaError] = useState("");
  const [toast, setToast] = useState("");
  const [bookId, setBookIdState] = useState(readStoredBookId);
  const [books, setBooks] = useState(null);
  const bookIdRef = useRef(bookId);

  useEffect(() => {
    setActiveBookIdSource(() => bookIdRef.current);
  }, []);

  const refresh = useCallback(() => setTick((n) => n + 1), []);
  const notify = useCallback((message) => setToast(message), []);

  const refreshBooks = useCallback(() => {
    return api("/api/books").then((data) => {
      setBooks(data.books);
      return data.books;
    });
  }, []);

  const setBookId = useCallback((next) => {
    const previous = bookIdRef.current;
    bookIdRef.current = next;
    setBookIdState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // Private browsing or disabled storage — the switch still works for this tab.
    }
    setTick((n) => n + 1);
    if (previous !== next) {
      const name = books?.find((book) => book.id === next)?.name;
      logEvent(
        "book.switch",
        name ? `Switched to book “${name}”.` : `Switched to book #${next}.`,
        { fromBookId: previous, toBookId: next, name: name || null },
      );
    }
  }, [books]);

  useEffect(() => {
    refreshBooks().catch(() => {
      // Surfaced via metaError below instead; the book switcher just stays hidden.
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    setMetaError("");
    api("/api/meta")
      .then((data) => {
        if (!cancelled) setMeta(data);
      })
      .catch((error) => {
        if (!cancelled) setMetaError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(""), 2800);
    return () => clearTimeout(id);
  }, [toast]);

  return (
    <BookContext.Provider value={{ tick, refresh, meta, metaError, toast, notify, bookId, setBookId, books, refreshBooks }}>
      {children}
    </BookContext.Provider>
  );
}

export function useBook() {
  const value = useContext(BookContext);
  if (!value) throw new Error("useBook must be used inside BookProvider");
  return value;
}
