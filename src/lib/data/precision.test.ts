import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, test, vi } from "vitest";
import { assertLedgerPrecision } from "./precision";

test("refuses an unconverted database, retries after migration, and coalesces successful checks", async () => {
  const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST202" } });
  const client = { rpc } as unknown as SupabaseClient;
  await expect(assertLedgerPrecision(client)).rejects.toThrow("migration 0014");
  rpc.mockResolvedValue({ data: 2, error: null });
  await Promise.all([assertLedgerPrecision(client), assertLedgerPrecision(client)]);
  expect(rpc).toHaveBeenCalledTimes(2);
  expect(rpc).toHaveBeenLastCalledWith("ledger_precision_version");
});
