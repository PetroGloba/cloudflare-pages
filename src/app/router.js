/** @typedef {{ name: string, params: Record<string, unknown> }} Route */

export const TAB_ROOTS = {
  shop: "#shop",
  reviews: "#reviews",
  contacts: "#contacts",
};

/** @param {string} hash */
export function parseRoute(hash) {
  var h = (hash || "").replace(/^#\/?/, "");
  if (!h) return { name: "shop", params: {} };

  var parts = h.split("/");
  var name = parts[0];
  /** @type {Record<string, unknown>} */
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

/** @param {string} name */
export function tabForRoute(name) {
  if (name === "account_payment") return "reviews";
  if (name === "reviews" || name === "review_create") return "reviews";
  if (name === "contacts") return "contacts";
  if (name === "promo") return "shop";
  return "shop";
}
