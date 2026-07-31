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
