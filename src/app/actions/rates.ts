"use server";

import { revalidatePath } from "next/cache";

import { requireUserId } from "@/lib/auth";
import { dataContext } from "@/lib/data/client";
import { PLAUSIBLE_USD_KHR } from "@/lib/rates/provider";
import { firstIssue, isoDateSchema, manualRateInputSchema } from "@/lib/validation";

import type { ActionResult } from "./transactions";

/**
 * Recording your own exchange rate.
 *
 * `references/currency-data.md` makes the case plainly: for a personal-finance
 * product, manual entry is often the *most* accurate source, because the rate that
 * matters is the one the user's own bank or money changer actually applied — not
 * the published mid-market figure.
 *
 * The schema has supported this since migration 0001: a row in `exchange_rates`
 * with a non-null `user_id` is a personal override, and `loadUsdKhrRate` already
 * prefers it over the published rate for the same day. All that was missing was a
 * way to write one.
 */

function failed(error: unknown): ActionResult<never> {
  return {
    ok: false,
    error: error instanceof Error ? error.message : "Something went wrong.",
  };
}

function revalidateRates(): void {
  revalidatePath("/");
  revalidatePath("/accounts");
  revalidatePath("/settings");
  revalidatePath("/add");
}

export interface ManualRateInput {
  /** KHR per 1 USD, as typed. */
  rate: string;
  /** YYYY-MM-DD the rate applies from. */
  asOf: string;
}

export async function setManualRate(
  input: ManualRateInput,
): Promise<ActionResult<{ rate: number; asOf: string }>> {
  try {
    // Called for the check, not the value: the RPC derives the owner from
    // auth.uid() itself. Failing fast here gives a clear message instead of a
    // database-level privilege error.
    await requireUserId();

    const parsed = manualRateInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

    // Strip separators a person would type into a rate: "4,100" is one number.
    const rate = Number(parsed.data.rate.replace(/[\s,]/g, ""));

    if (!Number.isFinite(rate) || rate <= 0) {
      return { ok: false, error: "A rate has to be a positive number." };
    }

    // The same plausibility band the automatic fetch uses. A typo of 410000 or 41
    // would silently rescale every converted balance the user looks at, and a
    // wrong rate they entered themselves is no less damaging than a wrong one from
    // a provider.
    if (rate < PLAUSIBLE_USD_KHR.min || rate > PLAUSIBLE_USD_KHR.max) {
      return {
        ok: false,
        error:
          `${rate.toLocaleString("en-US")} riel per dollar is outside the plausible ` +
          `${PLAUSIBLE_USD_KHR.min.toLocaleString("en-US")}–` +
          `${PLAUSIBLE_USD_KHR.max.toLocaleString("en-US")} range. Check the digits.`,
      };
    }

    const context = await dataContext();
    if (!context) return { ok: false, error: "Connect Supabase to save your own rate." };

    // Written through an RPC, not `.upsert()`. `exchange_rates_user_key` is a
    // partial unique index (`where user_id is not null`) and Postgres will not
    // infer a partial index as an ON CONFLICT target unless the statement repeats
    // the predicate — which PostgREST's column-list `on_conflict` cannot express.
    // It fails with 42P10 even though every row sent satisfies the predicate.
    // Same trap as the global writer in migration 0005; see 0008.
    //
    // The function takes no user id: it derives the owner from auth.uid(), so
    // there is nothing here that could write another user's override.
    const { error } = await context.supabase.rpc("upsert_user_exchange_rate", {
      p_base: "USD",
      p_quote: "KHR",
      p_rate: rate,
      p_as_of: parsed.data.asOf,
    });

    if (error) return { ok: false, error: error.message };

    revalidateRates();
    return { ok: true, data: { rate, asOf: parsed.data.asOf } };
  } catch (error) {
    return failed(error);
  }
}

/** Drop a personal override, falling back to the published rate for that day. */
export async function clearManualRate(asOf: string): Promise<ActionResult<undefined>> {
  try {
    const userId = await requireUserId();
    const date = isoDateSchema.parse(asOf);

    const context = await dataContext();
    if (!context) return { ok: false, error: "Connect Supabase to change rates." };

    const { error } = await context.supabase
      .from("exchange_rates")
      .delete()
      .match({
        user_id: userId,
        base_currency: "USD",
        quote_currency: "KHR",
        as_of: date,
      });

    if (error) return { ok: false, error: error.message };

    revalidateRates();
    return { ok: true, data: undefined };
  } catch (error) {
    return failed(error);
  }
}
