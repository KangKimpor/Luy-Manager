"use server";

import { revalidatePath } from "next/cache";

import { requireUserId } from "@/lib/auth";
import { dataContext } from "@/lib/data/client";
import { type Money, parseAmount } from "@/lib/money";
import { accountInputSchema, firstIssue, uuidSchema } from "@/lib/validation";

import type { ActionResult } from "./transactions";

/**
 * Account management (PRD Section 6).
 *
 * `ACCOUNT_PRESETS` in the domain layer has existed and been tested since Phase 1
 * with nothing calling it, which meant there was no way to create an account at
 * all. These are the writes the presets were built for.
 */

function failed(error: unknown): ActionResult<never> {
  return {
    ok: false,
    error: error instanceof Error ? error.message : "Something went wrong.",
  };
}

function revalidateAccounts(): void {
  revalidatePath("/");
  revalidatePath("/accounts");
  revalidatePath("/add");
}

export interface AccountInput {
  name: string;
  institution?: string | null;
  type: "bank" | "ewallet" | "cash" | "credit_card" | "savings" | "investment";
  currency: "USD" | "KHR";
  /** As typed. Blank means zero. */
  openingBalance?: string;
  icon?: string | null;
  color?: string | null;
  includeInNetWorth?: boolean;
  sortOrder?: number;
}

/**
 * Read an opening balance, allowing blank and allowing negative.
 *
 * Negative is legitimate here and only here: a credit card's opening balance is
 * money owed. Everything else in the app treats a bare magnitude as positive, so
 * this is the one place the sign is taken as typed.
 */
function parseOpeningBalance(raw: string | undefined, currency: "USD" | "KHR"): Money {
  if (!raw || raw.trim() === "") return parseAmount("0", currency);
  return parseAmount(raw, currency);
}

export async function createAccount(
  input: AccountInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const userId = await requireUserId();

    const parsed = accountInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

    const context = await dataContext();
    if (!context) return { ok: false, error: "Connect Supabase to create accounts." };

    const opening = parseOpeningBalance(parsed.data.openingBalance, parsed.data.currency);

    const { data, error } = await context.supabase
      .from("accounts")
      .insert({
        user_id: userId,
        name: parsed.data.name,
        institution: parsed.data.institution ?? null,
        type: parsed.data.type,
        currency: parsed.data.currency,
        opening_balance: opening.minor,
        icon: parsed.data.icon ?? null,
        color: parsed.data.color ?? null,
        include_in_net_worth: parsed.data.includeInNetWorth ?? true,
        sort_order: parsed.data.sortOrder ?? 0,
      })
      .select("id")
      .single();

    if (error) {
      // The unique index is on (user_id, lower(name)) where not deleted, so this is
      // the common collision and deserves a better message than the raw one.
      if (error.code === "23505" || /duplicate key/i.test(error.message)) {
        return { ok: false, error: `You already have an account called "${parsed.data.name}".` };
      }
      return { ok: false, error: error.message };
    }

    revalidateAccounts();
    return { ok: true, data: { id: (data as { id: string }).id } };
  } catch (error) {
    return failed(error);
  }
}

export interface UpdateAccountInput extends AccountInput {
  id: string;
}

/**
 * Edit an account.
 *
 * Currency is deliberately not updatable. Every transaction on the account is
 * denominated in it, so changing it would either be rejected by the
 * currency-matching trigger or, worse, silently reinterpret every stored amount:
 * 1,240,000 riel becoming $12,400. Someone who needs a different currency creates
 * a second account, which is how the banks model it anyway.
 */
export async function updateAccount(
  input: UpdateAccountInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireUserId();

    const id = uuidSchema.parse(input.id);
    const parsed = accountInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

    const context = await dataContext();
    if (!context) return { ok: false, error: "Connect Supabase to edit accounts." };

    const { data: existing } = await context.supabase
      .from("accounts")
      .select("currency")
      .eq("id", id)
      .maybeSingle();

    if (!existing) return { ok: false, error: "That account does not exist." };

    const storedCurrency = (existing as { currency: "USD" | "KHR" }).currency;
    if (storedCurrency !== parsed.data.currency) {
      return {
        ok: false,
        error:
          `${parsed.data.name} holds ${storedCurrency}, and an account's currency ` +
          `cannot change: every transaction on it is recorded in that currency. ` +
          `Create a separate ${parsed.data.currency} account instead.`,
      };
    }

    const opening = parseOpeningBalance(parsed.data.openingBalance, storedCurrency);

    const { error } = await context.supabase
      .from("accounts")
      .update({
        name: parsed.data.name,
        institution: parsed.data.institution ?? null,
        type: parsed.data.type,
        opening_balance: opening.minor,
        icon: parsed.data.icon ?? null,
        color: parsed.data.color ?? null,
        include_in_net_worth: parsed.data.includeInNetWorth ?? true,
        sort_order: parsed.data.sortOrder ?? 0,
      })
      .eq("id", id);

    if (error) return { ok: false, error: error.message };

    revalidateAccounts();
    return { ok: true, data: { id } };
  } catch (error) {
    return failed(error);
  }
}

/**
 * Close or reopen an account.
 *
 * Closing sets `is_active = false`, which the `account_balances` view turns into
 * `counts_toward_net_worth = false`. The account keeps its balance and its history;
 * it simply stops being offered for new entries and stops inflating the total.
 */
export async function setAccountActive(
  id: string,
  isActive: boolean,
): Promise<ActionResult<undefined>> {
  try {
    await requireUserId();
    const accountId = uuidSchema.parse(id);

    const context = await dataContext();
    if (!context) return { ok: false, error: "Connect Supabase to change accounts." };

    const { error } = await context.supabase
      .from("accounts")
      .update({ is_active: isActive })
      .eq("id", accountId);

    if (error) return { ok: false, error: error.message };

    revalidateAccounts();
    return { ok: true, data: undefined };
  } catch (error) {
    return failed(error);
  }
}

/**
 * Soft-delete an account, but only when nothing is recorded against it.
 *
 * `transactions.account_id` is `on delete restrict` in migration 0001, so the
 * database would refuse to lose an account that history points at. Checking first
 * turns that into an explanation and a suggestion instead of a foreign-key error.
 */
export async function deleteAccount(id: string): Promise<ActionResult<undefined>> {
  try {
    await requireUserId();
    const accountId = uuidSchema.parse(id);

    const context = await dataContext();
    if (!context) return { ok: false, error: "Connect Supabase to delete accounts." };

    const { count, error: countError } = await context.supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId)
      .is("deleted_at", null);

    if (countError) return { ok: false, error: countError.message };

    if ((count ?? 0) > 0) {
      return {
        ok: false,
        error:
          `That account has ${count} transaction${count === 1 ? "" : "s"} recorded ` +
          `against it, so deleting it would leave them orphaned. Close it instead: ` +
          `it keeps the history and stops counting toward your net worth.`,
      };
    }

    const { error } = await context.supabase
      .from("accounts")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", accountId);

    if (error) return { ok: false, error: error.message };

    revalidateAccounts();
    return { ok: true, data: undefined };
  } catch (error) {
    return failed(error);
  }
}

/**
 * Create the accounts a new user picks during onboarding, in one go.
 *
 * Inserted as a single statement so a partial set cannot result from one bad name:
 * someone setting up their accounts should get all of them or a clear error, not
 * three of five and no idea which failed.
 */
export async function createAccountsFromPresets(
  accounts: readonly AccountInput[],
): Promise<ActionResult<{ created: number }>> {
  try {
    const userId = await requireUserId();

    if (accounts.length === 0) {
      return { ok: false, error: "Pick at least one account to get started." };
    }

    const rows = [];
    for (const [index, account] of accounts.entries()) {
      const parsed = accountInputSchema.safeParse(account);
      if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

      const opening = parseOpeningBalance(parsed.data.openingBalance, parsed.data.currency);

      rows.push({
        user_id: userId,
        name: parsed.data.name,
        institution: parsed.data.institution ?? null,
        type: parsed.data.type,
        currency: parsed.data.currency,
        opening_balance: opening.minor,
        icon: parsed.data.icon ?? null,
        color: parsed.data.color ?? null,
        include_in_net_worth: true,
        sort_order: parsed.data.sortOrder ?? (index + 1) * 10,
      });
    }

    const context = await dataContext();
    if (!context) return { ok: false, error: "Connect Supabase to create accounts." };

    const { error } = await context.supabase.from("accounts").insert(rows);
    if (error) {
      if (/duplicate key/i.test(error.message)) {
        return {
          ok: false,
          error: "One of those names is already taken. Rename it and try again.",
        };
      }
      return { ok: false, error: error.message };
    }

    revalidateAccounts();
    return { ok: true, data: { created: rows.length } };
  } catch (error) {
    return failed(error);
  }
}

