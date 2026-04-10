/* DEPRECATED: maintained only for diff/reference. Production uses src/ + npm run build → static/app.bundle.js (see index.html). */
(function () {
  "use strict";

  /* ================================================================
   *  Constants & state
   * ================================================================ */
  var qs = new URLSearchParams(location.search);
  var STORE_BOT_ID = parseInt(qs.get("store_bot_id") || "0", 10);

  var LOCALES = [
    { code: "uk", label: "Українська" },
    { code: "en", label: "English" },
    { code: "pl", label: "Polski" },
    { code: "ru", label: "Русский" },
    { code: "ka", label: "ქართული" },
    { code: "ro", label: "Română" },
    { code: "kk", label: "Қазақша" },
  ];

  var API = {
    auth:         "/api/matrix-widget/auth",
    me:           "/api/store/me",
    cities:       "/api/store/cities",
    offers:       "/api/store/offers",
    purchase:     "/api/store/purchase",
    locale:       "/api/store/locale",
    i18n:         "/api/store/i18n",
    topupMethods: "/api/store/topup/methods",
    topupCreate:  "/api/store/topup/create",
    topupCheck:   "/api/store/topup/check",
    topupCancel:  "/api/store/topup/cancel",
    promo:        "/api/store/promo/activate",
    positions:    "/api/store/positions",
    structures:   "/api/store/structures",
    account:      "/api/store/account",
    accountPay:   "/api/store/account/payment",
    reviews:      "/api/store/reviews",
    reviewCreate: "/api/store/reviews/create",
    customBtns:   "/api/store/custom-buttons",
    posPhoto:     "/api/store/position/photo",
  };

  var TAB_ROOTS = {
    shop:    "#shop",
    topup:   "#topup",
    promo:   "#promo",
    reviews: "#reviews",
    account: "#account",
  };

  var S = {};
  var me = null;
  var historyStack = [];
  var renderToken = 0;
  var booted = false;

  var cityPage = 0;
  var currentCityId = null;
  var currentCityName = "";
  var topupPaymentId = null;

  var positionsCache = {};
  var confirmData = null;
  var resultState = null;

  var NO_PHOTO_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64' " +
    "viewBox='0 0 24 24' fill='%236b7280'%3E%3Cpath d='M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14" +
    "c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z'/%3E%3C/svg%3E";

  /* ================================================================
   *  i18n helper
   * ================================================================ */
  function t(key, kwargs) {
    var s = S[key] || key;
    if (kwargs) {
      Object.keys(kwargs).forEach(function (k) {
        s = s.split("{" + k + "}").join(String(kwargs[k]));
      });
    }
    return s;
  }

  /* ================================================================
   *  apiFetch — single place for all API calls
   * ================================================================ */
  function apiFetch(path, opts) {
    opts = opts || {};
    var method = opts.method || "GET";
    var headers = opts.headers || {};
    var timeoutMs = opts.timeoutMs || 15000;

    var fetchOpts = {
      method: method,
      credentials: "include",
      headers: headers,
    };
    if (opts.json !== undefined) {
      fetchOpts.headers["Content-Type"] = "application/json";
      fetchOpts.body = JSON.stringify(opts.json);
    }
    if (opts.body !== undefined) {
      fetchOpts.body = opts.body;
    }

    var controller = new AbortController();
    fetchOpts.signal = controller.signal;
    var timer = setTimeout(function () { controller.abort(); }, timeoutMs);

    return fetch(path, fetchOpts)
      .then(function (r) {
        clearTimeout(timer);
        if (r.status === 401) {
          handleUnauthorized();
          return Promise.reject(new Error("unauthorized"));
        }
        return r;
      })
      .catch(function (err) {
        clearTimeout(timer);
        throw err;
      });
  }

  function handleUnauthorized() {
    if (!booted) return;
    document.getElementById("appHeader").hidden = true;
    document.getElementById("bottomNav").hidden = true;
    showScreen("screen-expired");
    var el = document.getElementById("expired-msg");
    if (el) el.textContent = t("web.store.expired");
  }

  /* ================================================================
   *  Skeleton helpers
   * ================================================================ */
  function skeletonCards(n) {
    var html = "";
    for (var i = 0; i < n; i++) html += '<div class="skeleton skel-card"></div>';
    return html;
  }

  function skeletonPosCards(n) {
    var html = "";
    for (var i = 0; i < n; i++) html += '<div class="skeleton skel-pos-card"></div>';
    return html;
  }

  function skeletonLines(n) {
    var html = '<div class="skeleton skel-title"></div>';
    for (var i = 0; i < n; i++) {
      html += '<div class="skeleton skel-line' + (i % 3 === 2 ? " short" : "") + '"></div>';
    }
    return html;
  }

  function renderErrorRetry(container, msg, retryFn) {
    container.innerHTML = '<div class="error-box"><p class="msg">' + escHtml(msg) + "</p>" +
      '<button type="button" class="btn-primary btn-retry">' +
      escHtml(t("web.store.retry") || "↻") + "</button></div>";
    var btn = container.querySelector(".btn-retry");
    if (btn) btn.onclick = retryFn;
  }

  function escHtml(s) {
    var d = document.createElement("div");
    d.textContent = s || "";
    return d.innerHTML;
  }

  /* ================================================================
   *  Screen visibility (low level)
   * ================================================================ */
  var ALL_SCREENS = [
    "screen-auth", "screen-expired", "screen-loading",
    "screen-shop", "screen-topup", "screen-promo",
    "screen-reviews", "screen-account",
  ];

  function showScreen(id) {
    ALL_SCREENS.forEach(function (sid) {
      var el = document.getElementById(sid);
      if (el) el.hidden = (sid !== id);
    });
  }

  var ALL_SHOP_PANES = [
    "shop-pane-cities", "shop-pane-positions", "shop-pane-structures",
    "shop-pane-confirm", "shop-pane-result",
  ];

  function showShopPane(pane) {
    ALL_SHOP_PANES.forEach(function (pid) {
        var el = document.getElementById(pid);
      if (el) el.hidden = (pid !== pane);
    });
  }

  /* ================================================================
   *  Router
   * ================================================================ */
  function parseRoute(hash) {
    var h = (hash || "").replace(/^#\/?/, "");
    if (!h) return { name: "shop", params: {} };

    var parts = h.split("/");
    var name = parts[0];
    var params = {};

    if (name === "positions" && parts[1]) {
      params.city_id = parseInt(parts[1], 10);
      if (parts[2]) params.page = parseInt(parts[2], 10);
    } else if (name === "structures" && parts[1] && parts[2]) {
      params.city_id = parseInt(parts[1], 10);
      params.pos_id = parseInt(parts[2], 10);
    } else if (name === "confirm" && parts[1] && parts[2] && parts[3]) {
      params.city_id = parseInt(parts[1], 10);
      params.pos_id = parseInt(parts[2], 10);
      params.struct_id = parseInt(parts[3], 10);
    } else if (name === "account" && parts[1] === "payment" && parts[2]) {
      name = "account_payment";
      params.payment_id = parseInt(parts[2], 10);
    } else if (name === "review" && parts[1] === "create" && parts[2]) {
      name = "review_create";
      params.payment_id = parseInt(parts[2], 10);
    }

    return { name: name, params: params };
  }

  function navigate(hash, opts) {
    opts = opts || {};
    if (opts.resetStack) {
      historyStack = [];
    } else if (!opts.replace && !opts.isBack) {
      var cur = location.hash || "#shop";
      if (cur !== hash) historyStack.push(cur);
    }
    if (opts.replace) {
      history.replaceState(null, "", hash);
      onRouteChange();
    } else {
      location.hash = hash;
    }
  }

  function goBack() {
    if (historyStack.length > 0) {
      var prev = historyStack.pop();
      location.hash = prev;
    } else {
      var route = parseRoute(location.hash);
      var tabRoot = tabForRoute(route.name);
      if (location.hash !== TAB_ROOTS[tabRoot]) {
        historyStack = [];
        location.hash = TAB_ROOTS[tabRoot];
      }
    }
  }

  function tabForRoute(name) {
    if (name === "account" || name === "account_payment") return "account";
    if (name === "reviews" || name === "review_create") return "reviews";
    if (name === "topup") return "topup";
    if (name === "promo") return "promo";
    return "shop";
  }

  function updateBottomNav(activeTab) {
    document.querySelectorAll(".bnav-btn").forEach(function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-tab") === activeTab);
    });
  }

  function updateBackBtn(route) {
    var btn = document.getElementById("backBtn");
    var isRoot = Object.values(TAB_ROOTS).indexOf("#" + route.name) !== -1;
    btn.hidden = isRoot && historyStack.length === 0;
  }

  async function onRouteChange() {
    if (!booted) return;
    var route = parseRoute(location.hash);
    var tab = tabForRoute(route.name);
    updateBottomNav(tab);
    updateBackBtn(route);

    var token = ++renderToken;

    switch (route.name) {
      case "shop":
      case "cities":
        showScreen("screen-shop");
        showShopPane("shop-pane-cities");
        await showCities(0, token);
        break;
      case "positions":
        showScreen("screen-shop");
        showShopPane("shop-pane-positions");
        currentCityId = route.params.city_id;
        await loadPositions(route.params.city_id, route.params.page || 0, token);
        break;
      case "structures":
        showScreen("screen-shop");
        showShopPane("shop-pane-structures");
        currentCityId = route.params.city_id;
        await loadStructures(route.params.city_id, route.params.pos_id, token);
        break;
      case "confirm":
        showScreen("screen-shop");
        showShopPane("shop-pane-confirm");
        showConfirm(route.params, token);
        break;
      case "result":
        showScreen("screen-shop");
        showShopPane("shop-pane-result");
        showResult();
        break;
      case "topup":
        showScreen("screen-topup");
        resetTopupUI();
        break;
      case "promo":
        showScreen("screen-promo");
        document.getElementById("promo-result").textContent = "";
        document.getElementById("promo-input").value = "";
        break;
      case "reviews":
        showScreen("screen-reviews");
        await showReviews(0, token);
        break;
      case "review_create":
        showScreen("screen-reviews");
        await showReviewCreate(route.params.payment_id, token);
        break;
      case "account":
        showScreen("screen-account");
        await showAccount(0, token);
        break;
      case "account_payment":
        showScreen("screen-account");
        await showAccountPayment(route.params.payment_id, token);
        break;
      default:
        showScreen("screen-shop");
        showShopPane("shop-pane-cities");
        await showCities(0, token);
    }
  }

  /* ================================================================
   *  Theme & locale
   * ================================================================ */
  function applyThemeColor(name) {
    var map = {
      blue: "#3d8bfd", red: "#e85d6f",
      green: "#3dcc85", black: "#6b7280",
    };
    if (name && map[name]) {
      document.documentElement.style.setProperty("--accent", map[name]);
    }
  }

  function applyWidgetBaseTheme(theme) {
    var t = (theme && String(theme).toLowerCase()) || "dark";
    if (t === "light" || t === "red" || t === "green") {
      document.documentElement.setAttribute("data-theme", t);
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }

  function guessLocale() {
    var nav = (navigator.language || "uk").slice(0, 2).toLowerCase();
    return LOCALES.some(function (L) { return L.code === nav; }) ? nav : "uk";
  }

  async function loadI18n(locale) {
    try {
      var r = await apiFetch(API.i18n + "?locale=" + encodeURIComponent(locale));
      var j = await r.json();
      S = j.strings || {};
    } catch (_) { /* i18n may fail during initial auth — ignore */ }
  }

  /** @deprecated Outdated: production HTML uses lang-picker-trigger + lang-picker-menu; see src/store-app.js fillLocaleSelect. */
  function fillLocaleSelect(current) {
    var sel = document.getElementById("locale-select");
    sel.innerHTML = "";
    LOCALES.forEach(function (L) {
      var o = document.createElement("option");
      o.value = L.code;
      o.textContent = L.label;
      if (L.code === current) o.selected = true;
      sel.appendChild(o);
    });
    sel.onchange = async function () {
      var loc = sel.value;
      try {
        var r = await apiFetch(API.locale, { method: "POST", json: { locale: loc } });
        if (r.ok) {
          await loadI18n(loc);
          me.locale = loc;
          refreshLabels();
          onRouteChange();
        }
      } catch (_) { /* ignore */ }
    };
  }

  function refreshLabels() {
    var $ = function (id) { return document.getElementById(id); };
    $("bnav-shop").textContent    = t("web.widget.tab_shop");
    $("bnav-topup").textContent   = t("web.widget.tab_topup");
    $("bnav-promo").textContent   = t("web.widget.tab_promo");
    $("bnav-reviews").textContent = t("web.widget.nav_reviews") || t("review.menu_title") || "Reviews";
    $("bnav-account").textContent = t("web.widget.nav_account") || "Account";
    $("loading-msg").textContent  = t("web.store.loading");
    $("cities-title").textContent = t("web.store.cities_title");
    $("confirm-title").textContent = t("web.store.confirm_title");
    $("result-title").textContent = t("web.store.result_title");
    $("result-ok").textContent    = t("web.store.back");
    $("cities-prev").textContent  = t("web.store.prev");
    $("cities-next").textContent  = t("web.store.next");
    $("topup-title").textContent  = t("web.widget.tab_topup");
    $("topup-amount-label").textContent = t("web.widget.topup_amount");
    $("topup-amount-next").textContent  = t("web.store.next");
    $("topup-methods-hint").textContent = t("web.widget.topup_methods");
    $("topup-check-btn").textContent    = t("web.widget.topup_check");
    $("topup-cancel-btn").textContent   = t("web.widget.topup_cancel");
    $("promo-title").textContent      = t("web.widget.tab_promo");
    $("promo-hint-label").textContent = t("web.widget.promo_hint");
    $("promo-apply-btn").textContent  = t("web.widget.promo_apply");
    if (me) {
      $("hdr-balance").textContent = t("web.store.balance", {
        balance: me.balance, currency: me.currency,
      });
    }
  }

  /* ================================================================
   *  Widget API — capability negotiation (modern Element protocol)
   * ================================================================ */
  /* Same set as matrix-widget-api CurrentApiVersions — Element needs MSC2871 etc. to send notify_capabilities. */
  var WIDGET_SUPPORTED_API_VERSIONS = [
    "0.0.1",
    "0.0.2",
    "org.matrix.msc2762",
    "org.matrix.msc2762_update_state",
    "org.matrix.msc2871",
    "org.matrix.msc2873",
    "org.matrix.msc2931",
    "org.matrix.msc2974",
    "org.matrix.msc2876",
    "org.matrix.msc3819",
    "town.robin.msc3846",
    "org.matrix.msc3869",
    "org.matrix.msc3973",
    "org.matrix.msc4039",
  ];
  var WIDGET_ID =
    qs.get("widgetId") ||
    (STORE_BOT_ID >= 1 ? "bots_platform_store_" + STORE_BOT_ID : "bots_platform_store");
  /** Optional: set from server via sync_worker (MATRIX_WIDGET_EXPECTED_PARENT_ORIGIN) to pin before first toWidget. */
  var EXPECTED_PARENT_ORIGIN = (qs.get("parent_origin") || "").trim();
  var pinnedParentOrigin = null;
  var widgetApiReady = false;
  var pendingToWidgetRequests = {};
  /** Pending resolves for outbound fromWidget calls (e.g. supported_api_versions before capabilities; matrix-widget-api getClientVersions). */
  var pendingOutboundReplies = {};

  console.log("[WIDGET] init: WIDGET_ID=" + WIDGET_ID + " STORE_BOT_ID=" + STORE_BOT_ID);
  console.log("[WIDGET] URL params:", location.search);

  function _genId() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  /**
   * Element Web uses https origins; Element Desktop reports e.g. vector://vector.
   * Browsers only reliably deliver postMessage to http(s) targetOrigin; custom schemes
   * often drop messages and Element then hits "Request timed out" (spinners).
   */
  function _postMessageTarget() {
    if (!pinnedParentOrigin) return "*";
    if (/^https?:\/\//i.test(pinnedParentOrigin)) return pinnedParentOrigin;
    return "*";
  }

  /**
   * Pin parent window origin after first valid widget traffic from Element.
   * If parent_origin query matches deployment, first message must use that origin.
   */
  function _pinFromEvent(ev) {
    var o = ev.origin || "";
    if (!o) {
      return false;
    }
    if (EXPECTED_PARENT_ORIGIN && o !== EXPECTED_PARENT_ORIGIN) {
      console.warn("[WIDGET] rejected postMessage origin (expected parent_origin param):", o);
      return false;
    }
    if (pinnedParentOrigin === null) {
      pinnedParentOrigin = o;
      console.log("[WIDGET] pinned parent origin:", o);
      return true;
    }
    return o === pinnedParentOrigin;
  }

  function _sendToParent(action, data, requestId) {
    var msg = {
      api: "fromWidget",
      widgetId: WIDGET_ID,
      requestId: requestId || _genId(),
      action: action,
      data: data || {},
    };
    console.log("[WIDGET] >>> SEND to parent:", action, JSON.stringify(msg));
    window.parent.postMessage(msg, _postMessageTarget());
  }

  function _respondToWidget(requestId, action, data) {
    var msg = {
      api: "fromWidget",
      widgetId: WIDGET_ID,
      requestId: requestId,
      action: action,
      response: data || {},
    };
    console.log("[WIDGET] >>> RESPOND to parent:", action, JSON.stringify(msg));
    window.parent.postMessage(msg, _postMessageTarget());
  }

  /** Like matrix-widget-api WidgetApi messaging.getClientVersions: ask host for supported_versions before replying to capabilities. */
  function _requestHostSupportedVersions() {
    return new Promise(function (resolve, reject) {
      var rid = _genId();
      var to = window.setTimeout(function () {
        if (pendingOutboundReplies[rid]) {
          delete pendingOutboundReplies[rid];
          reject(new Error("supported_api_versions_exchange_timeout"));
        }
      }, 4000);
      pendingOutboundReplies[rid] = function (msg) {
        window.clearTimeout(to);
        var r = msg.response || {};
        var vers = r.supported_versions;
        if (!Array.isArray(vers) && msg.data && Array.isArray(msg.data.supported_versions)) {
          vers = msg.data.supported_versions;
        }
        resolve(Array.isArray(vers) ? vers : []);
      };
      _sendToParent("supported_api_versions", {}, rid);
    });
  }

  function _scheduleNotifyCapabilitiesFallback() {
    window.setTimeout(function () {
      if (!widgetApiReady) {
        console.warn("[WIDGET] notify_capabilities not received within 2s after capabilities; proceeding");
        widgetApiReady = true;
      }
    }, 2000);
  }

  /* Log ALL incoming messages for debugging */
  window.addEventListener("message", function (ev) {
    var d = ev.data;
    if (!d || typeof d !== "object") return;

    /* Log all postMessage traffic */
    if (d.api === "toWidget" || d.api === "fromWidget") {
      console.log("[WIDGET] <<< RECV from " + ev.origin + ":", d.api, d.action, "reqId=" + d.requestId, JSON.stringify(d).substring(0, 500));
    }

    /* Host reply to our outbound fromWidget supported_api_versions (same requestId, api:fromWidget). */
    if (d.api === "fromWidget") {
      var outRid = String(d.requestId || "");
      if (outRid && pendingOutboundReplies[outRid]) {
        console.log("[WIDGET] ← resolved pending outbound rid=" + outRid + " action=" + (d.action || ""));
        if (!_pinFromEvent(ev)) {
          /* Leave pendingOutboundReplies in place so probe timeout still rejects the Promise. */
          return;
        }
        pendingOutboundReplies[outRid](d);
        delete pendingOutboundReplies[outRid];
        return;
      }
    }

    if (d.api !== "toWidget") return;

    if (!_pinFromEvent(ev)) {
      console.warn("[WIDGET] ignored toWidget (origin pin rejected):", ev.origin);
      return;
    }

    var action = d.action || "";

    /* Element asks widget for supported API versions — or host echoes our probe with same requestId. */
    if (action === "supported_api_versions") {
      var ridSv = String(d.requestId || "");
      if (ridSv && pendingOutboundReplies[ridSv]) {
        console.log("[WIDGET] host reply (toWidget) for supported_api_versions probe rid=" + ridSv);
        pendingOutboundReplies[ridSv](d);
        delete pendingOutboundReplies[ridSv];
        return;
      }
      console.log("[WIDGET] Handling supported_api_versions");
      _respondToWidget(d.requestId, action, {
        supported_versions: WIDGET_SUPPORTED_API_VERSIONS,
      });
      return;
    }

    /* Element asks widget which capabilities it wants */
    if (action === "capabilities") {
      console.log("[WIDGET] Handling capabilities request (getClientVersions order)");
      var capReqId = d.requestId;
      var capAction = action;
      _requestHostSupportedVersions()
        .then(function (vers) {
          console.log("[WIDGET] host supported_versions count=" + vers.length);
          /* Element / matrix-widget-api: after MSC2871 handshake, get_openid works with no extra
           * capability objects; OpenID is negotiated via supported API versions, not this array. */
          _respondToWidget(capReqId, capAction, { capabilities: [] });
          _scheduleNotifyCapabilitiesFallback();
        })
        .catch(function (e) {
          console.warn("[WIDGET] supported_api_versions exchange failed, replying capabilities anyway", e);
          _respondToWidget(capReqId, capAction, { capabilities: [] });
          _scheduleNotifyCapabilitiesFallback();
        });
      return;
    }

    /* Element confirms granted capabilities */
    if (action === "notify_capabilities") {
      console.log("[WIDGET] Handling notify_capabilities — API is READY");
      widgetApiReady = true;
      _respondToWidget(d.requestId, action, {});
      return;
    }

    /* matrix-widget-api WidgetApiToWidgetAction.UpdateVisibility is "visibility" (not "update_visibility").
     * ClientWidgetApi.updateVisibility() uses transport.send and waits for a fromWidget reply — if we do not
     * ack, Element shows endless loading and eventually PostmessageTransport throws Request timed out. */
    if (action === "visibility") {
      console.log("[WIDGET] Handling visibility (ack for ClientWidgetApi.updateVisibility)");
      _respondToWidget(d.requestId, action, {});
      return;
    }

    if (action === "theme_change") {
      _respondToWidget(d.requestId, action, {});
      return;
    }

    if (action === "language_change") {
      _respondToWidget(d.requestId, action, {});
      return;
    }

    /* OpenID: Element sends credentials as toWidget openid_credentials with original_request_id (not d.requestId). */
    if (action === "openid_credentials") {
      var oidcData = d.data || {};
      var origRid = String(oidcData.original_request_id || "");
      if (origRid && pendingToWidgetRequests[origRid]) {
        console.log("[WIDGET] Handling openid_credentials for original_request_id=" + origRid);
        pendingToWidgetRequests[origRid](d);
        delete pendingToWidgetRequests[origRid];
      }
      _respondToWidget(d.requestId, action, {});
      return;
    }

    /* Responses to our fromWidget requests (get_openid, etc.) */
    var rid = String(d.requestId || "");
    if (rid && pendingToWidgetRequests[rid]) {
      console.log("[WIDGET] Matched pending request rid=" + rid + " action=" + action);
      pendingToWidgetRequests[rid](d);
      delete pendingToWidgetRequests[rid];
      return;
    }

    /* Any other host->widget request/response pair must be acked or ClientWidgetApi transport.send()
     * hangs until Request timed out (spinners). Action names vary by Element version; empty ack matches
     * matrix-widget-api NotifyCapabilities / UpdateVisibility behaviour. */
    if (rid) {
      console.warn(
        "[WIDGET] generic ack for toWidget action=" + action + " rid=" + rid + " (unhandled name — avoid transport deadlock)"
      );
      _respondToWidget(d.requestId, d.action, {});
      return;
    }

    console.log("[WIDGET] UNHANDLED toWidget (no requestId) action=" + action);
  });

  /* Widget state uses waitForIframeLoad=false (see sync_worker); signal readiness after document load. */
  window.addEventListener("load", function () {
    console.log("[WIDGET] window load — sending content_loaded");
    _sendToParent("content_loaded", {});
  });

  /* ================================================================
   *  Auth (Matrix OpenID) — Widget API handshake + get_openid
   * ================================================================ */
  function _waitForWidgetApi(timeoutMs) {
    if (widgetApiReady) {
      console.log("[WIDGET] Widget API already ready");
      return Promise.resolve();
    }
    console.log("[WIDGET] Waiting for Widget API handshake (max " + timeoutMs + "ms)...");
    return new Promise(function (resolve, reject) {
      var elapsed = 0;
      var iv = setInterval(function () {
        if (widgetApiReady) { clearInterval(iv); console.log("[WIDGET] Widget API ready after " + elapsed + "ms"); resolve(); return; }
        elapsed += 200;
        if (elapsed >= timeoutMs) { clearInterval(iv); console.log("[WIDGET] Widget API handshake TIMEOUT after " + elapsed + "ms"); reject(new Error("api_timeout")); }
      }, 200);
    });
  }

  function _requestFromParent(action, data, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var rid = _genId();
      var to = setTimeout(function () {
        delete pendingToWidgetRequests[rid];
        console.log("[WIDGET] Request TIMEOUT: action=" + action + " rid=" + rid);
        reject(new Error("timeout"));
      }, timeoutMs || 30000);
      pendingToWidgetRequests[rid] = function (msg) {
        clearTimeout(to);
        console.log("[WIDGET] Got response for action=" + action + " rid=" + rid, JSON.stringify(msg).substring(0, 500));
        resolve(msg);
      };
      _sendToParent(action, data || {}, rid);
    });
  }

  async function requestOpenIdCredentials() {
    console.log("[WIDGET] requestOpenIdCredentials: starting modern protocol");
    /* Try modern protocol: wait for capability handshake, then get_openid */
    try {
      await _waitForWidgetApi(25000);
      console.log("[WIDGET] Sending get_openid request (modern)");
      var msg = await _requestFromParent("get_openid", {}, 30000);
      var resp = msg.response || msg.data || {};
      console.log("[WIDGET] get_openid response:", JSON.stringify(resp).substring(0, 500));
      /* Element may send state:"request" first, then "allowed" with creds */
      if (resp.state === "request") {
        console.log("[WIDGET] Got state=request, sending second get_openid");
        msg = await _requestFromParent("get_openid", {}, 30000);
        resp = msg.response || msg.data || {};
        console.log("[WIDGET] get_openid second response:", JSON.stringify(resp).substring(0, 500));
      }
      if (resp.access_token) { console.log("[WIDGET] Got access_token via modern API"); return resp; }
      if (resp.state === "allowed" && resp.access_token) { console.log("[WIDGET] Got access_token via modern API (allowed)"); return resp; }
      console.log("[WIDGET] Modern API: no access_token in response");
      throw new Error("no_token_modern");
    } catch (e) {
      console.warn(
        "[WIDGET] OpenID via Widget API failed:",
        e.message,
        "— openid_credentials_request is unsupported in Element Web/Desktop; not retrying legacy."
      );
      throw e;
    }
  }

  async function doMatrixAuth() {
    console.log("[WIDGET] doMatrixAuth: starting");
    var cred = await requestOpenIdCredentials();
    var server = cred.matrix_server_name || cred.matrixServerName || cred.server_name;
    console.log("[WIDGET] doMatrixAuth: got credentials, server=" + server);
    if (!cred.access_token || !server) throw new Error("bad_cred");
    var r = await fetch(API.auth, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: cred.access_token,
        matrix_server_name: String(server).toLowerCase(),
        store_bot_id: STORE_BOT_ID,
      }),
    });
    var authBodyText = await r.text();
    console.log(
      "[WIDGET] doMatrixAuth: auth status=" + r.status,
      "hdr=" + (r.headers.get("X-Bots-Matrix-Auth") || ""),
      "body=" + authBodyText.slice(0, 400)
    );
    if (!r.ok) throw new Error("auth_http_" + r.status);
  }

  /* ================================================================
   *  Screen: Cities
   * ================================================================ */
  async function showCities(page, token) {
    cityPage = page;
    showShopPane("shop-pane-cities");
    var grid = document.getElementById("cities-grid");
    grid.innerHTML = skeletonCards(6);

    try {
      var r = await apiFetch(API.cities + "?page=" + cityPage);
      var data = await r.json();
      if (token !== renderToken) return;

    grid.innerHTML = "";
    (data.cities || []).forEach(function (c) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = c.name;
      b.onclick = function () {
        currentCityId = c.id;
        currentCityName = c.name;
          navigate("#positions/" + c.id);
      };
      grid.appendChild(b);
    });
    document.getElementById("cities-prev").disabled = cityPage <= 0;
    document.getElementById("cities-next").disabled = !data.has_next;
    document.getElementById("cities-prev").onclick = function () {
        if (cityPage > 0) showCities(cityPage - 1, renderToken);
    };
    document.getElementById("cities-next").onclick = function () {
        if (data.has_next) showCities(cityPage + 1, renderToken);
      };
    } catch (e) {
      if (e.message === "unauthorized") return;
      if (token !== renderToken) return;
      renderErrorRetry(grid, t("web.store.purchase_failed"), function () {
        showCities(cityPage, renderToken);
      });
    }
  }

  /* ================================================================
   *  Screen: Positions (cards with photo, price, discount, stock)
   * ================================================================ */
  async function loadPositions(cityId, page, token) {
    var title = document.getElementById("positions-title");
    var cont = document.getElementById("positions-content");
    title.textContent = t("web.store.offers_title") + (currentCityName ? ": " + currentCityName : "");
    cont.innerHTML = skeletonPosCards(4);

    try {
      var r = await apiFetch(
        API.positions + "?city_id=" + encodeURIComponent(String(cityId)) + "&page=" + page
      );
      var data = await r.json();
      if (token !== renderToken) return;

      if (data.city_name) currentCityName = data.city_name;
      title.textContent = t("web.store.offers_title") + ": " + (currentCityName || "");

      positionsCache = {};
      var positions = data.positions || [];

      cont.innerHTML = "";

      if (positions.length === 0) {
        cont.innerHTML = '<p class="msg">' + escHtml(t("web.store.no_offers")) + "</p>";
      return;
    }

      positions.forEach(function (pos) {
        positionsCache[pos.id] = pos;

        var card = document.createElement("button");
        card.type = "button";
        card.className = "pos-card";

        var imgSrc = pos.photo_url || NO_PHOTO_SVG;
        var imgHtml = '<img class="pos-card-img" src="' + escHtml(imgSrc) +
          '" alt="" loading="lazy" onerror="this.src=\'' + NO_PHOTO_SVG + '\'">';

        var priceHtml = '<span class="price-effective">' +
          escHtml(String(pos.effective_price)) + " " + escHtml(pos.currency || "") + "</span>";

        if (pos.discount_percent && pos.discount_percent > 0) {
          priceHtml += ' <span class="price-original">' + escHtml(String(pos.price)) + "</span>";
          priceHtml += ' <span class="discount-badge">-' + pos.discount_percent + "%</span>";
        }

        var stockText = t("web.store.in_stock") || "In stock";

        card.innerHTML = imgHtml +
          '<div class="pos-card-body">' +
          '<p class="pos-card-name">' + escHtml(pos.name) + "</p>" +
          '<div class="price-row">' + priceHtml + "</div>" +
          '<p class="stock-info">' + escHtml(stockText) + ": " + (pos.stock_count || 0) + "</p>" +
          "</div>";

        card.onclick = function () {
          navigate("#structures/" + cityId + "/" + pos.id);
        };
        cont.appendChild(card);
      });

      if (data.has_next || page > 0) {
        var pag = document.createElement("div");
        pag.className = "pagination";
        if (page > 0) {
          var prevBtn = document.createElement("button");
          prevBtn.type = "button";
          prevBtn.className = "btn-nav";
          prevBtn.textContent = t("web.store.prev");
          prevBtn.onclick = function () { navigate("#positions/" + cityId + "/" + (page - 1), { replace: true }); };
          pag.appendChild(prevBtn);
        }
      if (data.has_next) {
          var nextBtn = document.createElement("button");
          nextBtn.type = "button";
          nextBtn.className = "btn-nav";
          nextBtn.textContent = t("web.store.next");
          nextBtn.onclick = function () { navigate("#positions/" + cityId + "/" + (page + 1), { replace: true }); };
          pag.appendChild(nextBtn);
        }
        cont.appendChild(pag);
      }
    } catch (e) {
      if (e.message === "unauthorized") return;
      if (token !== renderToken) return;
      renderErrorRetry(cont, t("web.store.purchase_failed"), function () {
        loadPositions(cityId, page, renderToken);
      });
    }
  }

  /* ================================================================
   *  Screen: Structures (buttons with stock count)
   * ================================================================ */
  async function loadStructures(cityId, posId, token) {
    var title = document.getElementById("structures-title");
    var cont = document.getElementById("structures-content");

    var cachedPos = positionsCache[posId];
    title.textContent = (cachedPos ? cachedPos.name : t("web.store.offers_title")) +
      (currentCityName ? " — " + currentCityName : "");
    cont.innerHTML = skeletonCards(4);

    try {
      var r = await apiFetch(
        API.structures + "?city_id=" + encodeURIComponent(String(cityId)) +
        "&pos_id=" + encodeURIComponent(String(posId))
      );
      var data = await r.json();
      if (token !== renderToken) return;

      if (data.position_name) {
        title.textContent = data.position_name + (currentCityName ? " — " + currentCityName : "");
      }

      var structs = data.structures || [];
      cont.innerHTML = "";

      if (structs.length === 0) {
        cont.innerHTML = '<p class="msg">' + escHtml(t("web.store.no_offers")) + "</p>";
        return;
      }

      structs.forEach(function (st) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "struct-btn";
        btn.innerHTML = "<span>" + escHtml(st.name) + "</span>" +
          '<span class="struct-stock">' + (st.stock_count || 0) + " " +
          escHtml(t("web.store.in_stock") || "pcs") + "</span>";

        btn.onclick = function () {
          confirmData = {
            city_id: cityId,
            pos_id: posId,
            struct_id: st.id,
            position_name: data.position_name || (cachedPos ? cachedPos.name : ""),
            structure_name: st.name,
            city_name: currentCityName,
            effective_price: cachedPos ? cachedPos.effective_price : null,
            price: cachedPos ? cachedPos.price : null,
            discount_percent: cachedPos ? cachedPos.discount_percent : 0,
            currency: cachedPos ? cachedPos.currency : (me ? me.currency : ""),
          };
          navigate("#confirm/" + cityId + "/" + posId + "/" + st.id);
        };
        cont.appendChild(btn);
      });
    } catch (e) {
      if (e.message === "unauthorized") return;
      if (token !== renderToken) return;
      renderErrorRetry(cont, t("web.store.purchase_failed"), function () {
        loadStructures(cityId, posId, renderToken);
      });
    }
  }

  /* ================================================================
   *  Screen: Confirm purchase
   * ================================================================ */
  function showConfirm(params, token) {
    var title = document.getElementById("confirm-title");
    var cont = document.getElementById("confirm-content");
    title.textContent = t("web.store.confirm_title");

    if (!confirmData || confirmData.struct_id !== params.struct_id) {
      navigate("#structures/" + params.city_id + "/" + params.pos_id, { replace: true });
      return;
    }

    var cd = confirmData;
    var html = '<div class="confirm-info">';
    html += '<p class="ci-name">' + escHtml(cd.position_name) + " / " + escHtml(cd.structure_name) + "</p>";
    if (cd.city_name) html += '<p class="ci-sub">' + escHtml(cd.city_name) + "</p>";

    var priceHtml = "";
    if (cd.effective_price !== null) {
      priceHtml = escHtml(String(cd.effective_price)) + " " + escHtml(cd.currency);
      if (cd.discount_percent && cd.discount_percent > 0 && cd.price) {
        priceHtml += ' <span class="price-original" style="font-weight:400">' +
          escHtml(String(cd.price)) + '</span> <span class="discount-badge">-' +
          cd.discount_percent + "%</span>";
      }
    }
    if (priceHtml) html += '<p class="ci-price">' + priceHtml + "</p>";
    html += "</div>";

    html += '<div class="btn-row">' +
      '<button type="button" class="btn-primary" id="do-purchase">' +
      escHtml(t("web.store.confirm_yes")) + "</button>" +
      '<button type="button" class="btn-secondary" id="do-cancel">' +
      escHtml(t("web.store.cancel")) + "</button></div>";

    cont.innerHTML = html;

    document.getElementById("do-purchase").onclick = async function () {
      var btn = document.getElementById("do-purchase");
      btn.disabled = true;
      btn.textContent = t("web.store.loading");

      try {
        var pr = await apiFetch(API.purchase, {
        method: "POST",
          json: { city_id: cd.city_id, pos_id: cd.pos_id, struct_id: cd.struct_id },
      });
      var out = await pr.json();
      var text = out.message || "";
      if (out.product_lines && out.product_lines.length) {
        text += "\n\n" + out.product_lines.join("\n");
      }
      if (!out.ok) {
        text = (out.message || t("web.store.purchase_failed")) + "\n\n" + text;
      }
        resultState = { text: text.trim(), ok: out.ok };
      } catch (_) {
        resultState = { text: t("web.store.purchase_failed"), ok: false };
      }
      confirmData = null;
      await refreshMe();
      navigate("#result", { replace: true });
    };

    document.getElementById("do-cancel").onclick = function () {
      confirmData = null;
      goBack();
    };
  }

  /* ================================================================
   *  Screen: Purchase result
   * ================================================================ */
  function showResult() {
    var body = document.getElementById("result-body");
    var title = document.getElementById("result-title");
    title.textContent = t("web.store.result_title");
    document.getElementById("result-ok").textContent = t("web.store.back");

    if (!resultState) {
      navigate("#shop", { replace: true });
      return;
    }

    body.textContent = resultState.text;
    resultState = null;

    document.getElementById("result-ok").onclick = function () {
      navigate("#shop", { resetStack: true });
    };
  }

  /* ================================================================
   *  Screen: Reviews (list + pagination)
   * ================================================================ */
  async function showReviews(page, token) {
    var cont = document.getElementById("reviews-content");
    var title = document.getElementById("reviews-title");
    title.textContent = t("review.menu_title") || "Reviews";
    cont.innerHTML = skeletonLines(6);

    try {
      var r = await apiFetch(API.reviews + "?page=" + page);
      var data = await r.json();
      if (token !== renderToken) return;

      var html = "";
      if (data.average_rating !== null && data.average_rating !== undefined) {
        var avgStars = renderStarsHtml(Math.round(data.average_rating));
        html += '<div style="margin-bottom:0.75rem">' + avgStars +
          ' <span style="color:var(--muted);font-size:0.85rem">' +
          escHtml(String(data.average_rating)) + " / 5 (" + (data.total_count || 0) + ")</span></div>";
      }

      var reviews = data.reviews || [];
      if (reviews.length === 0) {
        html += '<p class="msg">' + escHtml(t("review.no_reviews") || "No reviews") + "</p>";
      }
      reviews.forEach(function (rv) {
        html += '<div class="review-card">' +
          '<div class="review-stars">' + renderStarsHtml(rv.rating) + "</div>" +
          (rv.text ? '<p class="review-text">' + escHtml(rv.text) + "</p>" : "") +
          '<p class="review-meta">' + escHtml(rv.position_name || "") +
          (rv.city_name ? ", " + escHtml(rv.city_name) : "") +
          "</p></div>";
      });

      if (data.has_next || page > 0) {
        html += '<div class="pagination">';
        if (page > 0) {
          html += '<button type="button" class="btn-nav" id="rev-prev">' +
            escHtml(t("web.store.prev")) + "</button>";
        }
        if (data.has_next) {
          html += '<button type="button" class="btn-nav" id="rev-next">' +
            escHtml(t("web.store.next")) + "</button>";
        }
        html += "</div>";
      }

      cont.innerHTML = html;

      var prevBtn = document.getElementById("rev-prev");
      var nextBtn = document.getElementById("rev-next");
      if (prevBtn) prevBtn.onclick = function () { showReviews(page - 1, renderToken); };
      if (nextBtn) nextBtn.onclick = function () { showReviews(page + 1, renderToken); };
    } catch (e) {
      if (e.message === "unauthorized") return;
      if (token !== renderToken) return;
      renderErrorRetry(cont, t("web.store.purchase_failed"), function () {
        showReviews(page, renderToken);
      });
    }
  }

  function renderStarsHtml(rating) {
    var s = "";
    for (var i = 0; i < 5; i++) s += i < rating ? "★" : "☆";
    return '<span style="color:var(--accent)">' + s + "</span>";
  }

  /* ================================================================
   *  Screen: Create review
   * ================================================================ */
  async function showReviewCreate(paymentId, token) {
    var cont = document.getElementById("reviews-content");
    var title = document.getElementById("reviews-title");
    title.textContent = t("review.leave") || "Leave review";
    cont.innerHTML = skeletonLines(4);

    var payInfo = null;
    try {
      var r = await apiFetch(API.accountPay + "?payment_id=" + paymentId);
      if (r.ok) payInfo = await r.json();
    } catch (_) { /* optional, continue without it */ }

    if (token !== renderToken) return;

    if (payInfo && !payInfo.can_review) {
      cont.innerHTML = '<p class="msg">' +
        escHtml(t("review.already_left") || "Already reviewed") + "</p>";
      return;
    }

    var selectedRating = 0;

    var html = "";
    if (payInfo) {
      html += '<p class="msg" style="margin-bottom:0.5rem">' +
        escHtml((payInfo.position_name || "") + (payInfo.structure_name ? " / " + payInfo.structure_name : "")) +
        "</p>";
    }
    html += '<p class="field-label">' + escHtml(t("review.rating_label") || "Rating") + "</p>";
    html += '<div class="star-picker" id="star-picker">';
    for (var i = 1; i <= 5; i++) {
      html += '<button type="button" class="star-picker-btn" data-val="' + i + '">☆</button>';
    }
    html += "</div>";
    html += '<p class="field-label">' + escHtml(t("review.enter_text") || "Comment (optional)") + "</p>";
    html += '<textarea class="textarea-input" id="review-text" maxlength="1000" rows="3"></textarea>';
    html += '<button type="button" class="btn-primary" id="review-submit" disabled>' +
      escHtml(t("review.publish") || "Submit") + "</button>";
    html += '<p class="msg" id="review-msg"></p>';

    cont.innerHTML = html;

    var picker = document.getElementById("star-picker");
    var submitBtn = document.getElementById("review-submit");

    function updateStars(val) {
      selectedRating = val;
      picker.querySelectorAll(".star-picker-btn").forEach(function (sb) {
        var v = parseInt(sb.getAttribute("data-val"), 10);
        sb.textContent = v <= val ? "★" : "☆";
        sb.classList.toggle("filled", v <= val);
      });
      submitBtn.disabled = val < 1;
    }

    picker.querySelectorAll(".star-picker-btn").forEach(function (sb) {
      sb.onclick = function () {
        updateStars(parseInt(sb.getAttribute("data-val"), 10));
      };
    });

    submitBtn.onclick = async function () {
      if (selectedRating < 1) return;
      submitBtn.disabled = true;
      submitBtn.textContent = t("web.store.loading");
      var text = (document.getElementById("review-text").value || "").trim();

      try {
        var rr = await apiFetch(API.reviewCreate, {
        method: "POST",
          json: { payment_id: paymentId, rating: selectedRating, text: text },
        });
        var j = await rr.json();
        var msgEl = document.getElementById("review-msg");
        if (rr.ok && j.ok) {
          msgEl.style.color = "var(--green)";
          msgEl.textContent = j.message || t("review.thanks_pending") || "Thank you!";
          submitBtn.hidden = true;
          setTimeout(function () {
            navigate("#reviews", { resetStack: true });
          }, 1500);
        } else {
          msgEl.style.color = "var(--danger)";
          msgEl.textContent = j.message || t("web.store.purchase_failed");
          submitBtn.disabled = false;
          submitBtn.textContent = t("review.publish") || "Submit";
        }
      } catch (e) {
        if (e.message === "unauthorized") return;
        var msgEl2 = document.getElementById("review-msg");
        msgEl2.style.color = "var(--danger)";
        msgEl2.textContent = t("web.store.purchase_failed");
        submitBtn.disabled = false;
        submitBtn.textContent = t("review.publish") || "Submit";
      }
    };
  }

  /* ================================================================
   *  Screen: Account (history + custom buttons)
   * ================================================================ */
  async function showAccount(page, token) {
    var cont = document.getElementById("account-content");
    var title = document.getElementById("account-title");
    title.textContent = t("web.widget.nav_account") || "Account";
    cont.innerHTML = skeletonCards(5);

    try {
      var r = await apiFetch(API.account + "?page=" + page);
      var data = await r.json();
      if (token !== renderToken) return;

      var html = "";
      html += '<p class="msg" style="margin-bottom:0.75rem">' +
        escHtml(t("web.widget.account_total_purchases") || "Purchases") + ": " +
        (data.total_purchases || 0) + "</p>";

      var payments = data.payments || [];
      if (payments.length === 0 && page === 0) {
        html += '<p class="msg">' + escHtml(t("web.store.no_offers") || "Empty") + "</p>";
      }
      payments.forEach(function (p) {
        var subAmt = (p.invoice_amount !== undefined && p.invoice_amount !== null && p.invoice_amount !== "")
          ? (String(p.invoice_amount) + " " + String(p.invoice_currency || p.currency || ""))
          : (String(p.amount) + " " + String(p.currency || ""));
        html += '<button type="button" class="pay-card" data-pid="' + p.id + '">' +
          '<p class="pay-card-title">#' + p.id + " — " + escHtml(p.position_name || p.type) + "</p>" +
          '<p class="pay-card-sub">' +
          escHtml(subAmt) + " · " + escHtml(p.status_label) + "</p></button>";
      });

      if (data.has_next || page > 0) {
        html += '<div class="pagination">';
        if (page > 0) {
          html += '<button type="button" class="btn-nav" id="acc-prev">' +
            escHtml(t("web.store.prev")) + "</button>";
        }
        if (data.has_next) {
          html += '<button type="button" class="btn-nav" id="acc-next">' +
            escHtml(t("web.store.next")) + "</button>";
        }
        html += "</div>";
      }

      cont.innerHTML = html;

      cont.querySelectorAll("[data-pid]").forEach(function (btn) {
        btn.onclick = function () {
          navigate("#account/payment/" + btn.getAttribute("data-pid"));
        };
      });
      var prevBtn = document.getElementById("acc-prev");
      var nextBtn = document.getElementById("acc-next");
      if (prevBtn) prevBtn.onclick = function () { showAccount(page - 1, renderToken); };
      if (nextBtn) nextBtn.onclick = function () { showAccount(page + 1, renderToken); };

      loadCustomButtons(cont);
    } catch (e) {
      if (e.message === "unauthorized") return;
      if (token !== renderToken) return;
      renderErrorRetry(cont, t("web.store.purchase_failed"), function () {
        showAccount(page, renderToken);
      });
    }
  }

  /* ================================================================
   *  Screen: Account payment detail
   * ================================================================ */
  async function showAccountPayment(paymentId, token) {
    var cont = document.getElementById("account-content");
    var title = document.getElementById("account-title");
    title.textContent = t("web.widget.payment_detail_title") || "Payment";
    cont.innerHTML = skeletonLines(8);

    try {
      var r = await apiFetch(API.accountPay + "?payment_id=" + paymentId);
      if (!r.ok) {
        if (token !== renderToken) return;
        cont.innerHTML = '<p class="msg">' + escHtml(t("web.widget.account_payment_not_found")) + "</p>";
        return;
      }
      var p = await r.json();
      if (token !== renderToken) return;

      var html = '<div class="pay-detail">';
      html += '<p style="font-weight:600;font-size:1rem">#' + p.id + " — " + escHtml(p.order_id) + "</p>";
      if (p.position_name) html += "<p>" + escHtml(p.position_name) + "</p>";
      if (p.structure_name || p.city_name) {
        html += '<p style="color:var(--muted);font-size:0.85rem">' +
          escHtml([p.structure_name, p.city_name].filter(Boolean).join(" · ")) + "</p>";
      }
      var mainAmt = (p.invoice_amount !== undefined && p.invoice_amount !== null && p.invoice_amount !== "")
        ? (String(p.invoice_amount) + " " + String(p.invoice_currency || p.currency || ""))
        : (String(p.amount) + " " + String(p.currency || ""));
      html += '<p style="margin-top:0.5rem">' + escHtml(mainAmt) +
        " — <strong>" + escHtml(p.status_label) + "</strong></p>";
      if (p.ledger_amount != null && p.ledger_amount !== "" && p.ledger_currency) {
        html += '<p style="font-size:0.85rem;color:var(--muted)">' +
          escHtml(t("account.ledger_amount")) + ": " +
          escHtml(String(p.ledger_amount) + " " + String(p.ledger_currency)) + "</p>";
      }
      if (p.payment_address) {
        html += '<p style="margin-top:0.5rem;font-size:0.9rem;word-break:break-all">' +
          escHtml(t("account.pay_address")) + ": " +
          escHtml(String(p.payment_address)) + "</p>";
      }
      if (p.created_at) {
        html += '<p style="font-size:0.75rem;color:var(--muted)">' +
          escHtml(new Date(p.created_at).toLocaleString()) + "</p>";
      }

      var photos = p.product_photos || [];
      if (photos.length > 0) {
        html += '<div class="pay-detail-photos">';
        photos.forEach(function (url) {
          html += '<img src="' + escHtml(url) + '" alt="" loading="lazy" ' +
            'style="max-width:240px" onerror="this.style.display=\'none\'">';
        });
        html += "</div>";
      }
      html += "</div>";

      if (p.can_review) {
        html += '<button type="button" class="btn-primary" style="width:100%" id="leave-review-btn">' +
          escHtml(t("review.leave") || "Leave review") + "</button>";
      }

      cont.innerHTML = html;

      var reviewBtn = document.getElementById("leave-review-btn");
      if (reviewBtn) {
        reviewBtn.onclick = function () {
          navigate("#review/create/" + paymentId);
        };
      }
    } catch (e) {
      if (e.message === "unauthorized") return;
      if (token !== renderToken) return;
      renderErrorRetry(cont, t("web.store.purchase_failed"), function () {
        showAccountPayment(paymentId, renderToken);
      });
    }
  }

  /* ================================================================
   *  Custom admin buttons (loaded into account screen)
   * ================================================================ */
  async function loadCustomButtons(parentEl) {
    try {
      var r = await apiFetch(API.customBtns);
      if (!r.ok) return;
      var data = await r.json();
      var buttons = data.buttons || [];
      if (buttons.length === 0) return;

      var section = document.createElement("div");
      section.className = "custom-btns";
      buttons.forEach(function (b) {
        var a = document.createElement("a");
        a.href = b.url;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = b.label || b.url;
        section.appendChild(a);
      });
      parentEl.appendChild(section);
    } catch (_) { /* non-critical */ }
  }

  /* ================================================================
   *  Topup
   * ================================================================ */
  function resetTopupUI() {
    topupPaymentId = null;
    document.getElementById("topup-step-amount").hidden = false;
    document.getElementById("topup-step-methods").hidden = true;
    document.getElementById("topup-step-instruction").hidden = true;
    document.getElementById("topup-amount-input").value = "";
    document.getElementById("topup-check-result").textContent = "";
    document.getElementById("topup-methods-grid").innerHTML = "";
  }

  function wireTopup() {
    document.getElementById("topup-amount-next").onclick = async function () {
      var raw = (document.getElementById("topup-amount-input").value || "").trim().replace(",", ".");
      if (!raw) return;
      try {
        var r = await apiFetch(API.topupMethods, { method: "POST", json: {} });
        if (!r.ok) {
          document.getElementById("topup-check-result").textContent = t("web.store.purchase_failed");
        return;
      }
      var j = await r.json();
      var methods = j.methods || [];
      if (methods.length === 0) {
          document.getElementById("topup-check-result").textContent = t("web.store.purchase_failed");
        return;
      }
      document.getElementById("topup-step-amount").hidden = true;
      document.getElementById("topup-step-methods").hidden = false;
      var grid = document.getElementById("topup-methods-grid");
      grid.innerHTML = "";
      methods.forEach(function (m) {
        var b = document.createElement("button");
        b.type = "button";
        b.textContent = m.label;
        b.onclick = async function () {
            try {
              var cr = await apiFetch(API.topupCreate, { method: "POST", json: { amount: raw, method_key: m.key } });
          var cj = await cr.json();
          if (!cr.ok || !cj.ok) {
                document.getElementById("topup-check-result").textContent = cj.message || t("web.store.purchase_failed");
            return;
          }
          topupPaymentId = cj.payment_id;
              document.getElementById("topup-instruction").textContent = cj.instruction || "";
          document.getElementById("topup-step-methods").hidden = true;
          document.getElementById("topup-step-instruction").hidden = false;
          document.getElementById("topup-check-result").textContent = "";
            } catch (_) {
              document.getElementById("topup-check-result").textContent = t("web.store.purchase_failed");
            }
        };
        grid.appendChild(b);
      });
      } catch (_) {
        document.getElementById("topup-check-result").textContent = t("web.store.purchase_failed");
      }
    };

    document.getElementById("topup-check-btn").onclick = async function () {
      if (!topupPaymentId) return;
      try {
        var r = await apiFetch(API.topupCheck, { method: "POST", json: { payment_id: topupPaymentId } });
      var j = await r.json();
        document.getElementById("topup-check-result").textContent = j.message || "";
        if (j.paid) await refreshMe();
      } catch (_) { /* ignore */ }
    };

    document.getElementById("topup-cancel-btn").onclick = async function () {
      if (topupPaymentId) {
        try {
          await apiFetch(API.topupCancel, { method: "POST", json: { payment_id: topupPaymentId } });
        } catch (_) { /* ignore */ }
      }
      resetTopupUI();
      await refreshMe();
    };
  }

  /* ================================================================
   *  Promo
   * ================================================================ */
  function wirePromo() {
    document.getElementById("promo-apply-btn").onclick = async function () {
      var code = (document.getElementById("promo-input").value || "").trim();
      if (!code) return;
      try {
        var r = await apiFetch(API.promo, { method: "POST", json: { code: code } });
      var j = await r.json();
      document.getElementById("promo-result").textContent = j.message || "";
        await refreshMe();
      } catch (_) {
        document.getElementById("promo-result").textContent = t("web.store.purchase_failed");
      }
    };
  }

  /* ================================================================
   *  Refresh user info (balance, etc.)
   * ================================================================ */
  async function refreshMe() {
    try {
      var r = await apiFetch(API.me);
      if (r.ok) {
        me = await r.json();
        refreshLabels();
      }
    } catch (_) { /* ignore */ }
  }

  /* ================================================================
   *  Boot
   * ================================================================ */
  async function boot() {
    if (!STORE_BOT_ID || STORE_BOT_ID < 1) {
      await loadI18n(guessLocale());
      document.getElementById("auth-msg").textContent = t("web.widget.need_store");
      showScreen("screen-auth");
      return;
    }

    showScreen("screen-auth");
    await loadI18n(guessLocale());
    document.getElementById("auth-msg").textContent = t("web.widget.connecting");

    try {
      await doMatrixAuth();
      console.log("[WIDGET] boot: auth SUCCESS");
    } catch (e) {
      console.error("[WIDGET] boot: auth FAILED:", e.message, e);
      await loadI18n(guessLocale());
      document.getElementById("auth-msg").textContent = t("web.widget.auth_failed");
      return;
    }

    var r;
    try {
      console.log("[WIDGET] boot: fetching /api/store/me");
      r = await apiFetch(API.me);
      console.log("[WIDGET] boot: /me http status=" + r.status);
      if (!r.ok) {
        document.getElementById("auth-msg").textContent = t("web.widget.auth_failed");
        return;
      }
      me = await r.json();
      var loc = me.locale || guessLocale();
      await loadI18n(loc);
      applyWidgetBaseTheme(me.widget_theme);
      applyThemeColor(me.emoji_color);

      document.getElementById("appHeader").hidden = false;
      document.getElementById("bottomNav").hidden = false;
      document.getElementById("hdr-title").textContent = me.store_name || t("web.store.title");
      fillLocaleSelect(loc);
      refreshLabels();

      document.getElementById("backBtn").onclick = goBack;

      document.querySelectorAll(".bnav-btn").forEach(function (btn) {
        btn.onclick = function () {
          var tab = btn.getAttribute("data-tab");
          navigate(TAB_ROOTS[tab], { resetStack: true });
        };
      });

      wireTopup();
      wirePromo();

      booted = true;

      window.addEventListener("hashchange", function () {
        onRouteChange();
      });

      /* Element iframe often does not fire hashchange when only location.hash is set;
       * without onRouteChange() the UI stays on screen-auth ("connecting") forever. */
      var frag = location.hash;
      if (!frag || frag === "#") {
        try {
          history.replaceState(null, "", location.pathname + location.search + "#shop");
        } catch (e) {
          console.warn("[WIDGET] replaceState failed, using location.hash", e);
          location.hash = "#shop";
        }
      }
      await onRouteChange();
      console.log("[WIDGET] boot: first route rendered");
      /* Do NOT send content_loaded again: Element throws "Improper sequence: ContentLoaded ...
       * can only be sent once" (see ClientWidgetApi) and breaks PostmessageTransport. */
    } catch (err) {
      console.error("[WIDGET] boot: post-auth failed:", err);
      try {
        await loadI18n(guessLocale());
      } catch (_e) { /* ignore */ }
      var am = document.getElementById("auth-msg");
      if (am) {
        am.textContent = t("web.widget.auth_failed");
      }
      showScreen("screen-auth");
    }
  }

  boot().catch(function (e) {
    console.error("[WIDGET] boot: unhandled", e);
  });
})();
