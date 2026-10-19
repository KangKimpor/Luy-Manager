import { after } from "next/server";
import { isServiceRoleConfigured } from "@/lib/supabase/env";
import { isTelegramConfigured } from "./env";

export function queueTelegramTransactionNotification(userId: string, text: string): void {
  if (!isTelegramConfigured() || !isServiceRoleConfigured()) return;
  try {
    after(async () => {
      const { notifyTelegramTransaction } = await import("./report-sync");
      await notifyTelegramTransaction(userId, text);
    });
  } catch {
    console.error("[telegram] Could not schedule the transaction notification.");
  }
}

/** Load the bot and contact Telegram only after the web mutation has returned. */
export function queueTelegramReportRefresh(userId: string): void {
  if (!isTelegramConfigured() || !isServiceRoleConfigured()) return;
  try {
    after(async () => {
      const { refreshTelegramReports } = await import("./report-sync");
      await refreshTelegramReports(userId);
    });
  } catch {
    console.error("[telegram] Could not schedule the report refresh.");
  }
}
