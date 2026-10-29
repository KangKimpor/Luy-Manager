import type { SupabaseClient } from "@supabase/supabase-js";

const verified = new WeakMap<SupabaseClient, Promise<void>>();
const verifiedUrls = new Map<string, Promise<void>>();

function clientUrl(client: SupabaseClient): string | null {
  const url = (client as { supabaseUrl?: unknown }).supabaseUrl;
  return typeof url === "string" && url.length > 0 ? url : null;
}

/**
 * Reset the cross-request URL cache in tests.
 */
export function resetLedgerPrecisionCache(): void {
  verifiedUrls.clear();
}

/** Never interpret an old whole-riel database as a hundredths-of-riel ledger. */
export function assertLedgerPrecision(client: SupabaseClient): Promise<void> {
  const url = clientUrl(client);
  if (url) {
    const existingUrlCheck = verifiedUrls.get(url);
    if (existingUrlCheck) return existingUrlCheck;
  }

  const existing = verified.get(client);
  if (existing) return existing;

  const checking = (async () => {
    const { data, error } = await client.rpc("ledger_precision_version");
    if (error || data !== 2) {
      throw new Error(
        "Exact riel support requires database migration 0014. Nothing was saved. Contact the app owner.",
      );
    }
  })().catch((error) => {
    verified.delete(client);
    if (url) verifiedUrls.delete(url);
    throw error;
  });

  verified.set(client, checking);
  if (url) verifiedUrls.set(url, checking);
  return checking;
}
