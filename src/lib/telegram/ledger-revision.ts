import type { createAdminClient } from "@/lib/supabase/admin";

/** Deleted rows still change the ledger and must invalidate in-flight reports. */
export async function readLedgerRevision(admin: ReturnType<typeof createAdminClient>, userId: string): Promise<string> {
  const { data, error } = await admin.from("transactions").select("updated_at")
    .eq("user_id", userId).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error("Could not check the ledger revision.");
  return (data as { updated_at: string } | null)?.updated_at ?? "";
}
