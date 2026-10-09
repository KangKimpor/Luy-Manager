import { requireTelegramEnv } from "./env";

export interface TelegramStatus {
  username: string;
  webhookMatches: boolean;
  webhookRegistered: boolean;
  pendingUpdates: number;
  deliveryError: string | null;
}

function safeDeliveryError(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  if (/307|302|301|redirect/i.test(value)) return "The webhook redirects to another page. Check its public route.";
  if (/401|403|unauthorized/i.test(value)) return "The webhook rejected Telegram. Check that its secret matches the deployed app.";
  if (/503/i.test(value)) return "The deployed app reports missing bot or database configuration.";
  if (/timeout|timed out/i.test(value)) return "Telegram could not reach the webhook in time.";
  if (/404/i.test(value)) return "The registered webhook route was not found.";
  return "Telegram reports a delivery error. Check the registered webhook and deployment logs.";
}

/** Credentials stay in the server request; the UI receives only safe diagnostics. */
export async function readTelegramStatus(expectedOrigin: string): Promise<TelegramStatus> {
  const { botToken } = requireTelegramEnv();
  async function call(method: "getMe" | "getWebhookInfo") {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
      cache: "no-store", signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error("Telegram did not accept the status request.");
    const payload = await response.json() as { ok?: boolean; result?: Record<string, unknown> };
    if (!payload.ok || !payload.result) throw new Error("Telegram status is unavailable.");
    return payload.result;
  }
  const [bot, webhook] = await Promise.all([call("getMe"), call("getWebhookInfo")]);
  let matches = false;
  const registered = typeof webhook.url === "string" && webhook.url.length > 0;
  if (registered) {
    try {
      const actual = new URL(webhook.url as string);
      matches = actual.origin === new URL(expectedOrigin).origin && actual.pathname === "/api/telegram/webhook";
    } catch { /* An invalid or different webhook is reported as a mismatch. */ }
  }
  return {
    username: typeof bot.username === "string" && /^[A-Za-z0-9_]+$/.test(bot.username) ? bot.username : "Unknown bot",
    webhookMatches: matches,
    webhookRegistered: registered,
    pendingUpdates: typeof webhook.pending_update_count === "number" && Number.isSafeInteger(webhook.pending_update_count)
      ? Math.max(0, webhook.pending_update_count) : 0,
    deliveryError: safeDeliveryError(webhook.last_error_message),
  };
}
