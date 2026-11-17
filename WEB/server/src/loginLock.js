const FAIL_LIMIT = 3;
const COOLDOWN_MS = 30 * 60 * 1000;

/** @type {Map<string, { count: number, lockedUntil: number }>} */
const attempts = new Map();

export function clientIp(req) {
  // This server listens on loopback by default, so X-Forwarded-For is not trusted.
  // Record the real TCP peer; strip the IPv4-mapped IPv6 prefix when present.
  const raw = req.socket?.remoteAddress || req.ip || "unknown";
  return String(raw).replace(/^::ffff:/i, "") || "unknown";
}

export function clientAgent(req) {
  return String(req.get("user-agent") || "").slice(0, 200) || null;
}

function entryFor(ip) {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry) return { count: 0, lockedUntil: 0 };
  if (entry.lockedUntil && now >= entry.lockedUntil) {
    attempts.delete(ip);
    return { count: 0, lockedUntil: 0 };
  }
  return entry;
}

/** Throws a 429 http-shaped error if this IP is in the cooldown window. */
export function assertNotLocked(req) {
  const ip = clientIp(req);
  const entry = entryFor(ip);
  if (entry.lockedUntil && Date.now() < entry.lockedUntil) {
    const retryAfter = Math.ceil((entry.lockedUntil - Date.now()) / 1000);
    const minutes = Math.max(1, Math.ceil(retryAfter / 60));
    const error = new Error(
      `Too many failed attempts from this connection. Wait ${minutes} minute${minutes === 1 ? "" : "s"} before trying again.`,
    );
    error.status = 429;
    error.retryAfter = retryAfter;
    throw error;
  }
}

/** Records a failed guess. Returns { locked, remaining, retryAfter }. */
export function recordFailedAttempt(req) {
  const ip = clientIp(req);
  const entry = entryFor(ip);
  entry.count += 1;

  if (entry.count >= FAIL_LIMIT) {
    entry.lockedUntil = Date.now() + COOLDOWN_MS;
    entry.count = FAIL_LIMIT;
    attempts.set(ip, entry);
    const retryAfter = Math.ceil(COOLDOWN_MS / 1000);
    return { locked: true, remaining: 0, retryAfter };
  }

  attempts.set(ip, entry);
  return { locked: false, remaining: FAIL_LIMIT - entry.count, retryAfter: 0 };
}

export function clearFailedAttempts(req) {
  attempts.delete(clientIp(req));
}

export function lockMessage(result) {
  if (result.locked) {
    return "Too many failed attempts from this connection. Wait 30 minutes before trying again.";
  }
  const left = result.remaining;
  return `That password is incorrect. ${left} attempt${left === 1 ? "" : "s"} left before a 30-minute cooldown.`;
}
