import { describe, expect, it } from "vitest";
import { isNavActive, MAIN_NAV, MORE_NAV } from "./navigation";

describe("navigation", () => {
  it("keeps More active on its destinations", () => {
    for (const route of ["/more", "/budgets", "/budgets/new", "/reports", "/reports/overall", "/settings"]) expect(isNavActive(route, "/more")).toBe(true);
    expect(isNavActive("/transactions", "/more")).toBe(false);
    expect(isNavActive("/accounts", "/more")).toBe(false);
    expect(isNavActive("/accounts/new", "/accounts")).toBe(true);
  });
  it("keeps Accounts in main and Budgets in More, with Reports two taps away", () => {
    expect(MAIN_NAV.map(item => item.label)).toEqual(["Home", "Activity", "Accounts", "More"]);
    expect(MORE_NAV.map(item => item.label)).toEqual(["Budgets", "Reports", "Settings"]);
  });
  it("matches route boundaries and keeps Home exclusive", () => {
    expect(isNavActive("/accounts/new", "/accounts")).toBe(true);
    expect(isNavActive("/accounts-other", "/accounts")).toBe(false);
    expect(isNavActive("/reports", "/")).toBe(false);
  });
});
