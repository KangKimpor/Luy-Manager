import { render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { DEMO_ACCOUNTS, DEMO_CATEGORIES, DEMO_RATE, DEMO_TRANSACTIONS } from "@/lib/demo-data";
const mocks = vi.hoisted(() => ({ transactions: vi.fn(), deleted: vi.fn() }));
vi.mock("@/components/app-link", () => ({ AppLink: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
vi.mock("@/components/currency-toggle", () => ({ CurrencyToggle: () => <span>USD / KHR</span> }));
vi.mock("@/components/transaction-actions", () => ({ TransactionActions: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/transaction-filters", () => ({ TransactionFilters: () => <span>Filters</span> }));
vi.mock("@/lib/auth", () => ({ isDemoMode: () => false }));
vi.mock("@/lib/display-currency", () => ({ readDisplayCurrency: async () => "USD" }));
vi.mock("@/lib/rates/repository", () => ({ loadUsdKhrRate: async () => ({ rate: DEMO_RATE }) }));
vi.mock("@/lib/data/accounts", () => ({ listAccountBalances: async () => DEMO_ACCOUNTS }));
vi.mock("@/lib/data/reference", () => ({ listCategories: async () => DEMO_CATEGORIES, getSettings: async () => ({ weekStartsOn: 0 }), merchantLookup: async () => ({}) }));
vi.mock("@/lib/data/transactions", () => ({ listTransactionsInRange: mocks.transactions, listDeletedTransactions: mocks.deleted }));
import TransactionsPage from "./page";
const rows = Array.from({ length: 26 }, (_, index) => ({ ...DEMO_TRANSACTIONS[0], id: `row-${index}`, amount: -100, currency: "USD" as const, notes: "Fuel", occurredAt: "2026-10-09T17:00:00Z" }));

test("Daily renders the whole month and computes summaries", async () => {
  mocks.transactions.mockResolvedValue(rows);
  render(await TransactionsPage({ searchParams: Promise.resolve({ month: "2026-10" }) }));
  expect(screen.getAllByRole("link", { name: "Edit Fuel" })).toHaveLength(26);
  expect(screen.getAllByText("$26.00")).toHaveLength(2);
  expect(screen.getByText("26")).toBeInTheDocument();
  expect(screen.getByText("$0.00")).toBeInTheDocument();
  expect(screen.queryByRole("navigation", { name: "Pages" })).toBeNull();
});

test("Calendar honors settings, keeps filters in date links, and shows the selected day", async () => {
  mocks.transactions.mockResolvedValue(rows);
  render(await TransactionsPage({ searchParams: Promise.resolve({ month: "2026-10", view: "calendar", day: "2026-10-10", q: "Fuel" }) }));
  const calendar = screen.getByLabelText("October 2026 calendar");
  const date = within(calendar).getByRole("link", { name: /^2026-10-10,/ });
  expect(date).toHaveAttribute("href", "/transactions?view=calendar&month=2026-10&day=2026-10-10&q=Fuel");
  expect(date).toHaveAttribute("aria-current", "date");
  expect(calendar.firstElementChild).toHaveTextContent("27");
  expect(screen.getAllByRole("link", { name: "Edit Fuel" })).toHaveLength(26);
  expect(screen.getByRole("link", { name: /Next period/ }).getAttribute("href")).not.toContain("day=");
});

test("deleted rows are fetched only when requested and can be restored", async () => {
  mocks.transactions.mockResolvedValue([]); mocks.deleted.mockResolvedValue(rows.slice(0, 1));
  render(await TransactionsPage({ searchParams: Promise.resolve({ month: "2026-10", deleted: "1" }) }));
  expect(mocks.deleted).toHaveBeenCalledWith(50, expect.objectContaining({ from: expect.any(Date), to: expect.any(Date) }));
  expect(screen.getByRole("button", { name: "Restore this transaction" })).toBeInTheDocument();
});

test("a transfer renders as one row, not one per leg", async () => {
  const legs = DEMO_TRANSACTIONS.filter(transaction => transaction.transferGroupId === "tg-0001");
  expect(legs).toHaveLength(2);
  mocks.transactions.mockResolvedValue(legs);
  render(await TransactionsPage({ searchParams: Promise.resolve({ month: "2026-07" }) }));

  // One title, one amount, and one entry counted. The credit leg is not listed.
  expect(screen.getAllByText("Top up Wing")).toHaveLength(1);
  expect(screen.getAllByText("$100.00")).toHaveLength(1);
  expect(within(screen.getByLabelText("Filtered totals")).getByText("1")).toBeInTheDocument();
});
test("an account filter names the account and links back to all accounts", async () => {
  mocks.transactions.mockResolvedValue(rows);
  const account = DEMO_ACCOUNTS.find(candidate => candidate.accountId !== rows[0].accountId)!;
  render(await TransactionsPage({ searchParams: Promise.resolve({ month: "2026-10", account: account.accountId }) }));
  expect(screen.getByText(account.name)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "All accounts" })).toHaveAttribute("href", "/transactions?view=daily&month=2026-10");
  expect(screen.queryByRole("link", { name: "Edit Fuel" })).toBeNull();
});
