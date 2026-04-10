(() => {
  // src/config.js
  var API_BASE_FROM_BUILD = true ? String("").trim() : "";
  var qs = new URLSearchParams(
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
  function resolveApiPath(path) {
    var rel = path.charAt(0) === "/" ? path : "/" + path;
    var base = computeApiBase();
    if (base) return base + rel;
    if (typeof location === "undefined" || !location.origin || location.origin === "null") {
      return rel;
    }
    return location.origin + rel;
  }
  function apiUrl(path) {
    return resolveApiPath(path);
  }
  var STORE_BOT_ID_QUERY = parseInt(qs.get("store_bot_id") || "0", 10);
  var resolvedStoreBotId = 0;
  function getResolvedStoreBotId() {
    if (resolvedStoreBotId >= 1) return resolvedStoreBotId;
    return STORE_BOT_ID_QUERY;
  }
  async function resolveStoreBotIdEarly() {
    if (STORE_BOT_ID_QUERY >= 1) {
      resolvedStoreBotId = STORE_BOT_ID_QUERY;
      return STORE_BOT_ID_QUERY;
    }
    var host = typeof location !== "undefined" && location.hostname ? location.hostname : "";
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
    }
    resolvedStoreBotId = 0;
    return 0;
  }

  // src/app/remoteLog.js
  function isRemoteClientLogEnabled() {
    if (typeof document !== "undefined" && document.querySelector('meta[name="bots-widget-client-log"]')?.getAttribute("content") === "1") {
      return true;
    }
    if (typeof window !== "undefined" && window.__BOTS_WIDGET_REMOTE_LOG__ === true) {
      return true;
    }
    return false;
  }
  function setRemoteClientLogFromConfig(enabled) {
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
  var pendingBeforeConfig = [];
  var queue = [];
  var flushTimer = null;
  var pagehideWired = false;
  function wirePagehide() {
    if (pagehideWired || typeof window === "undefined" || !isRemoteClientLogEnabled()) return;
    pagehideWired = true;
    window.addEventListener("pagehide", function() {
      if (!queue.length) return;
      var sid = getResolvedStoreBotId();
      var body = JSON.stringify({
        store_bot_id: sid >= 1 ? sid : null,
        lines: queue.splice(0, 50)
      });
      var url = apiUrl("/api/matrix-widget/client-log");
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body,
        credentials: "same-origin"
      }).catch(function() {
        try {
          if (navigator.sendBeacon) {
            navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
          }
        } catch (_) {
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
      lines
    });
    var url = apiUrl("/api/matrix-widget/client-log");
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body,
      credentials: "same-origin"
    }).then(function(r) {
      if (!r.ok) {
      }
    }).catch(function(e) {
    });
  }
  function rlog() {
    var line = Array.prototype.slice.call(arguments).map(function(x) {
      return String(x);
    }).join(" ").slice(0, 500);
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

  // src/app/router.js
  var TAB_ROOTS = {
    shop: "#shop",
    reviews: "#reviews",
    contacts: "#contacts"
  };
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
    return { name, params };
  }
  function tabForRoute(name) {
    if (name === "account_payment") return "reviews";
    if (name === "reviews" || name === "review_create") return "reviews";
    if (name === "contacts") return "contacts";
    if (name === "promo") return "shop";
    return "shop";
  }

  // src/app/log.js
  var isDebug = typeof location !== "undefined" && (new URLSearchParams(location.search).has("debug") || typeof localStorage !== "undefined" && localStorage.getItem("bots_widget_debug") === "1");
  function dlog() {
    if (!isDebug) return;
  }

  // src/app/errors.js
  function reportError(context, err) {
    var msg = err && err.message ? err.message : String(err);
    dlog("error_detail", context, err);
  }

  // src/store-app.js
  var PRE_LOCALE_UI = "en";
  var LOCALES = [
    { code: "uk", label: "\u0423\u043A\u0440\u0430\u0457\u043D\u0441\u044C\u043A\u0430", flag: "\u{1F1FA}\u{1F1E6}" },
    { code: "pl", label: "Polski", flag: "\u{1F1F5}\u{1F1F1}" },
    { code: "en", label: "English", flag: "\u{1F1EC}\u{1F1E7}" },
    { code: "ka", label: "\u10E5\u10D0\u10E0\u10D7\u10E3\u10DA\u10D8", flag: "\u{1F1EC}\u{1F1EA}" },
    { code: "ro", label: "Rom\xE2n\u0103", flag: "\u{1F1F7}\u{1F1F4}" },
    { code: "kk", label: "\u049A\u0430\u0437\u0430\u049B\u0448\u0430", flag: "\u{1F1F0}\u{1F1FF}" },
    { code: "ru", label: "\u0420\u0443\u0441\u0441\u043A\u0438\u0439", flag: "\u{1F1F7}\u{1F1FA}" }
  ];
  var API = {
    me: "/api/store/me",
    cities: "/api/store/cities",
    offers: "/api/store/offers",
    purchase: "/api/store/purchase",
    checkoutOptions: "/api/store/checkout/options",
    checkoutStart: "/api/store/checkout/start",
    paymentQr: "/api/store/payment/qr",
    paymentSubmitTx: "/api/store/payment/submit_tx",
    locale: "/api/store/locale",
    i18n: "/api/store/i18n",
    positions: "/api/store/positions",
    structures: "/api/store/structures",
    accountPay: "/api/store/account/payment",
    reviews: "/api/store/reviews",
    reviewCreate: "/api/store/reviews/create",
    customBtns: "/api/store/custom-buttons",
    siteContacts: "/api/store/site-contacts",
    topupCheck: "/api/store/topup/check",
    topupCancel: "/api/store/topup/cancel",
    posPhoto: "/api/store/position/photo"
  };
  var S = {};
  var me = null;
  var siteContactsCache = null;
  var historyStack = [];
  var renderToken = 0;
  var booted = false;
  var visibilityRefreshTimer = null;
  var visibilityListenerWired = false;
  var langPickerDocListenersWired = false;
  var currentCityId = null;
  var currentCityName = "";
  var checkoutPaymentId = null;
  var checkoutPayContext = null;
  var lastCheckoutInvoiceCopy = null;
  var checkoutNeedsTx = false;
  var paymentCancelInProgress = false;
  var paymentCancelModalOnYes = null;
  var checkoutQrObjectUrl = null;
  var positionsCache = {};
  var confirmData = null;
  var resultState = null;
  var NO_PHOTO_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 24 24' fill='%236b7280'%3E%3Cpath d='M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z'/%3E%3C/svg%3E";
  function t(key, kwargs) {
    var s = S[key] || key;
    if (kwargs) {
      Object.keys(kwargs).forEach(function(k) {
        s = s.split("{" + k + "}").join(String(kwargs[k]));
      });
    }
    return s;
  }
  function apiFetch(path, opts) {
    opts = opts || {};
    var method = opts.method || "GET";
    var headers = opts.headers || {};
    var timeoutMs = opts.timeoutMs || 15e3;
    var fetchOpts = {
      method,
      credentials: "include",
      headers
    };
    if (opts.json !== void 0) {
      fetchOpts.headers["Content-Type"] = "application/json";
      fetchOpts.body = JSON.stringify(opts.json);
    }
    if (opts.body !== void 0) {
      fetchOpts.body = opts.body;
    }
    var controller = new AbortController();
    fetchOpts.signal = controller.signal;
    var timer = setTimeout(function() {
      controller.abort();
    }, timeoutMs);
    return fetch(resolveApiPath(path), fetchOpts).then(function(r) {
      clearTimeout(timer);
      if (r.status === 401) {
        handleUnauthorized();
        return Promise.reject(new Error("unauthorized"));
      }
      return r;
    }).catch(function(err) {
      clearTimeout(timer);
      throw err;
    });
  }
  function revokeCheckoutQrObjectUrl() {
    if (checkoutQrObjectUrl) {
      try {
        URL.revokeObjectURL(checkoutQrObjectUrl);
      } catch (_) {
      }
      checkoutQrObjectUrl = null;
    }
  }
  function closeQrModal() {
    var modal = document.getElementById("qr-modal");
    var img = document.getElementById("qr-modal-img");
    if (modal) modal.hidden = true;
    if (img) img.removeAttribute("src");
  }
  function openQrModal(objectUrl) {
    var modal = document.getElementById("qr-modal");
    var img = document.getElementById("qr-modal-img");
    if (!modal || !img) return;
    img.src = objectUrl;
    img.alt = t("payment.get_qr");
    modal.hidden = false;
  }
  function hideCheckoutQrUi() {
    closeQrModal();
    revokeCheckoutQrObjectUrl();
  }
  function placeCheckoutQrButton(needsTx) {
    var btn = document.getElementById("checkout-qr-btn");
    var txActions = document.getElementById("checkout-tx-actions");
    var mainActions = document.getElementById("checkout-main-actions");
    var cancelBtn = document.getElementById("checkout-cancel-btn");
    if (!btn || !txActions || !mainActions || !cancelBtn) return;
    if (needsTx) {
      if (btn.parentNode !== txActions) {
        txActions.appendChild(btn);
      }
    } else {
      if (btn.parentNode !== mainActions) {
        mainActions.insertBefore(btn, cancelBtn);
      }
    }
  }
  function wireQrModal() {
    var backdrop = document.getElementById("qr-modal-backdrop");
    var closeBtn = document.getElementById("qr-modal-close");
    if (backdrop) {
      backdrop.onclick = function() {
        closeQrModal();
      };
    }
    if (closeBtn) {
      closeBtn.onclick = function() {
        closeQrModal();
      };
    }
    document.addEventListener("keydown", function(e) {
      if (e.key !== "Escape") return;
      var payModal = document.getElementById("payment-cancel-modal");
      if (payModal && !payModal.hidden) {
        e.preventDefault();
        closePaymentCancelModal();
        return;
      }
      var modal = document.getElementById("qr-modal");
      if (modal && !modal.hidden) {
        e.preventDefault();
        closeQrModal();
      }
    });
  }
  function closePaymentCancelModal() {
    var el = document.getElementById("payment-cancel-modal");
    if (el) el.hidden = true;
    paymentCancelModalOnYes = null;
  }
  function setPaymentCancelModalBusy(busy) {
    var y = document.getElementById("payment-cancel-yes");
    var n = document.getElementById("payment-cancel-no");
    if (y) y.disabled = !!busy;
    if (n) n.disabled = !!busy;
  }
  function openPaymentCancelModal(opts) {
    var modal = document.getElementById("payment-cancel-modal");
    var msg = document.getElementById("payment-cancel-modal-msg");
    var yes = document.getElementById("payment-cancel-yes");
    var no = document.getElementById("payment-cancel-no");
    if (!modal || !msg || !yes || !no) return;
    msg.textContent = t("payment.confirm_cancel");
    yes.textContent = t("payment.yes");
    no.textContent = t("payment.no");
    paymentCancelModalOnYes = opts.onYes;
    setPaymentCancelModalBusy(false);
    modal.hidden = false;
  }
  function wirePaymentCancelModal() {
    var backdrop = document.getElementById("payment-cancel-modal-backdrop");
    var yes = document.getElementById("payment-cancel-yes");
    var no = document.getElementById("payment-cancel-no");
    if (backdrop) {
      backdrop.onclick = function() {
        closePaymentCancelModal();
      };
    }
    if (no) {
      no.onclick = function() {
        closePaymentCancelModal();
      };
    }
    if (yes) {
      yes.onclick = async function() {
        var fn = paymentCancelModalOnYes;
        if (!fn || paymentCancelInProgress) return;
        setPaymentCancelModalBusy(true);
        try {
          await fn();
        } finally {
          closePaymentCancelModal();
          setPaymentCancelModalBusy(false);
        }
      };
    }
  }
  function hasPendingCheckoutInvoice() {
    return checkoutPaymentId != null;
  }
  async function cancelCheckoutAndThenNavigate(hash, opts) {
    if (paymentCancelInProgress) return;
    paymentCancelInProgress = true;
    try {
      var pid = checkoutPaymentId;
      if (pid) {
        try {
          await apiFetch(API.topupCancel, {
            method: "POST",
            json: { payment_id: pid }
          });
        } catch (_) {
        }
      }
      resetCheckoutPayUI();
      confirmData = null;
      await refreshMe();
      navigate(hash, opts || {});
    } finally {
      paymentCancelInProgress = false;
    }
  }
  async function cancelCheckoutAndNavigateToStructures() {
    var ctx = checkoutPayContext;
    if (!ctx) {
      await cancelCheckoutAndThenNavigate("#shop", { replace: true });
      return;
    }
    await cancelCheckoutAndThenNavigate(
      "#structures/" + ctx.city_id + "/" + ctx.pos_id,
      { replace: true }
    );
  }
  function wireGoBackAndBottomNav() {
    document.querySelectorAll(".bnav-btn").forEach(function(btn) {
      btn.onclick = function() {
        var tab = btn.getAttribute("data-tab");
        if (hasPendingCheckoutInvoice()) {
          openPaymentCancelModal({
            onYes: function() {
              return cancelCheckoutAndThenNavigate(TAB_ROOTS[tab], { resetStack: true });
            }
          });
          return;
        }
        navigate(TAB_ROOTS[tab], { resetStack: true });
      };
    });
  }
  var CLIPBOARD_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>';
  var INVOICE_ORDER_DISPLAY_MAX = 28;
  function copyToClipboardFallback(text) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch (_) {
      return false;
    }
  }
  function copyToClipboard(text) {
    var s = String(text || "");
    if (!s) return Promise.resolve(false);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(s).then(function() {
        return true;
      }).catch(function() {
        return copyToClipboardFallback(s);
      });
    }
    return Promise.resolve(copyToClipboardFallback(s));
  }
  function truncateOrderDisplayForInvoice(s) {
    if (!s || s.length <= INVOICE_ORDER_DISPLAY_MAX) return s;
    return s.slice(0, INVOICE_ORDER_DISPLAY_MAX - 1) + "\u2026";
  }
  function nonEmptyInvoiceField(v) {
    return v != null && String(v).trim() !== "";
  }
  function invoiceCopyHasOrderInfo(ic) {
    var o = ic || {};
    return nonEmptyInvoiceField(o.city_name) || nonEmptyInvoiceField(o.district_name) || nonEmptyInvoiceField(o.product_name);
  }
  function renderInvoiceInstruction(container, instruction, invoiceCopy) {
    if (!container) return;
    container.innerHTML = "";
    container.className = "checkout-invoice";
    var ic = invoiceCopy || {};
    var hasStructured = ic.amount_copy && ic.order_number != null && String(ic.order_number) !== "" && ic.payment_address != null;
    if (!hasStructured) {
      var preOnly = document.createElement("pre");
      preOnly.className = "result-body";
      preOnly.textContent = instruction || "";
      container.appendChild(preOnly);
      return;
    }
    var hasOrderInfo = invoiceCopyHasOrderInfo(ic);
    if (hasOrderInfo) {
      let pushInfoLine = function(labelKey, val) {
        if (!nonEmptyInvoiceField(val)) return;
        var row = document.createElement("div");
        row.className = "checkout-invoice-row checkout-invoice-info-row";
        var lab = document.createElement("span");
        lab.className = "checkout-invoice-label";
        lab.textContent = t(labelKey);
        var valWrap = document.createElement("div");
        valWrap.className = "checkout-invoice-value-wrap";
        var valEl = document.createElement("span");
        valEl.className = "checkout-invoice-value";
        valEl.textContent = String(val);
        valWrap.appendChild(valEl);
        row.appendChild(lab);
        row.appendChild(valWrap);
        infoPanel.appendChild(row);
      };
      var infoPanel = document.createElement("div");
      infoPanel.className = "result-body checkout-invoice-info-panel";
      pushInfoLine("payment.field_city", ic.city_name);
      pushInfoLine("payment.field_district", ic.district_name);
      pushInfoLine("payment.field_product", ic.product_name);
      container.appendChild(infoPanel);
    }
    var reqTitle = document.createElement("p");
    reqTitle.className = "checkout-invoice-section-title checkout-invoice-section-title--requisites";
    reqTitle.textContent = t("web.store.checkout_invoice_title");
    container.appendChild(reqTitle);
    var rows = document.createElement("div");
    rows.className = "checkout-invoice-rows";
    function addRow(labelKey, displayValue, copyValue, ariaKey) {
      var row = document.createElement("div");
      row.className = "checkout-invoice-row";
      var lab = document.createElement("span");
      lab.className = "checkout-invoice-label";
      lab.textContent = t(labelKey);
      var valWrap = document.createElement("div");
      valWrap.className = "checkout-invoice-value-wrap";
      var val = document.createElement("span");
      val.className = "checkout-invoice-value";
      if (labelKey === "payment.field_order_number") {
        val.className += " checkout-invoice-value--ellipsis";
        val.textContent = truncateOrderDisplayForInvoice(String(displayValue));
        val.title = String(displayValue);
      } else if (labelKey === "payment.address_label") {
        val.className += " checkout-invoice-address";
        val.textContent = displayValue;
      } else {
        val.textContent = displayValue;
      }
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "checkout-copy-btn";
      btn.innerHTML = CLIPBOARD_ICON_SVG;
      btn.setAttribute("aria-label", t(ariaKey));
      var toCopy = String(copyValue);
      btn.onclick = function() {
        copyToClipboard(toCopy).then(function(ok) {
          if (ok && typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
            navigator.vibrate(12);
          }
        });
      };
      valWrap.appendChild(val);
      valWrap.appendChild(btn);
      row.appendChild(lab);
      row.appendChild(valWrap);
      rows.appendChild(row);
    }
    var cur = (ic.currency_label || "").trim();
    addRow(
      "payment.field_amount",
      ic.amount_copy + (cur ? " " + cur : ""),
      ic.amount_copy,
      "web.widget.copy_amount_aria"
    );
    addRow(
      "payment.field_order_number",
      ic.order_number,
      ic.order_number,
      "web.widget.copy_order_aria"
    );
    addRow(
      "payment.address_label",
      ic.payment_address,
      ic.payment_address,
      "web.widget.copy_address_aria"
    );
    container.appendChild(rows);
    var preAll = document.createElement("pre");
    preAll.className = "result-body checkout-instruction-pre";
    preAll.textContent = instruction || "";
    container.appendChild(preAll);
  }
  async function fetchPaymentQrObjectUrl(paymentId) {
    var r = await fetch(
      resolveApiPath(
        API.paymentQr + "?payment_id=" + encodeURIComponent(String(paymentId))
      ),
      { method: "GET", credentials: "include" }
    );
    if (r.status === 429) {
      var msg429 = t("payment.qr_rate_limit");
      try {
        var j429 = await r.json();
        if (j429 && j429.message) msg429 = j429.message;
      } catch (_) {
      }
      return { ok: false, message: msg429 };
    }
    if (!r.ok) {
      return { ok: false, message: t("web.store.purchase_failed") };
    }
    var ct = (r.headers.get("Content-Type") || "").toLowerCase();
    if (!ct.includes("image/png")) {
      return { ok: false, message: t("web.store.purchase_failed") };
    }
    try {
      var blob = await r.blob();
      return { ok: true, objectUrl: URL.createObjectURL(blob) };
    } catch (_) {
      return { ok: false, message: t("web.store.purchase_failed") };
    }
  }
  function handleUnauthorized() {
    if (!booted) return;
    document.getElementById("appHeader").hidden = true;
    document.getElementById("bottomNav").hidden = true;
    var sn = document.getElementById("siteNavDesktop");
    if (sn) sn.hidden = true;
    showScreen("screen-expired");
    var el = document.getElementById("expired-msg");
    if (el) el.textContent = t("web.store.expired");
  }
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
    container.innerHTML = '<div class="error-box"><p class="msg">' + escHtml(msg) + '</p><button type="button" class="btn-primary btn-retry">' + escHtml(t("web.store.retry") || "\u21BB") + "</button></div>";
    var btn = container.querySelector(".btn-retry");
    if (btn) btn.onclick = retryFn;
  }
  function escHtml(s) {
    var d = document.createElement("div");
    d.textContent = s || "";
    return d.innerHTML;
  }
  var TG_SVG_FOOTER = '<svg class="site-footer-tg-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/></svg>';
  function isFooterContactUrl(u) {
    var s = (u || "").trim().toLowerCase();
    return s.startsWith("http://") || s.startsWith("https://") || s.startsWith("t.me/");
  }
  function renderSiteFooterDesktop(contacts, storeName) {
    var footer = document.getElementById("siteFooterDesktop");
    var linksEl = document.getElementById("site-footer-links");
    var poweredEl = document.getElementById("site-footer-powered");
    if (!footer || !linksEl || !poweredEl) return;
    linksEl.innerHTML = "";
    (contacts || []).forEach(function(c) {
      var u = (c.url || "").trim();
      if (!isFooterContactUrl(u)) return;
      var a = document.createElement("a");
      a.href = u;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.className = "site-footer-contact-link";
      a.innerHTML = TG_SVG_FOOTER;
      var span = document.createElement("span");
      span.textContent = c.title || u || "";
      a.appendChild(span);
      linksEl.appendChild(a);
    });
    poweredEl.innerHTML = t("web.store_site.footer_powered", {
      name: escHtml(storeName || "")
    });
    footer.hidden = false;
  }
  async function loadSiteContactsForShell() {
    try {
      var r = await apiFetch(API.siteContacts);
      if (!r.ok) {
        siteContactsCache = [];
        renderSiteFooterDesktop([], me && me.store_name);
        return;
      }
      var data = await r.json();
      siteContactsCache = data.contacts || [];
      renderSiteFooterDesktop(siteContactsCache, me && me.store_name);
    } catch (e) {
      if (e && e.message === "unauthorized") return;
      siteContactsCache = [];
      renderSiteFooterDesktop([], me && me.store_name);
    }
  }
  var ALL_SCREENS = [
    "screen-auth",
    "screen-language",
    "screen-expired",
    "screen-loading",
    "screen-shop",
    "screen-reviews",
    "screen-contacts"
  ];
  function showScreen(id) {
    ALL_SCREENS.forEach(function(sid) {
      var el = document.getElementById(sid);
      if (el) el.hidden = sid !== id;
    });
  }
  var ALL_SHOP_PANES = [
    "shop-pane-cities",
    "shop-pane-positions",
    "shop-pane-structures",
    "shop-pane-confirm",
    "shop-pane-checkout-pay",
    "shop-pane-result"
  ];
  function showShopPane(pane) {
    ALL_SHOP_PANES.forEach(function(pid) {
      var el = document.getElementById(pid);
      if (el) el.hidden = pid !== pane;
    });
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
  function updateBottomNav(activeTab) {
    document.querySelectorAll(".bnav-btn").forEach(function(b) {
      b.classList.toggle("is-active", b.getAttribute("data-tab") === activeTab);
    });
  }
  async function onRouteChange() {
    if (!booted) return;
    var route = parseRoute(location.hash);
    if (route.name === "promo") {
      history.replaceState(null, "", "#shop");
      route = { name: "shop", params: {} };
    }
    var tab = tabForRoute(route.name);
    updateBottomNav(tab);
    var token = ++renderToken;
    switch (route.name) {
      case "shop":
      case "cities":
        showScreen("screen-shop");
        showShopPane("shop-pane-cities");
        await showCities(token);
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
        await showConfirm(route.params, token);
        break;
      case "result":
        showScreen("screen-shop");
        showShopPane("shop-pane-result");
        showResult();
        break;
      case "reviews":
        showScreen("screen-reviews");
        await showReviews(0, token);
        break;
      case "review_create":
        showScreen("screen-reviews");
        await showReviewCreate(route.params.payment_id, token);
        break;
      case "account_payment":
        showScreen("screen-reviews");
        await showAccountPayment(route.params.payment_id, token);
        break;
      case "contacts":
        showScreen("screen-contacts");
        await showSiteContacts(token);
        break;
      default:
        showScreen("screen-shop");
        showShopPane("shop-pane-cities");
        await showCities(token);
    }
  }
  function applyThemeColor(name) {
    var map = {
      blue: "#3d8bfd",
      red: "#e85d6f",
      green: "#3dcc85",
      black: "#6b7280"
    };
    var hoverMap = {
      blue: "#5ba3ff",
      red: "#ff7a8a",
      green: "#4ae397",
      black: "#8b95a5"
    };
    if (name && map[name]) {
      document.documentElement.style.setProperty("--accent", map[name]);
      document.documentElement.style.setProperty(
        "--accent-hover",
        hoverMap[name] || map[name]
      );
    }
  }
  function applyWidgetBaseTheme(theme) {
    var t2 = theme && String(theme).toLowerCase() || "dark";
    if (t2 === "light" || t2 === "red" || t2 === "green") {
      document.documentElement.setAttribute("data-theme", t2);
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }
  function applyStoreAppearanceFromMe(meLike) {
    if (!meLike) return;
    applyWidgetBaseTheme(meLike.widget_theme);
    var t2 = meLike.widget_theme && String(meLike.widget_theme).toLowerCase().trim() || "dark";
    var byTheme = { dark: "blue", light: "black", red: "red", green: "green" };
    var accent = byTheme[t2] || "blue";
    applyThemeColor(accent);
  }
  function guessLocale() {
    var nav = (navigator.language || "uk").slice(0, 2).toLowerCase();
    return LOCALES.some(function(L) {
      return L.code === nav;
    }) ? nav : "uk";
  }
  async function loadI18n(locale) {
    try {
      var r = await apiFetch(API.i18n + "?locale=" + encodeURIComponent(locale));
      var j = await r.json();
      S = j.strings || {};
    } catch (e) {
      reportError("loadI18n", e);
    }
  }
  function closeLangPickerMenu() {
    var menu = document.getElementById("lang-picker-menu");
    var trig = document.getElementById("lang-picker-trigger");
    if (menu) menu.hidden = true;
    if (trig) trig.setAttribute("aria-expanded", "false");
  }
  async function applyLocaleChange(loc) {
    try {
      var r = await apiFetch(API.locale, { method: "POST", json: { locale: loc } });
      if (r.ok) {
        await loadI18n(loc);
        if (me) me.locale = loc;
        refreshLabels();
        onRouteChange();
      }
    } catch (_) {
    }
    closeLangPickerMenu();
    if (me) fillLocaleSelect(me.locale);
  }
  function fillLocaleSelect(current) {
    var trig = document.getElementById("lang-picker-trigger");
    var menu = document.getElementById("lang-picker-menu");
    if (!trig || !menu) return;
    trig.setAttribute("aria-label", t("web.store.language") || "Language");
    menu.innerHTML = "";
    LOCALES.forEach(function(L) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "lang-picker-option";
      btn.setAttribute("role", "option");
      btn.setAttribute("data-locale", L.code);
      btn.textContent = (L.flag ? L.flag + " " : "") + L.label;
      if (L.code === current) {
        btn.classList.add("is-current");
        btn.setAttribute("aria-selected", "true");
      } else {
        btn.setAttribute("aria-selected", "false");
      }
      btn.addEventListener("click", function(e) {
        e.stopPropagation();
        void applyLocaleChange(L.code);
      });
      menu.appendChild(btn);
    });
    if (!langPickerDocListenersWired) {
      langPickerDocListenersWired = true;
      document.addEventListener("click", function(e) {
        var root = document.querySelector(".lang-picker");
        if (!root || root.contains(e.target)) return;
        var m = document.getElementById("lang-picker-menu");
        if (m && !m.hidden) closeLangPickerMenu();
      });
      document.addEventListener("keydown", function(e) {
        if (e.key !== "Escape") return;
        var m = document.getElementById("lang-picker-menu");
        if (!m || m.hidden) return;
        e.preventDefault();
        closeLangPickerMenu();
        var t2 = document.getElementById("lang-picker-trigger");
        if (t2) t2.focus();
      });
    }
    trig.onclick = function() {
      if (menu.hidden) {
        menu.hidden = false;
        trig.setAttribute("aria-expanded", "true");
      } else {
        closeLangPickerMenu();
      }
    };
  }
  function refreshLabels() {
    var $ = function(id) {
      return document.getElementById(id);
    };
    var shopL = t("web.widget.tab_shop");
    var revL = t("web.widget.nav_reviews") || t("review.menu_title") || "Reviews";
    var conL = t("web.store_site.nav_contacts");
    $("bnav-shop").textContent = shopL;
    $("bnav-reviews").textContent = revL;
    $("bnav-contacts").textContent = conL;
    var desk = document.querySelector(".site-nav-desktop");
    if (desk) {
      let setDeskTab = function(tab, label) {
        var b = desk.querySelector('.bnav-btn[data-tab="' + tab + '"] .bnav-label');
        if (b) b.textContent = label;
      };
      setDeskTab("shop", shopL);
      setDeskTab("reviews", revL);
      setDeskTab("contacts", conL);
    }
    $("loading-msg").textContent = t("web.store.loading");
    $("cities-title").textContent = t("web.store.cities_title");
    $("confirm-title").textContent = t("web.store.checkout_methods_title");
    var cpt = document.getElementById("checkout-pay-title");
    if (cpt) {
      if (checkoutPaymentId && lastCheckoutInvoiceCopy && invoiceCopyHasOrderInfo(lastCheckoutInvoiceCopy)) {
        cpt.textContent = t("web.store.invoice_payment_info_title");
      } else {
        cpt.textContent = t("web.store.checkout_invoice_title");
      }
    }
    $("result-title").textContent = t("web.store.result_title");
    $("result-ok").textContent = t("web.store.back");
    var cqrb = $("checkout-qr-btn");
    if (cqrb) cqrb.textContent = t("payment.get_qr");
    var qmt = document.getElementById("qr-modal-title");
    if (qmt) qmt.textContent = t("web.widget.qr_modal_title");
    var qmc = document.getElementById("qr-modal-close");
    if (qmc) qmc.setAttribute("aria-label", t("web.widget.qr_modal_close"));
    var sfp = document.getElementById("site-footer-powered");
    if (sfp && me && booted) {
      sfp.innerHTML = t("web.store_site.footer_powered", {
        name: escHtml(me.store_name || "")
      });
    }
  }
  async function showCities(token) {
    showShopPane("shop-pane-cities");
    var grid = document.getElementById("cities-grid");
    grid.innerHTML = skeletonCards(6);
    try {
      var all = [];
      for (var p = 0; ; p++) {
        var r = await apiFetch(API.cities + "?page=" + p);
        var data = await r.json();
        if (token !== renderToken) return;
        all = all.concat(data.cities || []);
        if (!data.has_next) break;
      }
      grid.innerHTML = "";
      all.forEach(function(c) {
        var b = document.createElement("button");
        b.type = "button";
        b.textContent = c.name;
        b.onclick = function() {
          currentCityId = c.id;
          currentCityName = c.name;
          navigate("#positions/" + c.id);
        };
        grid.appendChild(b);
      });
    } catch (e) {
      if (e.message === "unauthorized") return;
      if (token !== renderToken) return;
      renderErrorRetry(grid, t("web.store.purchase_failed"), function() {
        showCities(renderToken);
      });
    }
  }
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
      positions.forEach(function(pos) {
        positionsCache[pos.id] = pos;
        var card = document.createElement("button");
        card.type = "button";
        card.className = "pos-card";
        var imgSrc = pos.photo_url || NO_PHOTO_SVG;
        var imgHtml = '<img class="pos-card-img" src="' + escHtml(imgSrc) + `" alt="" loading="lazy" onerror="this.src='` + NO_PHOTO_SVG + `'">`;
        var priceHtml = '<span class="price-effective">' + escHtml(String(pos.effective_price)) + " " + escHtml(pos.currency || "") + "</span>";
        if (pos.discount_percent && pos.discount_percent > 0) {
          priceHtml += ' <span class="price-original">' + escHtml(String(pos.price)) + "</span>";
          priceHtml += ' <span class="discount-badge">-' + pos.discount_percent + "%</span>";
        }
        card.innerHTML = imgHtml + '<div class="pos-card-body"><p class="pos-card-name">' + escHtml(pos.name) + '</p><div class="price-row">' + priceHtml + "</div></div>";
        card.onclick = function() {
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
          prevBtn.onclick = function() {
            navigate("#positions/" + cityId + "/" + (page - 1), { replace: true });
          };
          pag.appendChild(prevBtn);
        }
        if (data.has_next) {
          var nextBtn = document.createElement("button");
          nextBtn.type = "button";
          nextBtn.className = "btn-nav";
          nextBtn.textContent = t("web.store.next");
          nextBtn.onclick = function() {
            navigate("#positions/" + cityId + "/" + (page + 1), { replace: true });
          };
          pag.appendChild(nextBtn);
        }
        cont.appendChild(pag);
      }
    } catch (e) {
      if (e.message === "unauthorized") return;
      if (token !== renderToken) return;
      renderErrorRetry(cont, t("web.store.purchase_failed"), function() {
        loadPositions(cityId, page, renderToken);
      });
    }
  }
  async function loadStructures(cityId, posId, token) {
    var title = document.getElementById("structures-title");
    var cont = document.getElementById("structures-content");
    var cachedPos = positionsCache[posId];
    title.textContent = (cachedPos ? cachedPos.name : t("web.store.offers_title")) + (currentCityName ? " \u2014 " + currentCityName : "");
    cont.innerHTML = skeletonCards(4);
    try {
      var r = await apiFetch(
        API.structures + "?city_id=" + encodeURIComponent(String(cityId)) + "&pos_id=" + encodeURIComponent(String(posId))
      );
      var data = await r.json();
      if (token !== renderToken) return;
      if (data.position_name) {
        title.textContent = data.position_name + (currentCityName ? " \u2014 " + currentCityName : "");
      }
      var structs = data.structures || [];
      cont.innerHTML = "";
      if (structs.length === 0) {
        cont.innerHTML = '<p class="msg">' + escHtml(t("web.store.no_offers")) + "</p>";
        return;
      }
      structs.forEach(function(st) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "struct-btn";
        btn.innerHTML = "<span>" + escHtml(st.name) + "</span>";
        btn.onclick = function() {
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
            currency: cachedPos ? cachedPos.currency : me ? me.currency : ""
          };
          navigate("#confirm/" + cityId + "/" + posId + "/" + st.id);
        };
        cont.appendChild(btn);
      });
    } catch (e) {
      if (e.message === "unauthorized") return;
      if (token !== renderToken) return;
      renderErrorRetry(cont, t("web.store.purchase_failed"), function() {
        loadStructures(cityId, posId, renderToken);
      });
    }
  }
  function resetCheckoutPayUI() {
    checkoutPaymentId = null;
    checkoutPayContext = null;
    lastCheckoutInvoiceCopy = null;
    checkoutNeedsTx = false;
    hideCheckoutQrUi();
    var ins = document.getElementById("checkout-instruction");
    var res = document.getElementById("checkout-pay-result");
    var txIn = document.getElementById("checkout-tx-input");
    var txStep = document.getElementById("checkout-tx-step");
    if (ins) ins.innerHTML = "";
    if (res) res.textContent = "";
    if (txIn) txIn.value = "";
    if (txStep) txStep.hidden = true;
  }
  function showCheckoutPayPane(instruction, paymentId, needsTx, cd, invoiceCopy) {
    resetCheckoutPayUI();
    checkoutPaymentId = paymentId;
    checkoutPayContext = { city_id: cd.city_id, pos_id: cd.pos_id };
    checkoutNeedsTx = !!needsTx;
    showShopPane("shop-pane-checkout-pay");
    lastCheckoutInvoiceCopy = invoiceCopy || null;
    var cptEl = document.getElementById("checkout-pay-title");
    if (cptEl) {
      cptEl.textContent = invoiceCopyHasOrderInfo(lastCheckoutInvoiceCopy || {}) ? t("web.store.invoice_payment_info_title") : t("web.store.checkout_invoice_title");
    }
    renderInvoiceInstruction(
      document.getElementById("checkout-instruction"),
      instruction || "",
      invoiceCopy
    );
    document.getElementById("checkout-check-btn").textContent = t("web.widget.topup_check");
    document.getElementById("checkout-cancel-btn").textContent = t("web.widget.topup_cancel");
    document.getElementById("checkout-tx-label").textContent = t("payment.send_txid_prompt");
    document.getElementById("checkout-tx-submit").textContent = t("payment.send_txid");
    document.getElementById("checkout-tx-step").hidden = !checkoutNeedsTx;
    placeCheckoutQrButton(checkoutNeedsTx);
    document.getElementById("checkout-qr-btn").onclick = async function() {
      if (!checkoutPaymentId) return;
      var resEl = document.getElementById("checkout-pay-result");
      var qrBtn = document.getElementById("checkout-qr-btn");
      if (resEl) resEl.textContent = "";
      qrBtn.disabled = true;
      try {
        var qrRes = await fetchPaymentQrObjectUrl(checkoutPaymentId);
        if (!qrRes.ok) {
          if (resEl) resEl.textContent = qrRes.message || t("web.store.purchase_failed");
          return;
        }
        revokeCheckoutQrObjectUrl();
        checkoutQrObjectUrl = qrRes.objectUrl;
        openQrModal(checkoutQrObjectUrl);
      } catch (_) {
        if (resEl) resEl.textContent = t("web.store.purchase_failed");
      }
      qrBtn.disabled = false;
    };
    document.getElementById("checkout-check-btn").onclick = async function() {
      if (!checkoutPaymentId) return;
      var resEl = document.getElementById("checkout-pay-result");
      var chkBtn = document.getElementById("checkout-check-btn");
      if (chkBtn.disabled) return;
      chkBtn.disabled = true;
      try {
        var r = await apiFetch(API.topupCheck, {
          method: "POST",
          json: { payment_id: checkoutPaymentId }
        });
        var j = await r.json();
        resEl.textContent = j.message || "";
        if (j.paid) {
          await refreshMe();
          var text = j.message || "";
          if (j.product_lines && j.product_lines.length) {
            text += "\n\n" + j.product_lines.join("\n");
          }
          resultState = { text: text.trim(), ok: true };
          resetCheckoutPayUI();
          confirmData = null;
          navigate("#result", { replace: true });
        }
      } catch (_) {
        resEl.textContent = t("web.store.purchase_failed");
      } finally {
        chkBtn.disabled = false;
      }
    };
    document.getElementById("checkout-cancel-btn").onclick = function() {
      openPaymentCancelModal({
        onYes: function() {
          return cancelCheckoutAndNavigateToStructures();
        }
      });
    };
    document.getElementById("checkout-tx-submit").onclick = async function() {
      var tx = (document.getElementById("checkout-tx-input").value || "").trim();
      var resEl = document.getElementById("checkout-pay-result");
      if (!checkoutPaymentId) return;
      var txBtn = document.getElementById("checkout-tx-submit");
      if (txBtn.disabled) return;
      txBtn.disabled = true;
      try {
        var r = await apiFetch(API.paymentSubmitTx, {
          method: "POST",
          json: { payment_id: checkoutPaymentId, tx_hash: tx }
        });
        var j = await r.json();
        if (!r.ok || !j.ok) {
          resEl.textContent = j && j.message || t("web.store.purchase_failed");
          return;
        }
        resEl.textContent = j.message || "";
        if (j.paid && j.product_lines && j.product_lines.length) {
          resultState = {
            text: ((j.message || "") + "\n\n" + j.product_lines.join("\n")).trim(),
            ok: true
          };
          resetCheckoutPayUI();
          confirmData = null;
          await refreshMe();
          navigate("#result", { replace: true });
        }
      } catch (_) {
        resEl.textContent = t("web.store.purchase_failed");
      } finally {
        txBtn.disabled = false;
      }
    };
  }
  async function showConfirm(params, token) {
    var title = document.getElementById("confirm-title");
    var cont = document.getElementById("confirm-content");
    title.textContent = t("web.store.checkout_methods_title");
    if (!confirmData || confirmData.struct_id !== params.struct_id) {
      navigate("#structures/" + params.city_id + "/" + params.pos_id, { replace: true });
      return;
    }
    var cd = confirmData;
    cont.innerHTML = skeletonLines(4);
    try {
      var optRes = await apiFetch(API.checkoutOptions, {
        method: "POST",
        json: {
          city_id: cd.city_id,
          pos_id: cd.pos_id,
          struct_id: cd.struct_id
        }
      });
      var optJson = await optRes.json();
      if (token !== renderToken) return;
      if (!optRes.ok || !optJson.ok) {
        renderErrorRetry(
          cont,
          optJson && optJson.message || t("web.store.purchase_failed"),
          function() {
            showConfirm(params, token);
          }
        );
        return;
      }
      var options = optJson.options || [];
      if (options.length === 0) {
        renderErrorRetry(cont, t("web.store.purchase_failed"), function() {
          showConfirm(params, token);
        });
        return;
      }
      var html = '<div class="confirm-info">';
      html += '<p class="ci-name">' + escHtml(optJson.position_name || cd.position_name) + " / " + escHtml(optJson.structure_name || cd.structure_name) + "</p>";
      if (optJson.city_name || cd.city_name) {
        html += '<p class="ci-sub">' + escHtml(optJson.city_name || cd.city_name || "") + "</p>";
      }
      html += '<p class="ci-price">' + escHtml(String(optJson.effective_price || "")) + " " + escHtml(optJson.currency || cd.currency || "") + "</p>";
      html += '</div><p class="msg" id="checkout-option-err"></p>';
      html += '<div id="checkout-methods-grid" class="btn-grid"></div>';
      html += '<div class="btn-row"><button type="button" class="btn-secondary" id="checkout-methods-back">' + escHtml(t("web.store.cancel")) + "</button></div>";
      cont.innerHTML = html;
      var grid = document.getElementById("checkout-methods-grid");
      var errEl = document.getElementById("checkout-option-err");
      options.forEach(function(opt) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "btn-primary";
        b.textContent = opt.label;
        b.onclick = async function() {
          if (b.disabled) return;
          errEl.textContent = "";
          b.disabled = true;
          try {
            var sr = await apiFetch(API.checkoutStart, {
              method: "POST",
              json: {
                city_id: cd.city_id,
                pos_id: cd.pos_id,
                struct_id: cd.struct_id,
                method_key: opt.key
              }
            });
            var sj = await sr.json();
            if (token !== renderToken) return;
            if (!sr.ok || !sj.ok) {
              errEl.textContent = sj && sj.message || t("web.store.purchase_failed");
              return;
            }
            if (sj.payment_id) {
              showCheckoutPayPane(
                sj.instruction || "",
                sj.payment_id,
                sj.needs_tx_hash,
                cd,
                sj.invoice_copy || null
              );
              return;
            }
            var text = sj.message || "";
            if (sj.product_lines && sj.product_lines.length) {
              text += "\n\n" + sj.product_lines.join("\n");
            }
            resultState = { text: text.trim(), ok: true };
            confirmData = null;
            await refreshMe();
            navigate("#result", { replace: true });
          } catch (_) {
            errEl.textContent = t("web.store.purchase_failed");
          } finally {
            if (token === renderToken) b.disabled = false;
          }
        };
        grid.appendChild(b);
      });
      document.getElementById("checkout-methods-back").onclick = function() {
        confirmData = null;
        goBack();
      };
    } catch (e) {
      if (e.message === "unauthorized") return;
      if (token !== renderToken) return;
      renderErrorRetry(cont, t("web.store.purchase_failed"), function() {
        showConfirm(params, token);
      });
    }
  }
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
    document.getElementById("result-ok").onclick = function() {
      navigate("#shop", { resetStack: true });
    };
  }
  function formatReviewDateDdMmYyyy(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    var dd = d.getDate();
    var mm = d.getMonth() + 1;
    var pad = function(n) {
      return (n < 10 ? "0" : "") + n;
    };
    return pad(dd) + "." + pad(mm) + "." + d.getFullYear();
  }
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
      if (data.average_rating !== null && data.average_rating !== void 0) {
        var avgStars = renderStarsHtml(Math.round(data.average_rating));
        html += '<div style="margin-bottom:0.75rem">' + avgStars + ' <span style="color:var(--muted);font-size:0.85rem">' + escHtml(String(data.average_rating)) + " / 5 (" + (data.total_count || 0) + ")</span></div>";
      }
      var reviews = data.reviews || [];
      if (reviews.length === 0) {
        html += '<p class="msg">' + escHtml(t("review.no_reviews") || "No reviews") + "</p>";
      }
      reviews.forEach(function(rv) {
        var dateStr = formatReviewDateDdMmYyyy(rv.created_at);
        var timeHtml = "";
        if (dateStr) {
          timeHtml = '<time class="review-date" datetime="' + escHtml(String(rv.created_at)) + '">' + escHtml(dateStr) + "</time>";
        }
        html += '<div class="review-card"><div class="review-card-head"><div class="review-stars">' + renderStarsHtml(rv.rating) + "</div>" + timeHtml + "</div>" + (rv.text ? '<p class="review-text">' + escHtml(rv.text) + "</p>" : "") + '<p class="review-meta">' + escHtml(rv.position_name || "") + (rv.city_name ? ", " + escHtml(rv.city_name) : "") + "</p></div>";
      });
      if (data.has_next || page > 0) {
        html += '<div class="pagination">';
        if (page > 0) {
          html += '<button type="button" class="btn-nav" id="rev-prev">' + escHtml(t("web.store.prev")) + "</button>";
        }
        if (data.has_next) {
          html += '<button type="button" class="btn-nav" id="rev-next">' + escHtml(t("web.store.next")) + "</button>";
        }
        html += "</div>";
      }
      cont.innerHTML = html;
      var prevBtn = document.getElementById("rev-prev");
      var nextBtn = document.getElementById("rev-next");
      if (prevBtn) prevBtn.onclick = function() {
        showReviews(page - 1, renderToken);
      };
      if (nextBtn) nextBtn.onclick = function() {
        showReviews(page + 1, renderToken);
      };
    } catch (e) {
      if (e.message === "unauthorized") return;
      if (token !== renderToken) return;
      renderErrorRetry(cont, t("web.store.purchase_failed"), function() {
        showReviews(page, renderToken);
      });
    }
  }
  function renderStarsHtml(rating) {
    var s = "";
    for (var i = 0; i < 5; i++) s += i < rating ? "\u2605" : "\u2606";
    return '<span style="color:var(--accent)">' + s + "</span>";
  }
  async function showReviewCreate(paymentId, token) {
    var cont = document.getElementById("reviews-content");
    var title = document.getElementById("reviews-title");
    title.textContent = t("review.leave") || "Leave review";
    cont.innerHTML = skeletonLines(4);
    var payInfo = null;
    try {
      var r = await apiFetch(API.accountPay + "?payment_id=" + paymentId);
      if (r.ok) payInfo = await r.json();
    } catch (_) {
    }
    if (token !== renderToken) return;
    if (payInfo && !payInfo.can_review) {
      cont.innerHTML = '<p class="msg">' + escHtml(t("review.already_left") || "Already reviewed") + "</p>";
      return;
    }
    var selectedRating = 0;
    var html = "";
    if (payInfo) {
      html += '<p class="msg" style="margin-bottom:0.5rem">' + escHtml((payInfo.position_name || "") + (payInfo.structure_name ? " / " + payInfo.structure_name : "")) + "</p>";
    }
    html += '<p class="field-label">' + escHtml(t("review.rating_label") || "Rating") + "</p>";
    html += '<div class="star-picker" id="star-picker">';
    for (var i = 1; i <= 5; i++) {
      html += '<button type="button" class="star-picker-btn" data-val="' + i + '">\u2606</button>';
    }
    html += "</div>";
    html += '<p class="field-label">' + escHtml(t("review.enter_text") || "Comment (optional)") + "</p>";
    html += '<textarea class="textarea-input" id="review-text" maxlength="1000" rows="3"></textarea>';
    html += '<button type="button" class="btn-primary" id="review-submit" disabled>' + escHtml(t("review.publish") || "Submit") + "</button>";
    html += '<p class="msg" id="review-msg"></p>';
    cont.innerHTML = html;
    var picker = document.getElementById("star-picker");
    var submitBtn = document.getElementById("review-submit");
    function updateStars(val) {
      selectedRating = val;
      picker.querySelectorAll(".star-picker-btn").forEach(function(sb) {
        var v = parseInt(sb.getAttribute("data-val"), 10);
        sb.textContent = v <= val ? "\u2605" : "\u2606";
        sb.classList.toggle("filled", v <= val);
      });
      submitBtn.disabled = val < 1;
    }
    picker.querySelectorAll(".star-picker-btn").forEach(function(sb) {
      sb.onclick = function() {
        updateStars(parseInt(sb.getAttribute("data-val"), 10));
      };
    });
    var reviewSubmitting = false;
    submitBtn.onclick = async function() {
      if (selectedRating < 1) return;
      if (reviewSubmitting) return;
      reviewSubmitting = true;
      submitBtn.disabled = true;
      submitBtn.textContent = t("web.store.loading");
      var text = (document.getElementById("review-text").value || "").trim();
      try {
        var rr = await apiFetch(API.reviewCreate, {
          method: "POST",
          json: { payment_id: paymentId, rating: selectedRating, text }
        });
        var j = await rr.json();
        var msgEl = document.getElementById("review-msg");
        if (rr.ok && j.ok) {
          msgEl.style.color = "var(--green)";
          msgEl.textContent = j.message || t("review.thanks_pending") || "Thank you!";
          submitBtn.hidden = true;
          setTimeout(function() {
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
      } finally {
        reviewSubmitting = false;
      }
    };
  }
  async function showAccountPayment(paymentId, token) {
    var cont = document.getElementById("reviews-content");
    var title = document.getElementById("reviews-title");
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
      html += '<p style="font-weight:600;font-size:1rem">#' + p.id + " \u2014 " + escHtml(p.order_id) + "</p>";
      if (p.position_name) html += "<p>" + escHtml(p.position_name) + "</p>";
      if (p.structure_name || p.city_name) {
        html += '<p style="color:var(--muted);font-size:0.85rem">' + escHtml([p.structure_name, p.city_name].filter(Boolean).join(" \xB7 ")) + "</p>";
      }
      var mainAmt = p.invoice_amount !== void 0 && p.invoice_amount !== null && p.invoice_amount !== "" ? String(p.invoice_amount) + " " + String(p.invoice_currency || p.currency || "") : String(p.amount) + " " + String(p.currency || "");
      html += '<p style="margin-top:0.5rem">' + escHtml(mainAmt) + " \u2014 <strong>" + escHtml(p.status_label) + "</strong></p>";
      if (p.ledger_amount != null && p.ledger_amount !== "" && p.ledger_currency) {
        html += '<p style="font-size:0.85rem;color:var(--muted)">' + escHtml(t("account.ledger_amount")) + ": " + escHtml(String(p.ledger_amount) + " " + String(p.ledger_currency)) + "</p>";
      }
      if (p.payment_address) {
        html += '<p style="margin-top:0.5rem;font-size:0.9rem;word-break:break-all">' + escHtml(t("account.pay_address")) + ": " + escHtml(String(p.payment_address)) + "</p>";
      }
      if (p.created_at) {
        html += '<p style="font-size:0.75rem;color:var(--muted)">' + escHtml(new Date(p.created_at).toLocaleString()) + "</p>";
      }
      var photos = p.product_photos || [];
      if (photos.length > 0) {
        html += '<div class="pay-detail-links">';
        var photoBase = t("account.photo_link") || "Link";
        photos.forEach(function(url, idx) {
          var label = photos.length === 1 ? photoBase : photoBase + " " + String(idx + 1);
          html += '<p class="pay-product-link-wrap"><a class="pay-product-link" href="' + escHtml(url) + '" target="_blank" rel="noopener noreferrer">' + escHtml(label) + "</a></p>";
        });
        html += '</div><div class="pay-detail-photos">';
        photos.forEach(function(url) {
          html += '<img src="' + escHtml(url) + `" alt="" loading="lazy" style="max-width:240px" onerror="this.style.display='none'">`;
        });
        html += "</div>";
      }
      html += "</div>";
      if (p.provider_check_available) {
        html += '<button type="button" class="btn-primary" style="width:100%;margin-top:0.75rem" id="account-payment-check-btn">' + escHtml(t("payment.check_status") || t("web.widget.topup_check") || "Check status") + "</button>";
        html += '<p class="msg" id="account-payment-check-msg" style="margin-top:0.5rem"></p>';
      }
      if (p.can_review) {
        html += '<button type="button" class="btn-primary" style="width:100%" id="leave-review-btn">' + escHtml(t("review.leave") || "Leave review") + "</button>";
      }
      cont.innerHTML = html;
      var checkBtn = document.getElementById("account-payment-check-btn");
      if (checkBtn) {
        checkBtn.onclick = async function() {
          var msgEl = document.getElementById("account-payment-check-msg");
          if (msgEl) msgEl.textContent = "";
          checkBtn.disabled = true;
          try {
            var cr = await apiFetch(API.topupCheck, {
              method: "POST",
              json: { payment_id: Number(paymentId) }
            });
            var cj = {};
            try {
              cj = await cr.json();
            } catch (_) {
            }
            if (!cr.ok) {
              if (msgEl) msgEl.textContent = cj && cj.message || t("web.store.purchase_failed");
              checkBtn.disabled = false;
              return;
            }
            if (msgEl) msgEl.textContent = cj && cj.message || "";
            if (cj && cj.paid) {
              await refreshMe();
              await showAccountPayment(paymentId, renderToken);
              return;
            }
          } catch (_) {
            if (msgEl) msgEl.textContent = t("web.store.purchase_failed");
          }
          checkBtn.disabled = false;
        };
      }
      var reviewBtn = document.getElementById("leave-review-btn");
      if (reviewBtn) {
        reviewBtn.onclick = function() {
          navigate("#review/create/" + paymentId);
        };
      }
    } catch (e) {
      if (e.message === "unauthorized") return;
      if (token !== renderToken) return;
      renderErrorRetry(cont, t("web.store.purchase_failed"), function() {
        showAccountPayment(paymentId, renderToken);
      });
    }
  }
  async function loadCustomButtons(parentEl) {
    try {
      var r = await apiFetch(API.customBtns);
      if (!r.ok) return;
      var data = await r.json();
      var buttons = data.buttons || [];
      if (buttons.length === 0) return;
      var section = document.createElement("div");
      section.className = "custom-btns";
      buttons.forEach(function(b) {
        var a = document.createElement("a");
        a.href = b.url;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = b.label || b.url;
        section.appendChild(a);
      });
      parentEl.appendChild(section);
    } catch (_) {
    }
  }
  async function showSiteContacts(token) {
    var cont = document.getElementById("contacts-content");
    var title = document.getElementById("contacts-title");
    title.textContent = t("web.store_site.contacts_title");
    cont.innerHTML = skeletonLines(4);
    try {
      var contacts = siteContactsCache;
      if (contacts === null) {
        var r = await apiFetch(API.siteContacts);
        if (!r.ok) {
          if (token !== renderToken) return;
          cont.innerHTML = '<p class="msg">' + escHtml(t("web.store.purchase_failed")) + "</p>";
          return;
        }
        var data = await r.json();
        contacts = data.contacts || [];
        siteContactsCache = contacts;
      }
      if (token !== renderToken) return;
      cont.innerHTML = "";
      if (contacts.length === 0) {
        var empty = document.createElement("p");
        empty.className = "msg";
        empty.textContent = t("web.store_site.contacts_empty");
        cont.appendChild(empty);
      } else {
        contacts.forEach(function(c) {
          var a = document.createElement("a");
          a.className = "btn-primary contact-line";
          a.href = c.url || "#";
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.textContent = c.title || c.url || "";
          cont.appendChild(a);
        });
      }
      loadCustomButtons(cont);
    } catch (e) {
      if (e.message === "unauthorized") return;
      if (token !== renderToken) return;
      renderErrorRetry(cont, t("web.store.purchase_failed"), function() {
        showSiteContacts(renderToken);
      });
    }
  }
  async function refreshMe() {
    try {
      var r = await apiFetch(API.me);
      if (r.ok) {
        me = await r.json();
        applyStoreAppearanceFromMe(me);
        refreshLabels();
      }
    } catch (_) {
    }
  }
  function runInitialLanguagePicker() {
    return new Promise(function(resolve) {
      var container = document.getElementById("language-buttons");
      if (!container) {
        showScreen("screen-auth");
        var am0 = document.getElementById("auth-msg");
        if (am0) {
          am0.textContent = t("web.widget.ui_incomplete");
        }
        resolve(false);
        return;
      }
      showScreen("screen-language");
      var titleEl = document.getElementById("language-title");
      if (titleEl) titleEl.textContent = t("redirect.select_lang");
      container.innerHTML = "";
      LOCALES.forEach(function(L) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn-primary btn-language";
        btn.textContent = (L.flag ? L.flag + " " : "") + L.label;
        btn.onclick = async function() {
          try {
            var r = await apiFetch(API.locale, { method: "POST", json: { locale: L.code } });
            if (!r.ok) return;
            await loadI18n(L.code);
            resolve(true);
          } catch (err) {
            reportError("initialLocale", err);
          }
        };
        container.appendChild(btn);
      });
    });
  }
  async function boot() {
    await loadI18n(PRE_LOCALE_UI);
    var sid = await resolveStoreBotIdEarly();
    if (sid < 1) {
      document.getElementById("auth-msg").textContent = t("web.store_site.need_store_context");
      showScreen("screen-auth");
      return;
    }
    showScreen("screen-auth");
    document.getElementById("auth-msg").textContent = t("web.store_site.session_check");
    try {
      dlog("boot: POST /api/public/store-site/bootstrap");
      var br = await fetch(resolveApiPath("/api/public/store-site/bootstrap"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store_bot_id: sid })
      });
      if (!br.ok) {
        dlog("boot: bootstrap http status=" + br.status);
        rlog("boot_bootstrap_failed http=" + br.status);
        await loadI18n(PRE_LOCALE_UI);
        var amB = document.getElementById("auth-msg");
        if (amB) {
          if (br.status === 404 || br.status === 403) {
            amB.textContent = t("web.store_site.need_store_context");
          } else {
            amB.textContent = t("errors.generic");
          }
        }
        showScreen("screen-auth");
        return;
      }
    } catch (eB) {
      dlog("boot: bootstrap fetch failed", eB && eB.message ? eB.message : eB);
      rlog("boot_bootstrap_fetch_failed", eB && eB.message ? eB.message : String(eB));
      try {
        await loadI18n(PRE_LOCALE_UI);
      } catch (_e) {
      }
      var amx = document.getElementById("auth-msg");
      if (amx) amx.textContent = t("errors.generic");
      return;
    }
    var r;
    try {
      dlog("boot: fetching /api/store/me");
      r = await apiFetch(API.me);
      dlog("boot: /me http status=" + r.status);
      if (!r.ok) {
        rlog("boot_me_failed http=" + r.status);
        await loadI18n(PRE_LOCALE_UI);
        if (r.status === 401) {
          document.getElementById("auth-msg").textContent = t("web.store_site.auth_magic_link_hint");
        } else {
          document.getElementById("auth-msg").textContent = t("web.widget.session_load_failed");
        }
        return;
      }
      var meData = await r.json();
      var mustPickLanguage = meData.locale_saved === false;
      if (mustPickLanguage) {
        await loadI18n(PRE_LOCALE_UI);
        var picked = await runInitialLanguagePicker();
        if (!picked) return;
        r = await apiFetch(API.me);
        if (!r.ok) {
          rlog("boot_me_retry_failed http=" + r.status);
          await loadI18n(PRE_LOCALE_UI);
          document.getElementById("auth-msg").textContent = t("web.widget.session_load_failed");
          return;
        }
        meData = await r.json();
      }
      me = meData;
      var loc = me.locale || guessLocale();
      await loadI18n(loc);
      applyStoreAppearanceFromMe(me);
      document.getElementById("appHeader").hidden = false;
      document.getElementById("bottomNav").hidden = false;
      var sn0 = document.getElementById("siteNavDesktop");
      if (sn0) sn0.hidden = false;
      document.getElementById("hdr-title").textContent = me.store_name || t("web.store.title");
      fillLocaleSelect(loc);
      refreshLabels();
      wireGoBackAndBottomNav();
      wireQrModal();
      wirePaymentCancelModal();
      booted = true;
      loadSiteContactsForShell();
      if (!visibilityListenerWired) {
        visibilityListenerWired = true;
        document.addEventListener("visibilitychange", function() {
          if (!booted || document.visibilityState !== "visible") return;
          if (visibilityRefreshTimer) clearTimeout(visibilityRefreshTimer);
          visibilityRefreshTimer = setTimeout(function() {
            visibilityRefreshTimer = null;
            if (document.visibilityState === "visible") {
              refreshMe();
            }
          }, 400);
        });
      }
      window.addEventListener("hashchange", function() {
        onRouteChange();
      });
      var frag = location.hash;
      if (!frag || frag === "#") {
        try {
          history.replaceState(null, "", location.pathname + location.search + "#shop");
        } catch (e) {
          location.hash = "#shop";
        }
      }
      await onRouteChange();
      dlog("boot: first route rendered");
    } catch (err) {
      dlog("boot: post-auth failed", err && err.message ? err.message : err);
      rlog("boot_post_auth_failed", err && err.message ? err.message : String(err));
      try {
        await loadI18n(PRE_LOCALE_UI);
      } catch (_e) {
      }
      var am = document.getElementById("auth-msg");
      if (am) {
        am.textContent = t("web.widget.session_load_failed");
      }
      showScreen("screen-auth");
    }
  }

  // src/main.js
  setRemoteClientLogFromConfig(false);
  boot().catch(function(e) {
  });
})();
