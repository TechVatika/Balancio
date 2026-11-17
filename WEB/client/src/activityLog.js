import { api } from "./api.js";

/** Fire-and-forget activity note for the Activity page. Never throws. */
export function logEvent(action, message, meta) {
  api("/api/logs/event", {
    method: "POST",
    body: {
      action,
      message,
      meta: meta && typeof meta === "object" ? meta : undefined,
    },
  }).catch(() => {});
}
