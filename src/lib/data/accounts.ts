/**
 * Reading accounts and their derived balances.
 *
 * Balances come from the `account_balances` view rather than being computed here,
 * so the figure on screen is the one the database derives from the ledger and
 * cannot drift from it.
 */

import { cache } from "react";

import type { Account, AccountBalance } from "@/lib/domain/types";
import { DEMO_ACCOUNTS } from "@/lib/demo-data";

import {
  ACCOUNT_BALANCE_COLUMNS,
  ACCOUNT_COLUMNS,
  asRow,
  asRows,
  DataError,
  dataContext,
} from "./client";
import { mapRows, toAccount, toAccountBalance } from "./mappers";

/**
 * Every account with its current balance, closed ones included.
 *
 * Closed accounts are returned rather than filtered because they still hold money
 * the user needs to see; `countsTowardNetWorth` is what keeps them out of totals.
 * Ordered by the user's own `sort_order` first so the list matches whatever
 * arrangement they chose, with name as a stable tie-break.
 */
export const listAccountBalances = cache(async (): Promise<AccountBalance[]> => {
  const context = await dataContext();
  if (!context) return DEMO_ACCOUNTS;

  const { data, error } = await context.supabase
    .from("account_balances")
    .select(ACCOUNT_BALANCE_COLUMNS)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw new DataError("load your accounts", error);

  return mapRows(asRows(data), toAccountBalance, "account_balances");
});

/** Only the accounts a new entry should offer: the ones still in use. */
export const listActiveAccountBalances = cache(async (): Promise<AccountBalance[]> => {
  return (await listAccountBalances()).filter((account) => account.isActive);
});

/** A single account for editing, or null when it does not exist for this user. */
export async function getAccount(id: string): Promise<Account | null> {
  const context = await dataContext();
  if (!context) return null;

  const { data, error } = await context.supabase
    .from("accounts")
    .select(ACCOUNT_COLUMNS)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new DataError("load that account", error);
  const row = asRow(data);
  if (!row) return null;

  return toAccount(row);
}

/** A lookup keyed by account id, for rendering transaction rows. */
export async function accountLookup(): Promise<Record<string, AccountBalance>> {
  const accounts = await listAccountBalances();
  return Object.fromEntries(accounts.map((account) => [account.accountId, account]));
}
