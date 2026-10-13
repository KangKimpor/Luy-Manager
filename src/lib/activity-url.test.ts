import { expect, test } from "vitest";
import { activityHref } from "./activity-url";
test("views and selected days preserve filters, but changing month resets the day", () => {
  const params = { month: "2026-10", view: "calendar", day: "2026-10-09", account: "aba", category: "fuel", type: "expense", q: "coffee" };
  const changedView = new URL(activityHref(params, { view: "daily" }), "https://example.test");
  expect(changedView.searchParams.get("account")).toBe("aba");
  expect(changedView.searchParams.get("q")).toBe("coffee");
  expect(changedView.searchParams.get("day")).toBe("2026-10-09");
  expect(new URL(activityHref(params, { month: "2026-11" }), "https://example.test").searchParams.has("day")).toBe(false);
});
