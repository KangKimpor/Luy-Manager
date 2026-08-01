/**
 * Shared plumbing for the data-access layer.
 *
 * One decision worth stating up front: a failed query throws rather than
 * returning an empty list. For most apps swallowing the error and rendering an
 * empty state is kinder, but here an empty list of accounts renders as a net
 * worth of $0.00, which is not "we could not load this": it is a specific,
 * wrong, and alarming financial claim. Failing loudly and letting the error
 * boundary say so is the honest option.
 *
 * The demo-data fallback is different, and deliberate: with no Supabase project
 * configured the app is knowingly running on sample data, which is what lets a
 * fresh clone run `npm run dev` with no setup.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Row } from "./mappers";

import { getUser, isDemoMode } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export class DataError extends Error {
  constructor(
    readonly operation: string,
    cause?: unknown,
  ) {
    super(
      `Could not ${operation}. ${
        cause instanceof Error ? cause.message : cause ? String(cause) : ""
      }`.trim(),
    );
    this.name = "DataError";
  }
}

export interface DataContext {
  supabase: SupabaseClient;
  userId: string;
}

/**
 * Treat a PostgREST payload as untyped rows.
 *
 * Without generated `Database` types, supabase-js cannot relate a string column
 * list to a row shape and infers a union that includes its own error type. Rather
 * than scatter casts through every query, the cast happens here and once, and it
 * is safe precisely because nothing downstream trusts it: every field is checked
 * by the mappers in ./mappers.ts, which is the actual type boundary.
 *
 * Running `supabase gen types typescript` against a real project would remove the
 * need for this; that needs a live project, so it is deferred rather than faked.
 */
export function asRows(data: unknown): Row[] {
  return (data ?? []) as Row[];
}

export function asRow(data: unknown): Row | null {
  return (data ?? null) as Row | null;
}

export type { Row };

/**
 * A client plus the signed-in user's id, or null when there is nothing to query.
 *
 * Returns null in exactly two situations (demo mode, and no session), so callers
 * can substitute demo data or an empty result without each of them re-deriving
 * which case they are in. Row Level Security would scope the query anyway; the
 * user id is returned because inserts have to state an owner explicitly.
 */
export async function dataContext(): Promise<DataContext | null> {
  if (isDemoMode()) return null;

  const user = await getUser();
  if (!user) return null;

  return { supabase: await createClient(), userId: user.id };
}

/** Column lists, kept beside the mappers that consume them so the two stay in step. */
export const ACCOUNT_BALANCE_COLUMNS =
  "account_id, user_id, name, institution, type, currency, icon, color, is_active, " +
  "include_in_net_worth, sort_order, counts_toward_net_worth, current_balance, " +
  "transaction_count, last_activity_at";

export const ACCOUNT_COLUMNS =
  "id, user_id, name, institution, type, currency, opening_balance, icon, color, " +
  "is_active, include_in_net_worth, sort_order";

export const TRANSACTION_COLUMNS =
  "id, user_id, account_id, category_id, merchant_id, type, amount, currency, " +
  "exchange_rate, base_amount, base_currency, occurred_at, notes, location, " +
  "transfer_group_id, created_via, is_pending";

export const CATEGORY_COLUMNS =
  "id, user_id, parent_id, name, icon, color, applies_to, is_system, sort_order";

export const BUDGET_COLUMNS =
  "id, user_id, category_id, name, amount, currency, period, starts_on, ends_on, " +
  "rollover, alert_threshold, is_active";

export const TENDER_COLUMNS =
  "id, transaction_id, account_id, amount, currency, exchange_rate";

export const SPLIT_COLUMNS =
  "id, transaction_id, category_id, amount, currency, notes";

export const SETTINGS_COLUMNS =
  "user_id, default_account_id, week_starts_on, notify_budget_threshold, " +
  "notify_large_transaction, notify_rate_moved, large_transaction_amount, " +
  "large_transaction_currency, rate_move_threshold";
