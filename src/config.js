/** Build-time API origin (esbuild define); empty string = use page origin or window.__STORE_API_ORIGIN__. */
export const API_BASE_FROM_BUILD =
  typeof API_BASE_URL !== "undefined" ? String(API_BASE_URL || "").trim() : "";

export const qs = new URLSearchParams(
  typeof location !== "undefined" ? location.search : ""
);

var cachedApiBase = "";

function computeApiBase() {
  if (cachedApiBase !== "") return cachedApiBase;
  if (typeof window !== "undefined" && window.__STORE_API_ORIGIN__) {
    cachedApiBase = String(window.__STORE_API_ORIGIN__ || "").replace(/\/$/, "");
    return cachedApiBase;
  }
  if (API_BASE_FROM_BUILD) {
    cachedApiBase = API_BASE_FROM_BUILD.replace(/\/$/, "");
    return cachedApiBase;
  }
  cachedApiBase = "";
  return cachedApiBase;
}

/**
 * Absolute URL for API calls (fetch, sendBeacon).
 * @param {string} path must start with /
 */
export function resolveApiPath(path) {
  var rel = path.charAt(0) === "/" ? path : "/" + path;
  var base = computeApiBase();
  if (base) return base + rel;
  if (typeof location === "undefined" || !location.origin || location.origin === "null") {
    return rel;
  }
  return location.origin + rel;
}

/** @deprecated use resolveApiPath */
export function apiUrl(path) {
  return resolveApiPath(path);
}

export const STORE_BOT_ID_QUERY = parseInt(qs.get("store_bot_id") || "0", 10);

var resolvedStoreBotId = 0;

export function getResolvedStoreBotId() {
  if (resolvedStoreBotId >= 1) return resolvedStoreBotId;
  return STORE_BOT_ID_QUERY;
}

/**
 * Resolve tenant: ?store_bot_id= first, else GET /api/public/store-by-host.
 * @returns {Promise<number>}
 */
export async function resolveStoreBotIdEarly() {
  if (STORE_BOT_ID_QUERY >= 1) {
    resolvedStoreBotId = STORE_BOT_ID_QUERY;
    return STORE_BOT_ID_QUERY;
  }
  var host =
    typeof location !== "undefined" && location.hostname ? location.hostname : "";
  if (!host) {
    resolvedStoreBotId = 0;
    return 0;
  }
  try {
    var r = await fetch(
      resolveApiPath(
        "/api/public/store-by-host?host=" + encodeURIComponent(host.toLowerCase())
      ),
      { credentials: "omit" }
    );
    if (!r.ok) {
      resolvedStoreBotId = 0;
      return 0;
    }
    var j = await r.json();
    var id = parseInt(String(j.store_bot_id || "0"), 10);
    if (id >= 1) {
      resolvedStoreBotId = id;
      return id;
    }
  } catch (_) {
    /* ignore */
  }
  resolvedStoreBotId = 0;
  return 0;
}
