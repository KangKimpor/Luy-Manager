"use server";

import { revalidatePath } from "next/cache";

import { requireUserId } from "@/lib/auth";
import { dataContext } from "@/lib/data/client";
import { isZero } from "@/lib/money";
import { budgetInputSchema, firstIssue, parseMoney, uuidSchema } from "@/lib/validation";

import type { ActionResult } from "./transactions";

/**
 * Budget management (PRD Section 11, Phase 2).
 *
 * The limit is stored in whatever currency the user set it in rather than being
 * normalised to their base currency, because someone who budgets 400,000៛ for
 * transport wants to see that figure, not $97.56. Comparison against actual
 * spending converts the spending instead, which is the side that already has a
 * recorded rate.
 */

function failed(error: unknown): ActionResult<never> {
  return {
    ok: false,
    error: error instanceof Error ? error.message : "Something went wrong.",
  };
}

function revalidateBudgets(): void {
  revalidatePath("/");
  revalidatePath("/budgets");
}

export interface BudgetInput {
  categoryId?: string | null;
  name?: string | null;
  amount: string;
  currency: "USD" | "KHR";
  period: "weekly" | "monthly" | "quarterly" | "yearly";
  startsOn?: string;
  rollover?: boolean;
  alertThreshold?: number;
}

export async function createBudget(
  input: BudgetInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const userId = await requireUserId();

    const parsed = budgetInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

    const amount = parseMoney(parsed.data.amount, parsed.data.currency);
    if (isZero(amount) || amount.minor < 0) {
      return { ok: false, error: "A budget needs a limit above zero." };
    }

    const context = await dataContext();
    if (!context) return { ok: false, error: "Connect Supabase to save budgets." };

    const { data, error } = await context.supabase
      .from("budgets")
      .insert({
        user_id: userId,
        category_id: parsed.data.categoryId ?? null,
        name: parsed.data.name ?? null,
        amount: amount.minor,
        currency: parsed.data.currency,
        period: parsed.data.period,
        starts_on: parsed.data.startsOn ?? new Date().toISOString().slice(0, 10),
        rollover: parsed.data.rollover ?? false,
        alert_threshold: parsed.data.alertThreshold ?? 0.8,
      })
      .select("id")
      .single();

    if (error) {
      // Migration 0007 has one partial unique index per scope, so a repeat is the
      // likely failure and deserves a message rather than a constraint name.
      if (/duplicate key/i.test(error.message)) {
        return {
          ok: false,
          error: parsed.data.categoryId
            ? "There is already a budget for that category and period."
            : "There is already an overall budget for that period.",
        };
      }
      return { ok: false, error: error.message };
    }

    revalidateBudgets();
    return { ok: true, data: { id: (data as { id: string }).id } };
  } catch (error) {
    return failed(error);
  }
}

export interface UpdateBudgetInput extends BudgetInput {
  id: string;
}

export async function updateBudget(
  input: UpdateBudgetInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireUserId();

    const id = uuidSchema.parse(input.id);
    const parsed = budgetInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

    const amount = parseMoney(parsed.data.amount, parsed.data.currency);
    if (isZero(amount) || amount.minor < 0) {
      return { ok: false, error: "A budget needs a limit above zero." };
    }

    const context = await dataContext();
    if (!context) return { ok: false, error: "Connect Supabase to edit budgets." };

    const { error } = await context.supabase
      .from("budgets")
      .update({
        category_id: parsed.data.categoryId ?? null,
        name: parsed.data.name ?? null,
        amount: amount.minor,
        currency: parsed.data.currency,
        period: parsed.data.period,
        rollover: parsed.data.rollover ?? false,
        alert_threshold: parsed.data.alertThreshold ?? 0.8,
      })
      .eq("id", id);

    if (error) return { ok: false, error: error.message };

    revalidateBudgets();
    return { ok: true, data: { id } };
  } catch (error) {
    return failed(error);
  }
}

/**
 * Soft-delete a budget.
 *
 * `deleted_at` rather than a real delete so the audit trail in 0007 keeps a record
 * of what the limit used to be. A budget that quietly disappeared would make an old
 * report impossible to explain.
 */
export async function deleteBudget(id: string): Promise<ActionResult<undefined>> {
  try {
    await requireUserId();
    const budgetId = uuidSchema.parse(id);

    const context = await dataContext();
    if (!context) return { ok: false, error: "Connect Supabase to delete budgets." };

    const { error } = await context.supabase
      .from("budgets")
      .update({ deleted_at: new Date().toISOString(), is_active: false })
      .eq("id", budgetId);

    if (error) return { ok: false, error: error.message };

    revalidateBudgets();
    return { ok: true, data: undefined };
  } catch (error) {
    return failed(error);
  }
}
