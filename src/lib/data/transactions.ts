/**
 * Reading transactions, with the filters and paging the list actually needs.
 *
 * The dashboard's `slice(0, 8)` was fine against demo data. Against a real ledger
 * it would fetch every row a user has ever recorded in order to show eight of
 * them, so filtering and paging happen in the database, on the
 * `(user_id, occurred_at desc) where deleted_at is null` index from migration 0001.
 */

import { cache } from "react";

import type {
  Transaction,
  TransactionSplit,
  TransactionTender,
  TransactionType,
  LedgerLine,
} from "@/lib/domain/types";
import { DEMO_TRANSACTIONS } from "@/lib/demo-data";

import {
  asRow,
  asRows,
  DataError,
  dataContext,
  SPLIT_COLUMNS,
  TENDER_COLUMNS,
  TRANSACTION_COLUMNS,
  LEDGER_LINE_COLUMNS,
  type DataContext,
} from "./client";
import { mapRows, toLedgerLine, toTransaction, toTransactionSplit, toTransactionTender, type Row } from "./mappers";

export interface TransactionFilter {
  /** Inclusive lower bound on `occurred_at`. */
  from?: Date;
  /** Inclusive upper bound on `occurred_at`. */
  to?: Date;
  accountId?: string;
  categoryId?: string;
  type?: TransactionType;
  /** Free text, matched against notes. */
  search?: string;
  /** Include soft-deleted rows, for the restore view. */
  includeDeleted?: boolean;
}

export interface Page {
  /** 1-based. */
  number: number;
  size: number;
}

export interface TransactionPage {
  transactions: Transaction[];
  /** Total matching the filter, ignoring paging, for "showing 8 of 214". */
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export const DEFAULT_PAGE_SIZE = 25;

/**
 * The subset of the PostgREST builder this filter needs.
 *
 * Declared explicitly rather than inferred from the client. The real builder type
 * is recursive and generic, and threading it through a helper makes TypeScript
 * give up with "type instantiation is excessively deep". Naming only the five
 * methods used keeps the helper checkable.
 */
interface FilterableQuery {
  gte(column: string, value: string): FilterableQuery;
  lte(column: string, value: string): FilterableQuery;
  eq(column: string, value: string): FilterableQuery;
  is(column: string, value: null): FilterableQuery;
  ilike(column: string, value: string): FilterableQuery;
}

/**
 * Apply a filter to a query.
 *
 * Extracted because the rows and the count have to agree exactly; building the
 * predicate twice is how a total ends up disagreeing with the rows beneath it.
 */
function applyFilter<Q>(query: Q, filter: TransactionFilter): Q {
  let q = query as FilterableQuery;

  if (!filter.includeDeleted) q = q.is("deleted_at", null);
  if (filter.from) q = q.gte("occurred_at", filter.from.toISOString());
  if (filter.to) q = q.lte("occurred_at", filter.to.toISOString());
  if (filter.accountId) q = q.eq("account_id", filter.accountId);
  if (filter.categoryId) q = q.eq("category_id", filter.categoryId);
  if (filter.type) q = q.eq("type", filter.type);
  if (filter.search && filter.search.trim() !== "") {
    // Escape the wildcards a user can type, so a literal % does not match
    // everything and turn a narrow search into a full scan.
    const term = filter.search.trim().replace(/[%_]/g, (c) => `\\${c}`);
    q = q.ilike("notes", `%${term}%`);
  }

  return q as Q;
}

/** Filter demo data the same way, so demo mode behaves like the real thing. */
function filterDemo(filter: TransactionFilter): Transaction[] {
  return DEMO_TRANSACTIONS.filter((t) => {
    const at = new Date(t.occurredAt).getTime();
    if (filter.from && at < filter.from.getTime()) return false;
    if (filter.to && at > filter.to.getTime()) return false;
    if (filter.accountId && t.accountId !== filter.accountId) return false;
    if (filter.categoryId && t.categoryId !== filter.categoryId) return false;
    if (filter.type && t.type !== filter.type) return false;
    if (filter.search && filter.search.trim() !== "") {
      const term = filter.search.trim().toLowerCase();
      if (!(t.notes ?? "").toLowerCase().includes(term)) return false;
    }
    return true;
  }).sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
}

/** A page of transactions matching a filter, newest first. */
export async function listTransactions(
  filter: TransactionFilter = {},
  page: Page = { number: 1, size: DEFAULT_PAGE_SIZE },
): Promise<TransactionPage> {
  const pageNumber = Math.max(1, Math.trunc(page.number));
  const pageSize = Math.min(200, Math.max(1, Math.trunc(page.size)));
  const offset = (pageNumber - 1) * pageSize;

  const context = await dataContext();

  if (!context) {
    const all = filterDemo(filter);
    const slice = all.slice(offset, offset + pageSize);
    return {
      transactions: slice,
      total: all.length,
      page: pageNumber,
      pageSize,
      hasMore: offset + slice.length < all.length,
    };
  }

  const query = applyFilter(
    context.supabase
      .from("transactions")
      // 'exact' rather than 'estimated': the count is shown to the user next to
      // the rows, and an estimate that disagrees with what they can see reads as a
      // bug in the ledger.
      .select(TRANSACTION_COLUMNS, { count: "exact" }),
    filter,
  );

  const { data, error, count } = await query
    .order("occurred_at", { ascending: false })
    // id as a tie-break so two transactions at the same instant cannot swap places
    // between pages and appear twice or not at all.
    .order("id", { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (error) throw new DataError("load your transactions", error);

  const transactions = mapRows(asRows(data), toTransaction, "transactions");
  const total = count ?? transactions.length;

  return {
    transactions,
    total,
    page: pageNumber,
    pageSize,
    hasMore: offset + transactions.length < total,
  };
}

/**
 * Every transaction in a date range, for the dashboard aggregates.
 *
 * Aggregations need every matching row. Explicit pages avoid PostgREST's response
 * cap silently cutting an annual report short. Count once, then read the remaining
 * pages in parallel, using the first page's actual size if the API cap is lower.
 */
export const listTransactionsInRange = cache(
  async (from: Date, to: Date): Promise<Transaction[]> => {
    validateRange(from, to);
    const context = await dataContext();
    if (!context) return filterDemo({ from, to });
    return readTransactionsInRange(context, from, to);
  },
);

export const listLedgerLinesInRange = cache(async (from: Date, to: Date): Promise<LedgerLine[]> => {
  validateRange(from, to);
  const context = await dataContext();
  if (!context) return filterDemo({ from, to });
  return readLedgerLinesInRange(context, from, to);
});

function validateRange(from: Date, to: Date) {
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from > to) {
    throw new DataError("load transactions for that period", new Error("Choose a valid date range."));
  }
}

/** Shared with the sessionless bot: every page is explicitly owner-scoped. */
export async function readTransactionsInRange(
  context: DataContext,
  from: Date,
  to: Date,
): Promise<Transaction[]> {
  return (await readRangeRows(context, from, to, TRANSACTION_COLUMNS)).map(toTransaction);
}

export async function readLedgerLinesInRange(context: DataContext, from: Date, to: Date): Promise<LedgerLine[]> {
  return (await readRangeRows(context, from, to, LEDGER_LINE_COLUMNS)).map(toLedgerLine);
}

// Must not exceed the project's configured PostgREST max_rows (default 1000).
export const LEDGER_PAGE_SIZE = 1000;

async function readRangeRows(context: DataContext, from: Date, to: Date, columns: string): Promise<Row[]> {
  validateRange(from, to);
  const readPage = async (offset: number, size: number, counted = false) => {
    const result = await context.supabase
      .from("transactions")
      .select(columns, counted ? { count: "exact" } : undefined)
      .eq("user_id", context.userId)
      .is("deleted_at", null)
      .gte("occurred_at", from.toISOString())
      .lte("occurred_at", to.toISOString())
      .order("occurred_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + size - 1);
    if (result.error) throw new DataError("load transactions for that period", result.error);
    return { rows: asRows(result.data), count: result.count };
  };
  const first = await readPage(0, LEDGER_PAGE_SIZE, true);
  const total = first.count;
  if (total === null || !Number.isSafeInteger(total) || total < 0) {
    throw new DataError("load transactions for that period", new Error("The entry count could not be verified."));
  }
  const changed = () => new DataError("load transactions for that period", new Error("Entries changed while loading. Reload to get complete totals."));
  if ((first.rows.length === 0 && total > 0) || first.rows.length > total) throw changed();
  const size = first.rows.length || LEDGER_PAGE_SIZE;
  const offsets = Array.from({ length: Math.ceil((total - first.rows.length) / size) }, (_, index) => (index + 1) * size);
  const rest = await Promise.all(offsets.map(offset => readPage(offset, size)));
  if (rest.some(page => page.count !== null && page.count !== total)) throw changed();
  const rows = [...first.rows, ...rest.flatMap(page => page.rows)];
  const ids = new Set<string>();
  for (const row of rows) {
    if (typeof row.id !== "string" || ids.has(row.id)) throw changed();
    ids.add(row.id);
  }
  if (rows.length !== total) throw changed();
  return rows;
}

/** One transaction, for the edit form. */
export async function getTransaction(id: string): Promise<Transaction | null> {
  const context = await dataContext();
  if (!context) return DEMO_TRANSACTIONS.find((t) => t.id === id) ?? null;

  const { data, error } = await context.supabase
    .from("transactions")
    .select(TRANSACTION_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new DataError("load that transaction", error);
  const row = asRow(data);
  return row ? toTransaction(row) : null;
}

/** Both legs of a transfer, so editing or deleting one can act on the pair. */
export async function getTransferGroup(groupId: string): Promise<Transaction[]> {
  const context = await dataContext();
  if (!context) {
    return DEMO_TRANSACTIONS.filter((t) => t.transferGroupId === groupId);
  }

  const { data, error } = await context.supabase
    .from("transactions")
    .select(TRANSACTION_COLUMNS)
    .eq("transfer_group_id", groupId)
    .is("deleted_at", null);

  if (error) throw new DataError("load that transfer", error);
  return mapRows(asRows(data), toTransaction, "transactions");
}

/** The individual currencies tendered for one payment (PRD Section 7). */
export async function listTenders(transactionId: string): Promise<TransactionTender[]> {
  const context = await dataContext();
  if (!context) return [];

  const { data, error } = await context.supabase
    .from("transaction_tenders")
    .select(TENDER_COLUMNS)
    .eq("transaction_id", transactionId);

  if (error) throw new DataError("load the payment breakdown", error);
  return mapRows(asRows(data), toTransactionTender, "transaction_tenders");
}

/** The category split of one transaction (PRD Section 8). */
export async function listSplits(transactionId: string): Promise<TransactionSplit[]> {
  const context = await dataContext();
  if (!context) return [];

  const { data, error } = await context.supabase
    .from("transaction_splits")
    .select(SPLIT_COLUMNS)
    .eq("transaction_id", transactionId);

  if (error) throw new DataError("load the split breakdown", error);
  return mapRows(asRows(data), toTransactionSplit, "transaction_splits");
}

/** Soft-deleted transactions, newest first, for the restore view. */
export async function listDeletedTransactions(limit = 50, filter: TransactionFilter = {}): Promise<Transaction[]> {
  const context = await dataContext();
  if (!context) return [];

  const { data, error } = await applyFilter(context.supabase
    .from("transactions")
    .select(TRANSACTION_COLUMNS).eq("user_id", context.userId), { ...filter, includeDeleted: true })
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false })
    .limit(limit);

  if (error) throw new DataError("load deleted transactions", error);
  return mapRows(asRows(data), toTransaction, "transactions");
}
