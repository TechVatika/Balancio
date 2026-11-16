import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { ensureSecret, getSecret, setSecret } from "./secrets.js";

const COOKIE_NAME = "balancio_session";
const SESSION_DAYS = 30;

// Only guards the password-checking routes (login/setup), so normal status polling never gets caught in it.
const guessLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Wait a few minutes and try again." },
});

function jwtSecret() {
  return ensureSecret("SESSION_SECRET", () => crypto.randomBytes(48).toString("hex"));
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function wrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function setSessionCookie(res) {
  const token = jwt.sign({ sub: "admin" }, jwtSecret(), { expiresIn: `${SESSION_DAYS}d` });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
  });
}

function assertPassword(value) {
  const password = String(value ?? "");
  if (password.length < 8) throw httpError(400, "Use a password with at least 8 characters.");
  if (password.length > 200) throw httpError(400, "That password is too long.");
  return password;
}

/** Protects routes: requires a valid session cookie, and that an admin password has been set. */
export function requireAuth(req, res, next) {
  const hash = getSecret("ADMIN_PASSWORD_HASH");
  if (!hash) return next(httpError(401, "Set up a password first, from the Account page."));
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return next(httpError(401, "Sign in to continue."));
  try {
    jwt.verify(token, jwtSecret());
    next();
  } catch {
    next(httpError(401, "Your session expired. Sign in again."));
  }
}

export function authRouter() {
  const router = Router();

  router.get("/status", (req, res) => {
    const configured = Boolean(getSecret("ADMIN_PASSWORD_HASH"));
    let authenticated = false;
    const token = req.cookies?.[COOKIE_NAME];
    if (configured && token) {
      try {
        jwt.verify(token, jwtSecret());
        authenticated = true;
      } catch {
        authenticated = false;
      }
    }
    res.json({ configured, authenticated });
  });

  router.post("/setup", guessLimiter, wrap(async (req, res) => {
    if (getSecret("ADMIN_PASSWORD_HASH")) throw httpError(409, "A password is already set. Sign in instead.");
    const password = assertPassword(req.body?.password);
    const hash = await bcrypt.hash(password, 12);
    setSecret("ADMIN_PASSWORD_HASH", hash);
    setSessionCookie(res);
    res.status(201).json({ ok: true });
  }));

  router.post("/login", guessLimiter, wrap(async (req, res) => {
    const hash = getSecret("ADMIN_PASSWORD_HASH");
    if (!hash) throw httpError(409, "No password is set up yet.");
    const password = String(req.body?.password ?? "");
    const ok = password && await bcrypt.compare(password, hash);
    if (!ok) throw httpError(401, "That password is incorrect.");
    setSessionCookie(res);
    res.json({ ok: true });
  }));

  router.post("/logout", (req, res) => {
    res.clearCookie(COOKIE_NAME);
    res.json({ ok: true });
  });

  router.post("/change-password", requireAuth, wrap(async (req, res) => {
    const hash = getSecret("ADMIN_PASSWORD_HASH");
    const current = String(req.body?.currentPassword ?? "");
    const ok = await bcrypt.compare(current, hash);
    if (!ok) throw httpError(401, "Your current password is incorrect.");
    const next = assertPassword(req.body?.newPassword);
    setSecret("ADMIN_PASSWORD_HASH", await bcrypt.hash(next, 12));
    setSessionCookie(res);
    res.json({ ok: true });
  }));

  return router;
}
