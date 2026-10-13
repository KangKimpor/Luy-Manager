import { expect, test, vi } from "vitest";
import { DEMO_BUDGETS, DEMO_RATE, DEMO_TRANSACTIONS } from "@/lib/demo-data";
import { monthFromParam } from "@/lib/period";

const mocks = vi.hoisted(() => ({ budgets: vi.fn(), lines: vi.fn(), recent: vi.fn() }));
vi.mock("./budgets", () => ({ listBudgets: mocks.budgets }));
vi.mock("./transactions", () => ({ listLedgerLinesInRange: mocks.lines, listTransactions: mocks.recent }));
import { loadDashboardLedger } from "./dashboard";

test("overlapping annual and monthly budgets use one union read plus five full rows", async () => {
  const period = monthFromParam("2026-07");
  mocks.budgets.mockResolvedValue([{ ...DEMO_BUDGETS[0], period: "yearly", startsOn: "2026-01-01" }]);
  mocks.lines.mockResolvedValue(DEMO_TRANSACTIONS);
  mocks.recent.mockResolvedValue({ transactions: DEMO_TRANSACTIONS.slice(0, 5) });
  const result = await loadDashboardLedger(period, DEMO_RATE, period.from);
  expect(mocks.lines).toHaveBeenCalledTimes(1);
  const [from, to] = mocks.lines.mock.calls[0];
  expect(from <= period.from && to >= period.to).toBe(true);
  expect(mocks.recent).toHaveBeenCalledWith({ from: period.from, to: period.to }, { number: 1, size: 5 });
  expect(result.lines.every(line => new Date(line.occurredAt) >= period.from && new Date(line.occurredAt) <= period.to)).toBe(true);
});
