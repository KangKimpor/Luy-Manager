"use server";

import { revalidatePath } from "next/cache";

import { requireUserId } from "@/lib/auth";
import { dataContext } from "@/lib/data/client";
import { getProfile } from "@/lib/data/reference";
import { buildTransaction } from "@/lib/domain/transactions";
import { planTransfer, transferInserts } from "@/lib/domain/transfers";
import type { AccountBalance } from "@/lib/domain/types";
import {
  absolute,
  type CurrencyCode,
  isZero,
  mixedTotal,
  money,
  type Money,
  splitByWeights,
  subtract,
  sum,
} from "@/lib/money";
import { loadUsdKhrRate } from "@/lib/rates/repository";
import {
  firstIssue,
  parseMoney,
  transactionInputSchema,
  transferInputSchema,
  uuidSchema,
} from "@/lib/validation";

/**
 * Writing transactions and transfers.
 *
 * Everything the quick-add and transfer forms used to only *build* now actually
 * lands. Three things every action here does, in order:
 *
 *   1. Establish who is calling. A server action is reachable by direct POST, so
 *      the UI having shown a form proves nothing.
 *   2. Re-read the account from the database rather than trusting the currency the
 *      client sent. An account is single-currency and the
 *      `transactions_currency_matches_account` trigger will reject a mismatch, so
 *      the currency has to come from the row, not the request.
 *   3. Revalidate the pages whose figures just changed.
 */

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function failed(error: unknown): ActionResult<never> {
  return {
    ok: false,
    error: error instanceof Error ? error.message : "Something went wrong.",
  };
}

/** Every page whose numbers depend on the ledger. */
function revalidateLedger(): void {
  revalidatePath("/");
  revalidatePath("/accounts");
  revalidatePath("/transactions");
  revalidatePath("/budgets");
  revalidatePath("/reports");
}

/** The currency the user's own reports are denominated in. */
async function baseCurrencyFor(): Promise<CurrencyCode> {
  return (await getProfile())?.baseCurrency ?? "USD";
}

/**
 * Look an account up as the signed-in user.
 *
 * Row Level Security means a missing row and someone else's row are
 * indistinguishable here, which is the correct amount of information to leak.
 */
async function loadAccount(accountId: string): Promise<AccountBalance> {
  const { listAccountBalances } = await import("@/lib/data/accounts");
  const account = (await listAccountBalances()).find((a) => a.accountId === accountId);

  if (!account) throw new Error("That account does not exist.");
  if (!account.isActive) {
    throw new Error(`${account.name} is closed. Reopen it before adding to it.`);
  }
  return account;
}

export interface CreateTransactionInput {
  accountId: string;
  type: "expense" | "income" | "refund" | "adjustment";
  amount: string;
  currency: CurrencyCode;
  categoryId?: string | null;
  merchantId?: string | null;
  occurredAt?: string;
  notes?: string | null;
  location?: string | null;
  /** Denominations actually handed over, for a payment settled in two currencies. */
  tenders?: Array<{ amount: string; currency: CurrencyCode }>;
  /** Category split. Weights are the split amounts as entered. */
  splits?: Array<{ categoryId: string | null; amount: string; notes?: string | null }>;
}

/**
 * Record an expense, income, refund or adjustment.
 *
 * When `tenders` are supplied the transaction amount is *derived* from them rather
 * than taken from `amount`. PRD Section 7's example is one purchase paid with $3
 * and 20,000៛: asking the user for the total as well would mean two figures that
 * can disagree, and reconciling them after rounding is a bug waiting to happen.
 * Deriving it means the total always equals what was handed over.
 */
export async function createTransaction(
  input: CreateTransactionInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const userId = await requireUserId();

    const parsed = transactionInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

    const context = await dataContext();
    if (!context) return { ok: false, error: "Connect Supabase to save transactions." };

    const account = await loadAccount(parsed.data.accountId);
    const [baseCurrency, { rate }] = await Promise.all([
      baseCurrencyFor(),
      loadUsdKhrRate(),
    ]);

    // Derived from the tenders when present, so the stored total is exactly the
    // sum of what was handed over, converted into the account's currency.
    let amount: Money;
    if (parsed.data.tenders && parsed.data.tenders.length > 0) {
      const tenders = parsed.data.tenders.map((t) => parseMoney(t.amount, t.currency));
      if (tenders.some(isZero)) {
        return { ok: false, error: "Every tender needs an amount." };
      }
      amount = mixedTotal({ tenders }, account.currency, rate);
    } else {
      amount = parseMoney(parsed.data.amount, account.currency);
    }

    if (isZero(amount)) return { ok: false, error: "Enter an amount above zero." };

    const row = buildTransaction(
      {
        accountId: account.accountId,
        type: parsed.data.type,
        amount,
        categoryId: parsed.data.categoryId ?? null,
        merchantId: parsed.data.merchantId ?? null,
        occurredAt: parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : undefined,
        notes: parsed.data.notes ?? null,
        location: parsed.data.location ?? null,
      },
      baseCurrency,
      rate,
    );

    const { data, error } = await context.supabase
      .from("transactions")
      // user_id is not part of TransactionInsert, because the domain layer has no
      // notion of a session. It is added here, from the verified user.
      .insert({ ...row, user_id: userId })
      .select("id")
      .single();

    if (error) return { ok: false, error: error.message };

    const transactionId = (data as { id: string }).id;

    // Tenders and splits are children of the row above, so they can only be
    // written once it has an id.
    if (parsed.data.tenders && parsed.data.tenders.length > 0) {
      const tenderRows = parsed.data.tenders.map((t) => {
        const tender = parseMoney(t.amount, t.currency);
        return {
          transaction_id: transactionId,
          // Left null on purpose. A tender naming an account would have to debit
          // it, and the account_balances view sums transactions only, so pointing
          // at an account here would show money leaving a balance that never
          // moved. These rows record the denominations, not a second debit.
          account_id: null,
          amount: signedLike(tender, row.amount).minor,
          currency: t.currency,
        };
      });

      const { error: tenderError } = await context.supabase
        .from("transaction_tenders")
        .insert(tenderRows);

      if (tenderError) {
        // The parent is already in. Removing it keeps the ledger consistent rather
        // than leaving a transaction whose breakdown silently failed to save.
        await context.supabase.from("transactions").delete().eq("id", transactionId);
        return { ok: false, error: `Could not save the payment breakdown: ${tenderError.message}` };
      }
    }

    if (parsed.data.splits && parsed.data.splits.length > 0) {
      const splitResult = await insertSplits(
        context.supabase,
        transactionId,
        money(row.amount, row.currency),
        parsed.data.splits,
      );
      if (!splitResult.ok) {
        await context.supabase.from("transactions").delete().eq("id", transactionId);
        return splitResult;
      }
    }

    revalidateLedger();
    return { ok: true, data: { id: transactionId } };
  } catch (error) {
    return failed(error);
  }
}

/** Give a magnitude the same sign as the parent row, so a split of an expense is negative too. */
function signedLike(amount: Money, parentMinor: number): Money {
  const magnitude = absolute(amount);
  return parentMinor < 0 ? money(-magnitude.minor, magnitude.currency) : magnitude;
}

/**
 * Write the category split, guaranteeing it sums to the parent exactly.
 *
 * The entered figures are treated as *weights* and redistributed with
 * `splitByWeights`, which is the money layer's largest-remainder split. Inserting
 * the typed numbers directly would let three $3.33 splits of a $10.00 charge save
 * as $9.99, and the missing cent would sit in the ledger unaccounted for.
 */
async function insertSplits(
  supabase: NonNullable<Awaited<ReturnType<typeof dataContext>>>["supabase"],
  transactionId: string,
  parentAmount: Money,
  splits: Array<{ categoryId: string | null; amount: string; notes?: string | null }>,
): Promise<ActionResult<undefined>> {
  const weights = splits.map((split) => {
    const parsed = parseMoney(split.amount, parentAmount.currency);
    return Math.abs(parsed.minor);
  });

  if (weights.some((weight) => weight <= 0)) {
    return { ok: false, error: "Every split needs an amount above zero." };
  }

  const parts = splitByWeights(absolute(parentAmount), weights);

  // Assert the invariant rather than trusting it. This is the one property splits
  // exist to preserve, and a silent failure here is money that vanishes.
  const total = sum(parts, parentAmount.currency);
  if (!isZero(subtract(total, absolute(parentAmount)))) {
    return { ok: false, error: "The split does not add up to the transaction amount." };
  }

  const rows = parts.map((part, index) => ({
    transaction_id: transactionId,
    category_id: splits[index].categoryId,
    amount: signedLike(part, parentAmount.minor).minor,
    currency: parentAmount.currency,
    notes: splits[index].notes ?? null,
  }));

  const { error } = await supabase.from("transaction_splits").insert(rows);
  if (error) return { ok: false, error: `Could not save the split: ${error.message}` };

  return { ok: true, data: undefined };
}

export interface UpdateTransactionInput extends CreateTransactionInput {
  id: string;
}

/**
 * Amend a transaction.
 *
 * Children are replaced wholesale rather than diffed: a split changing from three
 * parts to two is not expressible as an update, and the audit trigger records the
 * before and after either way.
 */
export async function updateTransaction(
  input: UpdateTransactionInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireUserId();

    const id = uuidSchema.parse(input.id);
    const parsed = transactionInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

    const context = await dataContext();
    if (!context) return { ok: false, error: "Connect Supabase to edit transactions." };

    const account = await loadAccount(parsed.data.accountId);
    const [baseCurrency, { rate }] = await Promise.all([
      baseCurrencyFor(),
      loadUsdKhrRate(),
    ]);

    const amount = parseMoney(parsed.data.amount, account.currency);
    if (isZero(amount)) return { ok: false, error: "Enter an amount above zero." };

    const row = buildTransaction(
      {
        accountId: account.accountId,
        type: parsed.data.type,
        amount,
        categoryId: parsed.data.categoryId ?? null,
        merchantId: parsed.data.merchantId ?? null,
        occurredAt: parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : undefined,
        notes: parsed.data.notes ?? null,
        location: parsed.data.location ?? null,
      },
      baseCurrency,
      rate,
    );

    const { error } = await context.supabase
      .from("transactions")
      .update(row)
      .eq("id", id)
      // A transfer leg cannot be edited as a plain transaction: its counterpart
      // would no longer balance, and migration 0004 would refuse the commit.
      .neq("type", "transfer");

    if (error) return { ok: false, error: error.message };

    revalidateLedger();
    return { ok: true, data: { id } };
  } catch (error) {
    return failed(error);
  }
}

/**
 * Soft-delete a transaction.
 *
 * `deleted_at` rather than a real delete: the balance view already excludes
 * deleted rows, and a mis-tap that permanently destroys a record is a worse
 * outcome than a row that lingers. Deleting one leg of a transfer takes both,
 * because migration 0004 refuses a half-deleted pair (correctly, since one leg
 * alone would debit an account and credit nothing).
 */
export async function deleteTransaction(id: string): Promise<ActionResult<undefined>> {
  try {
    await requireUserId();
    const transactionId = uuidSchema.parse(id);

    const context = await dataContext();
    if (!context) return { ok: false, error: "Connect Supabase to delete transactions." };

    const { data: existing, error: readError } = await context.supabase
      .from("transactions")
      .select("id, transfer_group_id")
      .eq("id", transactionId)
      .maybeSingle();

    if (readError) return { ok: false, error: readError.message };
    if (!existing) return { ok: false, error: "That transaction no longer exists." };

    const groupId = (existing as { transfer_group_id: string | null }).transfer_group_id;
    const deletedAt = new Date().toISOString();

    const query = context.supabase.from("transactions").update({ deleted_at: deletedAt });

    // One statement either way, so both legs of a transfer are marked together and
    // the deferred balance check sees a consistent group at commit.
    const { error } = groupId
      ? await query.eq("transfer_group_id", groupId)
      : await query.eq("id", transactionId);

    if (error) return { ok: false, error: error.message };

    revalidateLedger();
    return { ok: true, data: undefined };
  } catch (error) {
    return failed(error);
  }
}

/** Undo a soft delete. Restores both legs when the row is part of a transfer. */
export async function restoreTransaction(id: string): Promise<ActionResult<undefined>> {
  try {
    await requireUserId();
    const transactionId = uuidSchema.parse(id);

    const context = await dataContext();
    if (!context) return { ok: false, error: "Connect Supabase to restore transactions." };

    const { data: existing } = await context.supabase
      .from("transactions")
      .select("id, transfer_group_id")
      .eq("id", transactionId)
      .maybeSingle();

    if (!existing) return { ok: false, error: "That transaction no longer exists." };

    const groupId = (existing as { transfer_group_id: string | null }).transfer_group_id;
    const query = context.supabase.from("transactions").update({ deleted_at: null });

    const { error } = groupId
      ? await query.eq("transfer_group_id", groupId)
      : await query.eq("id", transactionId);

    if (error) return { ok: false, error: error.message };

    revalidateLedger();
    return { ok: true, data: undefined };
  } catch (error) {
    return failed(error);
  }
}

export interface CreateTransferInput {
  fromAccountId: string;
  toAccountId: string;
  amount: string;
  receivedAmount?: string;
  occurredAt?: string;
  notes?: string | null;
}

/**
 * Move money between two accounts, converting when they differ in currency.
 *
 * Both rows go in a single `insert`, which is the point: PostgREST wraps one
 * request in one transaction, and migration 0004 defers its two-legs check to
 * COMMIT precisely so the pair lands together. Two separate inserts would fail the
 * first one outright.
 */
export async function createTransfer(
  input: CreateTransferInput,
): Promise<ActionResult<{ transferGroupId: string }>> {
  try {
    const userId = await requireUserId();

    const parsed = transferInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

    const context = await dataContext();
    if (!context) return { ok: false, error: "Connect Supabase to save transfers." };

    const [from, to] = await Promise.all([
      loadAccount(parsed.data.fromAccountId),
      loadAccount(parsed.data.toAccountId),
    ]);

    const [baseCurrency, { rate }] = await Promise.all([
      baseCurrencyFor(),
      loadUsdKhrRate(),
    ]);

    const amount = parseMoney(parsed.data.amount, from.currency);
    const received =
      parsed.data.receivedAmount && parsed.data.receivedAmount.trim() !== ""
        ? parseMoney(parsed.data.receivedAmount, to.currency)
        : undefined;

    // planTransfer enforces the invariants the database would otherwise reject:
    // two different accounts, a non-zero amount, and each leg in its own currency.
    const plan = planTransfer(
      {
        from,
        to,
        amount,
        receivedAmount: received,
        occurredAt: parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : undefined,
        notes: parsed.data.notes ?? null,
      },
      rate,
    );

    const transferGroupId = crypto.randomUUID();
    const [out, incoming] = transferInserts(plan, transferGroupId, baseCurrency, rate);

    const { error } = await context.supabase
      .from("transactions")
      .insert([
        { ...out, user_id: userId },
        { ...incoming, user_id: userId },
      ]);

    if (error) return { ok: false, error: error.message };

    revalidateLedger();
    return { ok: true, data: { transferGroupId } };
  } catch (error) {
    return failed(error);
  }
}
