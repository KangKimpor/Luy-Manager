import { createHash, timingSafeEqual } from "node:crypto";

import { requireTelegramEnv } from "./env";

/**
 * The outbound half of the bot: talking to the Telegram Bot API, and deciding
 * whether an inbound request is really from Telegram.
 */

const API_BASE = "https://api.telegram.org";

/**
 * The shape of an inbound update, narrowed to the parts this bot uses.
 *
 * Deliberately not the full Update type. Telegram's payload has dozens of optional
 * branches and modelling all of them would imply this handles all of them.
 */
export interface TelegramUpdate {
  update_id?: number;
  message?: {
    message_id?: number;
    text?: string;
    caption?: string;
    chat?: { id?: number; type?: string };
    from?: { id?: number; is_bot?: boolean; first_name?: string; username?: string };
  };
}

export interface InboundMessage {
  updateId: number;
  chatId: number;
  text: string;
  firstName: string | null;
  unsupportedAttachment: boolean;
}

export type ReplyKeyboard = readonly (readonly string[])[];

export const MAIN_KEYBOARD: ReplyKeyboard = [
  ["Expense", "Income", "Transfer"],
  ["Accounts", "Recent", "Budgets"],
  ["Summary today", "Summary month", "Rate"],
  ["Help"],
];

export const CONFIRM_KEYBOARD: ReplyKeyboard = [["Yes", "No"]];

/**
 * Pull the one message shape this bot acts on out of an update.
 *
 * Returns null for everything else: edited messages, channel posts, joins, stickers,
 * callback queries. Telegram resends an update it considers undelivered, so an
 * unrecognised update must still be answered with 200 and ignored, never retried
 * into an error loop.
 */
export function readMessage(update: unknown): InboundMessage | null {
  if (typeof update !== "object" || update === null) return null;

  const message = (update as TelegramUpdate).message;
  const updateId = (update as TelegramUpdate).update_id;
  const chatId = message?.chat?.id;
  const text = message?.text ?? message?.caption;

  if (!Number.isSafeInteger(updateId) || (updateId as number) < 0) return null;
  if (!Number.isSafeInteger(chatId) || (chatId as number) <= 0) return null;
  // A group cannot own one person's ledger: another member could issue writes
  // or see balances after that person links it. Only direct chats may connect.
  if (message?.chat?.type !== "private" || message?.from?.id !== chatId) return null;
  // A bot talking to a bot is a loop waiting to happen.
  if (message?.from?.is_bot === true) return null;
  if (typeof text === "string" && text.trim() === "") return null;

  return {
    updateId: updateId as number,
    chatId: chatId as number,
    text: typeof text === "string" ? text.slice(0, 4096) : "[Unsupported attachment]",
    firstName: message?.from?.first_name ?? null,
    unsupportedAttachment: typeof text !== "string",
  };
}

/**
 * Is this request really from Telegram?
 *
 * Telegram echoes the secret configured with setWebhook in a header on every
 * delivery. That is the only authentication the endpoint gets, and without checking
 * it anyone who learns the URL can post transactions into somebody's ledger.
 *
 * Hashed to a fixed width before comparing, because timingSafeEqual throws on a
 * length mismatch and that throw is itself an oracle for the secret's length. Same
 * approach as the rate refresh route.
 */
export function isFromTelegram(request: Request, expectedSecret: string): boolean {
  const presented = request.headers.get("x-telegram-bot-api-secret-token");
  if (!presented) return false;

  const a = createHash("sha256").update(presented).digest();
  const b = createHash("sha256").update(expectedSecret).digest();
  return timingSafeEqual(a, b);
}

/**
 * Send a reply.
 *
 * Failures are reported, not thrown. The webhook must still return 200 once the
 * ledger has been written: throwing here would make Telegram retry the delivery and
 * the message would be recorded a second time. A reply that did not arrive is a
 * far smaller problem than a duplicated transaction.
 */
export async function sendMessage(
  chatId: number,
  text: string,
  keyboard: ReplyKeyboard = MAIN_KEYBOARD,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { botToken } = requireTelegramEnv();
    const response = await fetch(`${API_BASE}/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        // HTML rather than Markdown: amounts contain characters like * and _ far
        // less often than Markdown parsing breaks on an underscore in a merchant
        // name, and a parse failure means the user gets nothing back.
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
        reply_markup: {
          keyboard: keyboard.map((row) => row.map((label) => ({ text: label }))),
          resize_keyboard: true,
          is_persistent: true,
          input_field_placeholder: "Spent $5 coffee from ABA",
        },
      }),
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) {
      return { ok: false, error: `Telegram returned ${response.status}` };
    }
    const payload = await response.json() as { ok?: boolean };
    return payload.ok === true ? { ok: true } : { ok: false, error: "Telegram refused the reply." };
  } catch {
    // Network errors can contain the full request URL, which contains the token.
    return { ok: false, error: "Could not deliver the Telegram reply." };
  }
}

/** Escape user-supplied text before it goes into an HTML-formatted reply. */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
