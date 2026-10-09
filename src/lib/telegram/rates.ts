import type { createAdminClient } from "@/lib/supabase/admin";
import { fallbackSnapshot, STALE_AFTER_DAYS, toExchangeRate, type RateSnapshot } from "@/lib/rates/repository";
import { cambodiaDate } from "@/lib/period";

/** The cookie-based reader cannot see a chat user's manual override. */
export async function loadBotRate(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  now = new Date(),
): Promise<RateSnapshot> {
  const query = () => admin.from("exchange_rates")
    .select("rate, base_currency, quote_currency, as_of, source, user_id")
    .eq("base_currency", "USD").eq("quote_currency", "KHR")
    .lte("as_of", cambodiaDate(now))
    .order("as_of", { ascending: false }).limit(1);
  const [global, own] = await Promise.all([
    query().is("user_id", null),
    query().eq("user_id", userId),
  ]);
  if (global.error || own.error) throw new Error("Could not load the exchange rate.");
  const globalRow = global.data?.[0];
  const ownRow = own.data?.[0];
  const chosen = ownRow && (!globalRow || ownRow.as_of >= globalRow.as_of) ? ownRow : globalRow;
  if (!chosen) return fallbackSnapshot();
  try {
    const rate = toExchangeRate(chosen);
    const ageDays = Math.max(0, Math.floor((now.getTime() - rate.asOf.getTime()) / 86_400_000));
    return { rate, ageDays, freshness: ageDays > STALE_AFTER_DAYS ? "stale" : "fresh", isUserOverride: chosen === ownRow };
  } catch {
    throw new Error("The saved exchange rate could not be read.");
  }
}
