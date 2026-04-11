/**
 * Early theme from sessionStorage before main bundle (reduces default blue flash).
 * Keep STORE_SITE_APPEARANCE_KEY and color maps in sync with store-app.js
 * (applyWidgetBaseTheme / applyThemeColor / applyFaviconForWidgetTheme).
 */
(function () {
  var STORE_SITE_APPEARANCE_KEY = "storeSiteAppearanceV1";
  var FAVICON_V = "storesite7";

  function applyHint(widgetTheme) {
    var t = (widgetTheme && String(widgetTheme).toLowerCase().trim()) || "dark";
    if (t === "light" || t === "red" || t === "green") {
      document.documentElement.setAttribute("data-theme", t);
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    var map = {
      blue: "#3d8bfd",
      red: "#e85d6f",
      green: "#3dcc85",
      black: "#6b7280",
    };
    var hoverMap = {
      blue: "#5ba3ff",
      red: "#ff7a8a",
      green: "#4ae397",
      black: "#8b95a5",
    };
    var byTheme = { dark: "blue", light: "black", red: "red", green: "green" };
    var accentName = byTheme[t] || "blue";
    if (!map[accentName]) accentName = "blue";
    document.documentElement.style.setProperty("--accent", map[accentName]);
    document.documentElement.style.setProperty(
      "--accent-hover",
      hoverMap[accentName] || map[accentName]
    );
    if (t !== "light" && t !== "red" && t !== "green") {
      t = "dark";
    }
    var href = "static/favicon-" + t + ".png?v=" + FAVICON_V;
    var link = document.getElementById("store-site-favicon");
    if (link && link.getAttribute("href") !== href) {
      link.setAttribute("href", href);
    }
  }

  try {
    var q =
      typeof location !== "undefined" && location.search
        ? new URLSearchParams(location.search)
        : null;
    var sid = q ? parseInt(q.get("store_bot_id") || "0", 10) : 0;
    if (sid < 1) return;
    var raw = sessionStorage.getItem(STORE_SITE_APPEARANCE_KEY);
    if (!raw) return;
    var o = JSON.parse(raw);
    if (!o || parseInt(String(o.store_bot_id || "0"), 10) !== sid) return;
    if (o.widget_theme) applyHint(o.widget_theme);
  } catch (_e) {
    /* ignore */
  }
})();
