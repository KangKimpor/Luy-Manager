import { describe, expect, it } from "vitest";
import { isNavActive } from "./navigation";

describe("navigation", () => {
  it("keeps More active on its destinations", () => {
    for (const route of ["/more", "/budgets", "/budgets/new", "/reports", "/settings"]) expect(isNavActive(route, "/more")).toBe(true);
    expect(isNavActive("/transactions", "/more")).toBe(false);
  });
  it("matches route boundaries and keeps Home exclusive", () => {
    expect(isNavActive("/accounts/new", "/accounts")).toBe(true);
    expect(isNavActive("/accounts-other", "/accounts")).toBe(false);
    expect(isNavActive("/reports", "/")).toBe(false);
  });
});
