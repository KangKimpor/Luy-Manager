import { describe, expect, it } from "vitest";
import { isFormRoute, isNavActive, MAIN_NAV, SIDEBAR_NAV } from "./navigation";

describe("navigation", () => {
  it("puts Home, Activity, Budgets and Insights in the mobile tab dock", () => {
    expect(MAIN_NAV.map((item) => item.label)).toEqual(["Home", "Activity", "Budgets", "Insights"]);
    expect(SIDEBAR_NAV.map((item) => item.label)).toEqual([
      "Home",
      "Activity",
      "Accounts",
      "Budgets",
      "Insights",
      "Settings",
    ]);
  });

  it("matches route boundaries and keeps Home exclusive", () => {
    expect(isNavActive("/reports/overall", "/reports")).toBe(true);
    expect(isNavActive("/budgets/new", "/budgets")).toBe(true);
    expect(isNavActive("/accounts/new", "/accounts")).toBe(true);
    expect(isNavActive("/accounts-other", "/accounts")).toBe(false);
    expect(isNavActive("/reports", "/")).toBe(false);
    expect(isNavActive("/", "/")).toBe(true);
  });

  it("identifies form routes for compact chrome", () => {
    expect(isFormRoute("/add")).toBe(true);
    expect(isFormRoute("/transactions/tx-1/edit")).toBe(true);
    expect(isFormRoute("/accounts/new")).toBe(true);
    expect(isFormRoute("/accounts/acc-1/edit")).toBe(true);
    expect(isFormRoute("/budgets/new")).toBe(true);

    expect(isFormRoute("/")).toBe(false);
    expect(isFormRoute("/transactions")).toBe(false);
    expect(isFormRoute("/accounts")).toBe(false);
    expect(isFormRoute("/budgets")).toBe(false);
    expect(isFormRoute("/reports")).toBe(false);
    expect(isFormRoute("/reports/overall")).toBe(false);
    expect(isFormRoute("/settings")).toBe(false);
    expect(isFormRoute("/login")).toBe(false);
  });
});
