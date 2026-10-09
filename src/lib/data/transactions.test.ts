import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Row } from "./mappers";

const { dataContext } = vi.hoisted(() => ({ dataContext: vi.fn() }));
vi.mock("./client", async (original) => ({ ...await original<typeof import("./client")>(), dataContext }));

import { listTransactionsInRange } from "./transactions";

const from = new Date("2026-01-01T00:00:00Z");
const to = new Date("2026-12-31T23:59:59.999Z");

function row(index: number): Row {
  return {
    id: `tx-${index}`, user_id: "u1", account_id: "a1", type: "expense",
    amount: -100, currency: "USD", occurred_at: "2026-07-01T00:00:00Z", created_via: "web",
  };
}

function database(size: number, cap = 500) {
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

describe("complete reporting ranges", () => {
  it("loads more than the API's default thousand-row cap without dropping money", async () => {
    const db = database(1205);
    const transactions = await listTransactionsInRange(from, to);
    expect(transactions).toHaveLength(1205);
    expect(new Set(transactions.map((entry) => entry.id)).size).toBe(1205);
    expect(transactions.reduce((sum, entry) => sum + entry.amount, 0)).toBe(-120500);
    expect(db.queries).toHaveLength(3);
    expect(db.queries.map((query) => query.range.mock.calls[0])).toEqual([[0, 499], [500, 999], [1000, 1499]]);
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
    const db = database(600);
    const normal = db.fromTable.getMockImplementation()!;
    db.fromTable.mockImplementation(() => {
      const query = normal();
      if (db.queries.length === 2) query.range.mockRejectedValue(new Error("Connection lost"));
      return query;
    });
    await expect(listTransactionsInRange(from, to)).rejects.toThrow("Connection lost");
  });

  it("refuses an incomplete response instead of understating spending", async () => {
    const db = database(600);
    const normal = db.fromTable.getMockImplementation()!;
    db.fromTable.mockImplementation(() => {
      const query = normal();
      if (db.queries.length === 2) query.range.mockResolvedValue({ data: [], error: null, count: null });
      return query;
    });
    await expect(listTransactionsInRange(from, to)).rejects.toThrow("Entries changed while loading");
  });

  it("refuses repeated rows when a concurrent write shifts pagination", async () => {
    const db = database(600);
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
});
