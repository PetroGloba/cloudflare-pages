/**
 * Optional server-side diagnostic log:
 * - Meta tag from dynamic /matrix-widget/ HTML, or
 * - GET /api/matrix-widget/client-log-config { enabled: true } (for static index from nginx).
 * Do not put secrets in log lines; server applies additional masking.
 */
import { apiUrl, getResolvedStoreBotId } from "../config.js";

/** @returns {boolean} */
export function isRemoteClientLogEnabled() {
  if (
    typeof document !== "undefined" &&
    document.querySelector('meta[name="bots-widget-client-log"]')?.getAttribute("content") === "1"
  ) {
    return true;
  }
  if (typeof window !== "undefined" && window.__BOTS_WIDGET_REMOTE_LOG__ === true) {
    return true;
  }
  return false;
}

/**
 * After GET /api/matrix-widget/client-log-config (static index has no meta).
 * Buffers early rlog() calls until this runs — otherwise handshake/content_loaded happen before fetch completes.
 * @param {boolean} enabled
 */
export function setRemoteClientLogFromConfig(enabled) {
  var on = !!enabled;
  remoteLogConfigResolved = true;
  if (typeof window !== "undefined") {
    window.__BOTS_WIDGET_REMOTE_LOG__ = on;
  }
  if (!on) {
    pendingBeforeConfig.length = 0;
    return;
  }
  while (pendingBeforeConfig.length) {
    queue.push(pendingBeforeConfig.shift());
  }
  wirePagehide();
  if (queue.length && !flushTimer) {
    flushTimer = setTimeout(flush, 600);
  }
}

var remoteLogConfigResolved = false;
/** @type {string[]} */
var pendingBeforeConfig = [];
var queue = [];
var flushTimer = null;
var pagehideWired = false;

function wirePagehide() {
  if (pagehideWired || typeof window === "undefined" || !isRemoteClientLogEnabled()) return;
  pagehideWired = true;
  window.addEventListener("pagehide", function () {
    if (!queue.length) return;
    var sid = getResolvedStoreBotId();
    var body = JSON.stringify({
      store_bot_id: sid >= 1 ? sid : null,
      lines: queue.splice(0, 50),
    });
    var url = apiUrl("/api/matrix-widget/client-log");
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: body,
      credentials: "same-origin",
    }).catch(function () {
      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
        }
      } catch (_) {
        /* ignore */
      }
    });
  });
}

function flush() {
  flushTimer = null;
  if (!isRemoteClientLogEnabled() || !queue.length) return;
  var lines = queue.splice(0, 30);
    var sid = getResolvedStoreBotId();
    var body = JSON.stringify({
      store_bot_id: sid >= 1 ? sid : null,
      lines: lines,
    });
  var url = apiUrl("/api/matrix-widget/client-log");
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body: body,
    credentials: "same-origin",
  })
    .then(function (r) {
      if (!r.ok) {
        console.warn("[WIDGET] client-log HTTP", r.status);
      }
    })
    .catch(function (e) {
      console.warn("[WIDGET] client-log fetch failed", e);
    });
}

/**
 * Queue one line for POST to server (batched). Max length enforced client-side.
 * @param {...unknown} args joined with space
 */
export function rlog() {
  var line = Array.prototype.slice
    .call(arguments)
    .map(function (x) {
      return String(x);
    })
    .join(" ")
    .slice(0, 500);
  if (isRemoteClientLogEnabled()) {
    wirePagehide();
    queue.push(line);
    if (!flushTimer) flushTimer = setTimeout(flush, 600);
    return;
  }
  if (!remoteLogConfigResolved) {
    if (pendingBeforeConfig.length < 100) {
      pendingBeforeConfig.push(line);
    }
    return;
  }
}
