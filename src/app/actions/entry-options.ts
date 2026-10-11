"use server";

import { requireUserId } from "@/lib/auth";
import { transactionDate, validTimezone } from "@/lib/calendar";
import { getProfile } from "@/lib/data/reference";
import type { ExchangeRate } from "@/lib/money";
import { loadUsdKhrRate } from "@/lib/rates/repository";
import type { ActionResult } from "./transactions";

/** A changed calendar date must update conversion previews before saving. */
export async function readEntryRate(date: string): Promise<ActionResult<ExchangeRate>> {
  try {
    await requireUserId();
    const profile = await getProfile();
    const timezone = validTimezone(profile?.timezone);
    const { rate } = await loadUsdKhrRate({ asOf: transactionDate(date, timezone), timezone });
    return { ok: true, data: rate };
  } catch (cause) { return { ok: false, error: cause instanceof Error ? cause.message : "Could not load the rate for this date." }; }
}
