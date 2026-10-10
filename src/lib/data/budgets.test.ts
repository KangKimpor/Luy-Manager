import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ dataContext: vi.fn(), transactions: vi.fn() }));
vi.mock("./client", async (original) => ({ ...await original<typeof import("./client")>(), dataContext: mocks.dataContext }));
vi.mock("./transactions", () => ({ listTransactionsInRange: mocks.transactions }));

import { listBudgetProgress } from "./budgets";
import { DEFAULT_RATE } from "@/lib/money";

const now = new Date("2026-10-10T04:00:00Z");
function database(periods: Array<{ period: string; starts_on: string }>) {
  const query = {
    select: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({
      data: periods.map((period, index) => ({
        id: `budget-${index}`, user_id: "user", amount: 10000,
        currency: "USD", alert_threshold: 0.8, is_active: true, ...period,
      })), error: null,
    })),
  };
  mocks.dataContext.mockResolvedValue({ userId: "user", supabase: { from: () => query } });
}

beforeEach(() => {
  mocks.dataContext.mockReset();
  mocks.transactions.mockReset().mockResolvedValue([]);
});

describe("budget reporting reads", () => {
  test("an empty budget list does not fetch any ledger history", async () => {
    database([]);
    expect(await listBudgetProgress(DEFAULT_RATE, now)).toEqual([]);
    expect(mocks.transactions).not.toHaveBeenCalled();
  });
  test("a monthly budget fetches its anchored month, including the prior month's days", async () => {
    database([{ period: "monthly", starts_on: "2026-01-15" }]);
    const progress = await listBudgetProgress(DEFAULT_RATE, now);
    expect(mocks.transactions).toHaveBeenCalledWith(
      new Date("2026-09-14T17:00:00Z"), new Date("2026-10-14T16:59:59.999Z"),
    );
    expect(progress).toHaveLength(1);
  });
  test("mixed weekly and annual budgets retain the complete annual window", async () => {
    database([
      { period: "weekly", starts_on: "2026-10-05" },
      { period: "yearly", starts_on: "2025-10-15" },
    ]);
    expect(await listBudgetProgress(DEFAULT_RATE, now)).toHaveLength(2);
    expect(mocks.transactions).toHaveBeenCalledWith(
      new Date("2025-10-14T17:00:00Z"), new Date("2026-10-14T16:59:59.999Z"),
    );
  });
  test("scheduled transactions in a future budget's first period are still included", async () => {
    database([{ period: "monthly", starts_on: "2026-11-15" }]);
    await listBudgetProgress(DEFAULT_RATE, now);
    expect(mocks.transactions).toHaveBeenCalledWith(
      new Date("2026-11-14T17:00:00Z"), new Date("2026-12-14T16:59:59.999Z"),
    );
  });
});
