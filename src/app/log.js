/**
 * Widget debug logging (off in production unless ?debug=1 or localStorage bots_widget_debug=1).
 * Never log full tokens — use redactOpenId in matrix layer if needed.
 */
export const isDebug =
  typeof location !== "undefined" &&
  (new URLSearchParams(location.search).has("debug") ||
    (typeof localStorage !== "undefined" && localStorage.getItem("bots_widget_debug") === "1"));

export function dlog() {
  if (!isDebug) return;
  // eslint-disable-next-line no-console
  console.log.apply(console, ["[WIDGET]"].concat(Array.prototype.slice.call(arguments)));
}
