import { isDemoMode } from "@/lib/auth";
import { DEMO_ACCOUNTS, DEMO_CATEGORIES, DEMO_RATE, DEMO_TRANSACTIONS } from "@/lib/demo-data";
import type { Account } from "@/lib/domain/types";
import type { AccountExport } from "@/lib/export/types";
import { exportBalances } from "@/lib/export/ledger";
import { add, money, subtract, zero } from "@/lib/money";
import { loadUsdKhrRate } from "@/lib/rates/repository";
import { validTimezone } from "@/lib/telegram/reporting";

import { ACCOUNT_COLUMNS, CATEGORY_COLUMNS, DataError, dataContext, asRows, SPLIT_COLUMNS, TENDER_COLUMNS, TRANSACTION_COLUMNS, type DataContext, type Row } from "./client";
import { mapRows, toAccount, toCategory, toMerchant, toTransaction, toTransactionSplit, toTransactionTender } from "./mappers";
import { getProfile } from "./reference";

/** Read through the API cap, and refuse a moving ledger instead of producing a partial backup. */
export async function readExportRows(context: DataContext, table: string, columns: string): Promise<Row[]> {
  const rows: Row[] = [];
  const ids = new Set<string>();
  let total: number | undefined;
  const child = ["transaction_splits", "transaction_tenders"].includes(table);
  const softDeleted = ["accounts", "transactions", "categories"].includes(table);
  do {
    let query = context.supabase.from(table).select(child ? `${columns}, transactions!inner(user_id, deleted_at)` : columns, total === undefined ? { count: "exact" } : undefined)
      .eq(child ? "transactions.user_id" : "user_id", context.userId);
    if (child || softDeleted) query = query.is(child ? "transactions.deleted_at" : "deleted_at", null);
    const { data, error, count } = await query.order("id", { ascending: true }).range(rows.length, rows.length + 499);
    if (error) throw new DataError("export your account data", error);
    if (total === undefined) {
      if (count === null || !Number.isSafeInteger(count) || count < 0) throw new DataError("verify the export row count");
      total = count;
    }
    const page = asRows(data);
    if ((page.length === 0 && rows.length < total) || rows.length + page.length > total) {
      throw new DataError("export a changing ledger. Try again once your entries finish saving");
    }
    for (const row of page) {
      if (typeof row.id !== "string" || ids.has(row.id)) throw new DataError("verify every export row");
      ids.add(row.id);
      rows.push(row);
    }
  } while (rows.length < total);
  // A delete or insert between offset pages can otherwise leave an apparently complete export.
  let verification = context.supabase.from(table).select(child ? "id, transactions!inner(user_id, deleted_at)" : "id", { count: "exact", head: true })
    .eq(child ? "transactions.user_id" : "user_id", context.userId);
  if (child || softDeleted) verification = verification.is(child ? "transactions.deleted_at" : "deleted_at", null);
  const { count, error } = await verification;
  if (error || count !== total) throw new DataError("export a changing ledger. Try again once your entries finish saving");
  return rows;
}

export async function loadAccountExport(): Promise<AccountExport> {
  const exportedAt = new Date().toISOString();
  if (isDemoMode()) {
    const accounts: Account[] = DEMO_ACCOUNTS.map((a) => {
      const change = DEMO_TRANSACTIONS.filter((t) => t.accountId === a.accountId)
        .map((t) => money(t.amount, t.currency)).reduce(add, zero(a.currency));
      return { ...a, id: a.accountId, openingBalance: subtract(money(a.currentBalance, a.currency), change).minor };
    });
    return { accounts, transactions: DEMO_TRANSACTIONS, categories: DEMO_CATEGORIES, merchants: [], splits: [], tenders: [], baseCurrency: "USD", timezone: "Asia/Phnom_Penh", rate: DEMO_RATE, exportedAt };
  }
  const context = await dataContext();
  if (!context) throw new DataError("export without signing in");
  const [accounts, transactions, categories, merchants, splits, tenders, profile, snapshot] = await Promise.all([
    readExportRows(context, "accounts", ACCOUNT_COLUMNS),
    readExportRows(context, "transactions", TRANSACTION_COLUMNS),
    readExportRows(context, "categories", CATEGORY_COLUMNS),
    readExportRows(context, "merchants", "id, user_id, name, normalized_name, default_category_id, logo_url"),
    readExportRows(context, "transaction_splits", SPLIT_COLUMNS),
    readExportRows(context, "transaction_tenders", TENDER_COLUMNS),
    getProfile(), loadUsdKhrRate(),
  ]);
  const ledger = mapRows(transactions, toTransaction, "transactions");
  const transactionIds = new Set(ledger.map((t) => t.id));
  const result: AccountExport = {
    accounts: mapRows(accounts, toAccount, "accounts"), transactions: ledger,
    categories: mapRows(categories, toCategory, "categories"), merchants: mapRows(merchants, toMerchant, "merchants"),
    splits: mapRows(splits, toTransactionSplit, "transaction_splits").filter((s) => transactionIds.has(s.transactionId)),
    tenders: mapRows(tenders, toTransactionTender, "transaction_tenders").filter((t) => transactionIds.has(t.transactionId)),
    baseCurrency: profile?.baseCurrency ?? "USD", timezone: validTimezone(profile?.timezone), rate: snapshot.rate, exportedAt,
  };
  exportBalances(result);
  return result;
}
