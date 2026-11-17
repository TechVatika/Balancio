import { Router } from "express";
import { getDb } from "../db.js";
import { listKeyHistory } from "../crypto.js";

function wrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

export function securityRouter() {
  const router = Router();

  router.use(wrap(async (req, res, next) => {
    req.db = await getDb();
    next();
  }));

  router.get("/keys", wrap(async (req, res) => {
    const history = await listKeyHistory(req.db);
    res.json({
      keys: history.map((row) => ({ id: row.id })),
    });
  }));

  return router;
}
