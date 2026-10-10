import { describe, expect, test } from "vitest";
import type { DataContext } from "./client";
import { readExportRows } from "./export";

function boundary(total: number, child = false) {
  const reads: Array<{ columns: string; filters: Record<string, unknown>; head: boolean; start: number }> = [];
  let nullCount = false;
  let changed = false;
  const context = { userId: "owner", supabase: { from: () => {
    const read = { columns: "", filters: {} as Record<string, unknown>, head: false, start: 0 };
    const query = {
      select(columns: string, options?: { head?: boolean }) { read.columns = columns; read.head = options?.head ?? false; return query; },
      eq(key: string, value: unknown) { read.filters[key] = value; return query; },
      is(key: string, value: unknown) { read.filters[key] = value; return query; },
      order() { return query; },
      range(start: number) { read.start = start; return query; },
      then(resolve: (value: unknown) => void) {
        reads.push(read);
        const rows = Array.from({ length: Math.max(0, Math.min(37, total - read.start)) }, (_, i) => ({ id: `id-${read.start + i}`, ...(child ? { transactions: { user_id: "owner", deleted_at: null } } : { user_id: "owner" }) }));
        return Promise.resolve({ data: read.head ? null : rows, error: null, count: nullCount ? null : total + (read.head && changed ? 1 : 0) }).then(resolve);
      },
    }; return query;
  } } } as unknown as DataContext;
  return { context, reads, missingCount: () => { nullCount = true; }, changeDuringExport: () => { changed = true; } };
}

describe("complete owner-scoped exports", () => {
  test("reads past API caps and checks the final count", async () => {
    const db = boundary(1205);
    const rows = await readExportRows(db.context, "transactions", "id, amount");
    expect(rows).toHaveLength(1205);
    expect(new Set(rows.map((r) => r.id)).size).toBe(1205);
    expect(db.reads.at(-1)?.head).toBe(true);
    expect(db.reads.every((q) => q.filters.user_id === "owner" && q.filters.deleted_at === null)).toBe(true);
  });
  test("scopes splits and payments through their parent, since they have no user_id column", async () => {
    for (const table of ["transaction_splits", "transaction_tenders"]) {
      const db = boundary(2, true); await readExportRows(db.context, table, "id, transaction_id");
      expect(db.reads.every((q) => q.filters["transactions.user_id"] === "owner" && q.filters["transactions.deleted_at"] === null && q.columns.includes("transactions!inner"))).toBe(true);
      expect(db.reads.every((q) => !("user_id" in q.filters))).toBe(true);
    }
  });
  test("merchants are owner-scoped without querying a nonexistent deleted_at column", async () => {
    const db = boundary(0); await readExportRows(db.context, "merchants", "id, name");
    expect(db.reads.every((q) => q.filters.user_id === "owner" && !("deleted_at" in q.filters))).toBe(true);
  });
  test("unverifiable or moving counts do not produce a partial download", async () => {
    const missing = boundary(5); missing.missingCount();
    await expect(readExportRows(missing.context, "accounts", "id")).rejects.toThrow("row count");
    const changing = boundary(5); changing.changeDuringExport();
    await expect(readExportRows(changing.context, "transactions", "id")).rejects.toThrow("changing ledger");
  });
});
