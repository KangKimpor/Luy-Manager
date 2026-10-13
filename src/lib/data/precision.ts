import type { SupabaseClient } from "@supabase/supabase-js";

const verified = new WeakMap<SupabaseClient, Promise<void>>();

/** Never interpret an old whole-riel database as a hundredths-of-riel ledger. */
export function assertLedgerPrecision(client: SupabaseClient): Promise<void> {
  const existing = verified.get(client);
  if (existing) return existing;
  const checking = (async () => {
    const { data, error } = await client.rpc("ledger_precision_version");
    if (error || data !== 2) throw new Error("Exact riel support requires database migration 0014. Nothing was saved. Contact the app owner.");
  })().catch(error => { verified.delete(client); throw error; });
  verified.set(client, checking);
  return checking;
}
