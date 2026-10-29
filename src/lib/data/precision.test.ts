import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, test, vi } from "vitest";
import { assertLedgerPrecision, resetLedgerPrecisionCache } from "./precision";

test("refuses an unconverted database, retries after migration, and coalesces successful checks", async () => {
  resetLedgerPrecisionCache();
  const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST202" } });
  const client = { rpc } as unknown as SupabaseClient;
  await expect(assertLedgerPrecision(client)).rejects.toThrow("migration 0014");
  rpc.mockResolvedValue({ data: 2, error: null });
  await Promise.all([assertLedgerPrecision(client), assertLedgerPrecision(client)]);
  expect(rpc).toHaveBeenCalledTimes(2);
  expect(rpc).toHaveBeenLastCalledWith("ledger_precision_version");
});

test("reuses a verified precision check across fresh clients targeting the same Supabase URL", async () => {
  resetLedgerPrecisionCache();
  const rpcFirst = vi.fn().mockResolvedValue({ data: 2, error: null });
  const rpcSecond = vi.fn().mockResolvedValue({ data: 2, error: null });
  const firstClient = { supabaseUrl: "https://project.supabase.co", rpc: rpcFirst } as unknown as SupabaseClient;
  const secondClient = { supabaseUrl: "https://project.supabase.co", rpc: rpcSecond } as unknown as SupabaseClient;

  await assertLedgerPrecision(firstClient);
  await assertLedgerPrecision(secondClient);

  expect(rpcFirst).toHaveBeenCalledOnce();
  expect(rpcSecond).not.toHaveBeenCalled();
  resetLedgerPrecisionCache();
});
