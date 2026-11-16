let onUnauthorized = null;
let getActiveBookId = () => 1;

export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

export function setActiveBookIdSource(fn) {
  getActiveBookId = fn;
}

const BOOK_SCOPED_GET = [/^\/api\/meta\b/, /^\/api\/overview\b/, /^\/api\/ledger\b/, /^\/api\/report\b/];
const BOOK_SCOPED_BODY = [/^\/api\/settings\b/, /^\/api\/transactions\b/];

export async function api(path, { method = "GET", body } = {}) {
  let finalPath = path;
  let finalBody = body;
  if (method === "GET" && !/[?&]book=/.test(path) && BOOK_SCOPED_GET.some((pattern) => pattern.test(path))) {
    finalPath = `${path}${path.includes("?") ? "&" : "?"}book=${getActiveBookId()}`;
  } else if (body && body.bookId == null && BOOK_SCOPED_BODY.some((pattern) => pattern.test(path))) {
    finalBody = { ...body, bookId: getActiveBookId() };
  }

  let response;
  try {
    response = await fetch(finalPath, {
      method,
      credentials: "include",
      headers: finalBody ? { "Content-Type": "application/json" } : undefined,
      body: finalBody ? JSON.stringify(finalBody) : undefined,
    });
  } catch {
    throw new Error("The Balancio server is not running. Start it from the web folder with npm run dev.");
  }

  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && onUnauthorized) onUnauthorized();
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}
