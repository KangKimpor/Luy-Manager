import { render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { DEFAULT_RATE } from "@/lib/money";
vi.mock("@/components/app-link", () => ({ AppLink: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
vi.mock("@/components/currency-toggle", () => ({ CurrencyToggle: () => <span>USD / KHR</span> }));
vi.mock("@/components/reports/deferred-category-donut", () => ({ DeferredCategoryDonut: () => <div>Lazy chart</div> }));
vi.mock("@/lib/display-currency", () => ({ readDisplayCurrency: async () => "USD" }));
vi.mock("@/lib/rates/repository", () => ({ loadUsdKhrRate: async () => ({ rate: DEFAULT_RATE }) }));
vi.mock("@/lib/data/reference", () => ({ categoryLookup: async () => ({ food: { name: "Food", icon: "utensils-crossed" }, salary: { name: "Salary", icon: "banknote" } }) }));
vi.mock("@/lib/data/transactions", () => ({ listLedgerLinesInRange: async () => [
  { type: "expense", amount: -500, currency: "USD", baseAmount: null, baseCurrency: null, occurredAt: "2026-07-10T03:00:00Z", categoryId: "food" },
  { type: "income", amount: 1200, currency: "USD", baseAmount: null, baseCurrency: null, occurredAt: "2026-07-10T03:00:00Z", categoryId: "salary" },
] }));
import ReportsPage from "./page";

test("defaults to expense and links categories with the month and type intact", async () => {
  render(await ReportsPage({ searchParams: Promise.resolve({ month: "2026-07" }) }));
  const list = screen.getByRole("list", { name: "Categories ranked by amount" });
  expect(within(list).getByRole("link").getAttribute("href")).toBe("/transactions?month=2026-07&type=expense&category=food");
  expect(screen.getByRole("link", { name: "Overall report" })).toHaveAttribute("href", "/reports/overall");
  expect(screen.getByRole("navigation", { name: "Report type" }).querySelector('[aria-current="page"]')).toHaveTextContent("Expense");
});
test("income is linkable and the ranked list never mixes in expenses", async () => {
  render(await ReportsPage({ searchParams: Promise.resolve({ month: "2026-07", type: "income" }) }));
  const list = screen.getByRole("list", { name: "Categories ranked by amount" });
  expect(within(list).getByText("Salary")).toBeInTheDocument();
  expect(within(list).queryByText("Food")).not.toBeInTheDocument();
  expect(within(list).getByRole("link")).toHaveAttribute("href", "/transactions?month=2026-07&type=income&category=salary");
});
