/**
 * Reading budgets.
 *
 * A budget row is only half the picture; the other half is actual spending, which
 * `spendingByCategory` in the domain layer already produces. They are combined in
 * `@/lib/domain/budgets`, keeping this module to fetching alone.
 */

import { cache } from "react";

import type { Budget } from "@/lib/domain/types";
import { DEMO_BUDGETS } from "@/lib/demo-data";
import { currentPeriod, summarizeBudgets } from "@/lib/domain/budgets";
import type { ExchangeRate } from "@/lib/money";
import { listTransactionsInRange } from "./transactions";

import { asRows, BUDGET_COLUMNS, DataError, dataContext } from "./client";
import { mapRows, toBudget } from "./mappers";

export const listBudgets = cache(async (): Promise<Budget[]> => {
  const context = await dataContext();
  if (!context) return DEMO_BUDGETS;

  const { data, error } = await context.supabase
    .from("budgets")
    .select(BUDGET_COLUMNS)
    .is("deleted_at", null)
    .eq("is_active", true)
    .order("period", { ascending: true })
    .order("starts_on", { ascending: false });

  if (error) throw new DataError("load your budgets", error);
  return mapRows(asRows(data), toBudget, "budgets");
});

/** Read only the periods the active budgets actually cover, including annual anchors. */
export async function listBudgetProgress(rate: ExchangeRate, now = new Date()) {
  const budgets = await listBudgets();
  if (budgets.length === 0) return [];

  const periods = budgets.map((budget) => currentPeriod(budget, now));
  const from = new Date(Math.min(...periods.map((period) => period.from.getTime())));
  // The transaction reader is inclusive; budget periods have an exclusive end.
  const to = new Date(Math.max(...periods.map((period) => period.to.getTime())) - 1);
  const transactions = await listTransactionsInRange(from, to);
  return summarizeBudgets(budgets, transactions, rate, now);
}
