import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { databaseErrorMessage, dropDb, isDatabaseError } from "./db.js";
import { ledgerRouter } from "./routes/ledger.js";
import { securityRouter } from "./routes/security.js";
import { booksRouter } from "./routes/books.js";
import { logsRouter } from "./routes/logs.js";
import { authRouter, requireAuth } from "./auth.js";
import { log, writeLog } from "./logger.js";

const app = express();
// No trust-proxy setting: this server isn't behind a reverse proxy by default, and trusting
// X-Forwarded-For here would let a client spoof its IP to dodge the rate limiters below.
// If you do put it behind a proxy/CDN, set this to that proxy's hop count.
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));

// General API throttle: blunts scripted/DoS-style floods. Real volumetric DDoS
// still needs network-level mitigation (a CDN/WAF) in front of this server.
app.use("/api", rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
}));

app.use("/api/auth", authRouter());
app.use("/api/security", requireAuth, securityRouter());
app.use("/api/books", requireAuth, booksRouter());
app.use("/api/logs", requireAuth, logsRouter());
app.use("/api", requireAuth, ledgerRouter());

const clientDist = fileURLToPath(new URL("../../client/dist", import.meta.url));
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({ error: "That request was not valid JSON." });
  }
  const databaseDown = isDatabaseError(error);
  if (databaseDown) dropDb();
  const status = databaseDown ? 503 : error.status || 500;
  const message = databaseDown
    ? databaseErrorMessage(error)
    : error.message || "Something went wrong.";
  if (databaseDown) console.error(message);
  else if (status >= 500) console.error(error);
  if (status >= 500 || databaseDown) {
    log({
      level: "error",
      category: "system",
      action: databaseDown ? "db.error" : "request.error",
      message,
      req,
      meta: { status, path: req.path, method: req.method },
    });
  }
  if (error.retryAfter) res.set("Retry-After", String(error.retryAfter));
  const payload = { error: message };
  if (error.retryAfter) payload.retryAfter = error.retryAfter;
  res.status(status).json(payload);
});

const port = Number(process.env.PORT || 4000);
app.listen(port, "127.0.0.1", () => {
  console.log(`Balancio API  http://127.0.0.1:${port}`);
  writeLog({
    level: "info",
    category: "system",
    action: "server.start",
    message: `API listening on 127.0.0.1:${port}`,
  }).catch(() => {});
});
