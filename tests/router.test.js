import { describe, it, expect } from "vitest";
import { parseRoute, tabForRoute, TAB_ROOTS } from "../src/app/router.js";

describe("router", () => {
  it("parseRoute empty -> shop", () => {
    expect(parseRoute("")).toEqual({ name: "shop", params: {} });
    expect(parseRoute("#")).toEqual({ name: "shop", params: {} });
  });

  it("parseRoute positions with page", () => {
    var r = parseRoute("#positions/12/2");
    expect(r.name).toBe("positions");
    expect(r.params.city_id).toBe(12);
    expect(r.params.page).toBe(2);
  });

  it("tabForRoute maps account_payment to reviews", () => {
    expect(tabForRoute("account_payment")).toBe("reviews");
  });

  it("tabForRoute contacts", () => {
    expect(tabForRoute("contacts")).toBe("contacts");
  });

  it("TAB_ROOTS has contacts", () => {
    expect(TAB_ROOTS.contacts).toBe("#contacts");
  });
});
