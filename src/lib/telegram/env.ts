/**
 * Telegram environment access.
 *
 * Mirrors src/lib/supabase/env.ts: read through one module so a missing variable
 * fails with a message naming it, rather than surfacing as a 401 from Telegram or
 * a webhook that silently accepts anything.
 */

export interface TelegramEnv {
  botToken: string;
  webhookSecret: string;
}

export class MissingTelegramEnvError extends Error {
  constructor(missing: readonly string[]) {
    super(
      `Missing Telegram environment variable(s): ${missing.join(", ")}. ` +
        `See the Telegram section of .env.example.`,
    );
    this.name = "MissingTelegramEnvError";
  }
}

/** Whether the bot is configured at all. The rest of the app works without it. */
export function isTelegramConfigured(): boolean {
  return (
    Boolean(process.env.TELEGRAM_BOT_TOKEN) && Boolean(process.env.TELEGRAM_WEBHOOK_SECRET)
  );
}

export function requireTelegramEnv(): TelegramEnv {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

  const missing: string[] = [];
  if (!botToken) missing.push("TELEGRAM_BOT_TOKEN");
  if (!webhookSecret) missing.push("TELEGRAM_WEBHOOK_SECRET");
  if (missing.length > 0) throw new MissingTelegramEnvError(missing);

  return { botToken: botToken as string, webhookSecret: webhookSecret as string };
}

/**
 * The bot's @username, used only to build the "Connect Telegram" deep link.
 *
 * Public by nature, so it is NEXT_PUBLIC_. Optional: without it the settings page
 * shows the connect step as unavailable rather than rendering a link to nowhere.
 */
export function botUsername(): string | null {
  const raw = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
  if (!raw) return null;
  return raw.replace(/^@/, "");
}
