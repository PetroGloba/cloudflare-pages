import { dlog } from "./log.js";

/** Centralized non-fatal error reporting for iframe diagnostics. */
export function reportError(context, err) {
  var msg = err && err.message ? err.message : String(err);
  console.error("[WIDGET]", context, msg, err || "");
  dlog("error_detail", context, err);
}
