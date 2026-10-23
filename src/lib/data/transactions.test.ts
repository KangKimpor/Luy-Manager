import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Row } from "./mappers";

const { dataContext } = vi.hoisted(() => ({ dataContext: vi.fn() }));
vi.mock("./client", async (original) => ({ ...await original<typeof import("./client")>(), dataContext }));

import { listDeletedTransactions, listLedgerLinesInRange, listRecentTransactions, listTransactionsInRange } from "./transactions";
import { LEDGER_LINE_COLUMNS } from "./client";
import { toLedgerLine, toTransaction } from "./mappers";
import { spendingByCategory, summarizeCashFlow } from "@/lib/domain/transactions";
import { summarizeBudgets } from "@/lib/domain/budgets";
import { DEMO_BUDGETS, DEMO_RATE } from "@/lib/demo-data";

const from = new Date("2026-01-01T00:00:00Z");
const to = new Date("2026-12-31T23:59:59.999Z");

function row(index: number): Row {
  return {
    id: `tx-${index}`, user_id: "u1", account_id: "a1", type: "expense",
    amount: -100, currency: "USD", occurred_at: "2026-07-01T00:00:00Z", created_via: "web",
  };
}

function database(size: number, cap = 1000) {
  const rows = Array.from({ length: size }, (_, index) => row(index));
  const queries: Array<{ eq: ReturnType<typeof vi.fn>; order: ReturnType<typeof vi.fn>; range: ReturnType<typeof vi.fn>; select: ReturnType<typeof vi.fn> }> = [];
  const fromTable = vi.fn(() => {
    let counted = false;
    const query = {
      select: vi.fn((_columns: string, options?: { count?: string }) => {
        counted = options?.count === "exact";
        return query;
      }),
      eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(), gte: vi.fn().mockReturnThis(), lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn(async (offset: number, end: number) => ({
        data: rows.slice(offset, Math.min(end + 1, offset + cap)),
        error: null, count: counted ? rows.length : null,
      })),
    };
    queries.push(query);
    return query;
  });
  dataContext.mockResolvedValue({ userId: "u1", supabase: { from: fromTable } });
  return { queries, rows, fromTable };
}

beforeEach(() => dataContext.mockReset());

it("loads bounded recent rows without counting the ledger and preserves query errors", async () => {
  const query = {
    select: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(), lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [row(1)], error: null }),
  };
  dataContext.mockResolvedValue({ userId: "u1", supabase: { from: () => query } });
  expect(await listRecentTransactions({ from, to }, 200)).toEqual([toTransaction(row(1))]);
  expect(query.select.mock.calls[0]).toHaveLength(1);
  expect(query.is).toHaveBeenCalledWith("deleted_at", null);
  expect(query.gte).toHaveBeenCalledWith("occurred_at", from.toISOString());
  expect(query.lte).toHaveBeenCalledWith("occurred_at", to.toISOString());
  expect(query.order.mock.calls).toEqual([["occurred_at", { ascending: false }], ["id", { ascending: false }]]);
  expect(query.limit).toHaveBeenCalledWith(200);
  query.limit.mockResolvedValue({ data: null, error: new Error("offline") });
  await expect(listRecentTransactions()).rejects.toThrow("offline");
});

it("keeps recent rows bounded in demo mode", async () => {
  dataContext.mockResolvedValue(null);
  expect(await listRecentTransactions({}, 1)).toHaveLength(1);
});

it("bounds the restore list to the caller and shown month, and propagates errors", async () => {
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), not: vi.fn().mockReturnThis(), gte: vi.fn().mockReturnThis(), lte: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: [], error: null }) };
  dataContext.mockResolvedValue({ userId: "u1", supabase: { from: () => query } });
  expect(await listDeletedTransactions(50, { from, to })).toEqual([]);
  expect(query.eq).toHaveBeenCalledWith("user_id", "u1");
  expect(query.not).toHaveBeenCalledWith("deleted_at", "is", null);
  expect(query.gte).toHaveBeenCalledWith("occurred_at", from.toISOString());
  expect(query.lte).toHaveBeenCalledWith("occurred_at", to.toISOString());
  query.limit.mockResolvedValue({ data: [], error: new Error("offline") });
  await expect(listDeletedTransactions()).rejects.toThrow("offline");
});

describe("complete reporting ranges", () => {
  it("loads more than the API's default thousand-row cap without dropping money", async () => {
    const db = database(1205);
    const transactions = await listTransactionsInRange(from, to);
    expect(transactions).toHaveLength(1205);
    expect(new Set(transactions.map((entry) => entry.id)).size).toBe(1205);
    expect(transactions.reduce((sum, entry) => sum + entry.amount, 0)).toBe(-120500);
    expect(db.queries).toHaveLength(2);
    expect(db.queries.map((query) => query.range.mock.calls[0])).toEqual([[0, 999], [1000, 1999]]);
    for (const query of db.queries) {
      expect(query.eq).toHaveBeenCalledWith("user_id", "u1");
      expect(query.order.mock.calls).toEqual([["occurred_at", { ascending: false }], ["id", { ascending: false }]]);
    }
    expect(db.queries[0].select.mock.calls[0][1]).toEqual({ count: "exact" });
    expect(db.queries[1].select.mock.calls[0][1]).toBeUndefined();
  });

  it("honors a configured response cap smaller than the requested page", async () => {
    const db = database(450, 200);
    const transactions = await listTransactionsInRange(from, to);
    expect(transactions).toHaveLength(450);
    expect(db.queries.map((query) => query.range.mock.calls[0][0])).toEqual([0, 200, 400]);
  });

  it("keeps a small or empty period to one query", async () => {
    const db = database(0);
    expect(await listTransactionsInRange(from, to)).toEqual([]);
    expect(db.queries).toHaveLength(1);
  });

  it("fails instead of returning partial totals after a page error", async () => {
    const db = database(1600);
    const normal = db.fromTable.getMockImplementation()!;
    db.fromTable.mockImplementation(() => {
      const query = normal();
      if (db.queries.length === 2) query.range.mockRejectedValue(new Error("Connection lost"));
      return query;
    });
    await expect(listTransactionsInRange(from, to)).rejects.toThrow("Connection lost");
  });

  it("refuses an incomplete response instead of understating spending", async () => {
    const db = database(1600);
    const normal = db.fromTable.getMockImplementation()!;
    db.fromTable.mockImplementation(() => {
      const query = normal();
      if (db.queries.length === 2) query.range.mockResolvedValue({ data: [], error: null, count: null });
      return query;
    });
    await expect(listTransactionsInRange(from, to)).rejects.toThrow("Entries changed while loading");
  });

  it("refuses repeated rows when a concurrent write shifts pagination", async () => {
    const db = database(1600);
    const normal = db.fromTable.getMockImplementation()!;
    db.fromTable.mockImplementation(() => {
      const query = normal();
      if (db.queries.length === 2) query.range.mockResolvedValue({ data: [db.rows[499]], error: null, count: null });
      return query;
    });
    await expect(listTransactionsInRange(from, to)).rejects.toThrow("Entries changed while loading");
  });

  it("rejects an invalid/reversed range before making a database request", async () => {
    await expect(listTransactionsInRange(to, from)).rejects.toThrow("Choose a valid date range");
    await expect(listTransactionsInRange(new Date("invalid"), to)).rejects.toThrow("Choose a valid date range");
    expect(dataContext).not.toHaveBeenCalled();
  });

  it("starts every remaining page before waiting for any one of them", async () => {
    const db = database(3200);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const normal = db.fromTable.getMockImplementation()!;
    db.fromTable.mockImplementation(() => {
      const query = normal();
      const read = query.range.getMockImplementation()!;
      if (db.queries.length > 1) query.range.mockImplementation(async (...args) => { await gate; return read(...args); });
      return query;
    });
    const loading = listTransactionsInRange(from, to);
    await vi.waitFor(() => expect(db.queries).toHaveLength(4));
    release();
    expect(await loading).toHaveLength(3200);
  });

  it("uses slim fields while keeping full and slim totals identical", async () => {
    const db = database(1205);
    db.rows[0] = { ...db.rows[0], amount: -1200000, currency: "KHR", base_amount: -293, base_currency: "USD", category_id: "food" };
    db.rows[1] = { ...db.rows[1], amount: 25000, type: "income" };
    db.rows[2] = { ...db.rows[2], amount: -123, type: "transfer" };
    const slim = await listLedgerLinesInRange(from, to);
    expect(db.queries[0].select.mock.calls[0][0]).toBe(LEDGER_LINE_COLUMNS);
    const full = db.rows.map(toTransaction);
    expect(slim).toEqual(db.rows.map(toLedgerLine));
    for (const currency of ["USD", "KHR"] as const) {
      expect(summarizeCashFlow(slim, currency, DEMO_RATE)).toEqual(summarizeCashFlow(full, currency, DEMO_RATE));
      expect(spendingByCategory(slim, currency, DEMO_RATE)).toEqual(spendingByCategory(full, currency, DEMO_RATE));
    }
    expect(summarizeBudgets(DEMO_BUDGETS, slim, DEMO_RATE, from)).toEqual(summarizeBudgets(DEMO_BUDGETS, full, DEMO_RATE, from));
  });

  it("refuses a slim response with invalid stored money", async () => {
    const db = database(1);
    db.rows[0].amount = -1.5;
    await expect(listLedgerLinesInRange(from, to)).rejects.toThrow("integer count");
  });
});
