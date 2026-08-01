#!/usr/bin/env node
/**
 * telegram-webhook - register, inspect and remove the bot's webhook.
 *
 * Telegram will not push updates anywhere until you tell it where to push them,
 * and it reports delivery failures only through getWebhookInfo. That makes
 * `status` the first thing to run whenever the bot goes quiet: it names the last
 * error and how many updates are stuck behind it.
 *
 * Usage:
 *   node telegram-webhook.mjs status
 *   node telegram-webhook.mjs set <https url>
 *   node telegram-webhook.mjs delete
 *
 * Reads TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET from the environment, or
 * from .env.local in the current directory. Never prints either.
 *
 * Exit codes:
 *   0  success
 *   1  the API refused, or the webhook is reporting delivery errors
 *   2  bad usage or missing configuration
 *
 * No dependencies. Requires Node 18+ for global fetch.
 */

import { existsSync, readFileSync } from "node:fs";

const API = "https://api.telegram.org";

/** Minimal dotenv reader, so this works before any install step. */
function loadEnvFile(path) {
  const values = {};
  if (!existsSync(path)) return values;

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

// Real environment wins, so CI can override the file.
const env = { ...loadEnvFile(".env.local"), ...process.env };

const token = env.TELEGRAM_BOT_TOKEN;
const secret = env.TELEGRAM_WEBHOOK_SECRET;

const styles = {
  ok: (s) => `\x1b[32m✓\x1b[0m ${s}`,
  bad: (s) => `\x1b[31m✗\x1b[0m ${s}`,
  warn: (s) => `\x1b[33m!\x1b[0m ${s}`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  head: (s) => `\n\x1b[1m${s}\x1b[0m`,
};

function usage(message) {
  if (message) console.log(styles.bad(message));
  console.log(
    [
      "",
      "Usage:",
      "  node telegram-webhook.mjs status",
      "  node telegram-webhook.mjs set <https url>",
      "  node telegram-webhook.mjs delete",
      "",
    ].join("\n"),
  );
  process.exit(2);
}

async function call(method, body) {
  const response = await fetch(`${API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // Telegram answers with JSON for every outcome; anything else is a proxy.
  }

  if (!payload || payload.ok !== true) {
    const detail = payload?.description ?? `HTTP ${response.status}`;
    throw new Error(detail);
  }
  return payload.result;
}

async function status() {
  console.log(styles.head("Bot"));
  const me = await call("getMe");
  console.log(styles.ok(`@${me.username} (${me.first_name})`));
  console.log(
    styles.dim(
      `  Put this in NEXT_PUBLIC_TELEGRAM_BOT_USERNAME so the connect link works: ${me.username}`,
    ),
  );

  console.log(styles.head("Webhook"));
  const info = await call("getWebhookInfo");

  if (!info.url) {
    console.log(styles.warn("No webhook registered, so the bot receives nothing."));
    console.log(styles.dim("  Run: node telegram-webhook.mjs set https://<your-domain>/api/telegram/webhook"));
    return 0;
  }

  console.log(styles.ok(`Delivering to ${info.url}`));

  // The secret is the endpoint's only authentication, so its absence is the
  // single most important thing this command can tell you.
  if (info.has_custom_certificate) console.log(styles.dim("  Using a custom certificate."));
  console.log(
    info.pending_update_count > 0
      ? styles.warn(`${info.pending_update_count} update(s) queued and undelivered`)
      : styles.ok("Nothing queued"),
  );

  let failed = false;

  if (info.last_error_message) {
    const when = info.last_error_date
      ? new Date(info.last_error_date * 1000).toISOString()
      : "unknown time";
    console.log(styles.bad(`Last delivery error at ${when}: ${info.last_error_message}`));

    // The failure mode this exists to catch.
    if (/redirect|302|307|301/i.test(info.last_error_message)) {
      console.log(
        styles.dim(
          "  A redirect means auth middleware is intercepting the route. Add the webhook\n" +
            "  path to the public/unauthenticated list and try again.",
        ),
      );
    }
    if (/401|403|unauthor/i.test(info.last_error_message)) {
      console.log(
        styles.dim(
          "  A 401 means the endpoint rejected the secret. Re-run `set` so Telegram and\n" +
            "  TELEGRAM_WEBHOOK_SECRET agree, and redeploy if the value changed.",
        ),
      );
    }
    failed = true;
  } else {
    console.log(styles.ok("No delivery errors reported"));
  }

  return failed ? 1 : 0;
}

async function set(url) {
  if (!url) usage("A webhook URL is required.");

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    usage(`"${url}" is not a URL.`);
  }

  // Telegram refuses plain HTTP outright, and localhost is unreachable from their
  // servers. Saying so here is faster than decoding their error.
  if (parsed.protocol !== "https:") {
    usage("Telegram only delivers to https. Use a tunnel for local development.");
  }
  if (/^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(parsed.hostname)) {
    usage(
      "Telegram cannot reach localhost. Expose it with a tunnel (cloudflared, ngrok) " +
        "and register the public URL.",
    );
  }
  if (!secret) {
    usage(
      "TELEGRAM_WEBHOOK_SECRET is not set. Registering without it would leave the " +
        "endpoint open to anyone who learns the URL.",
    );
  }

  console.log(styles.head("Registering"));
  await call("setWebhook", {
    url,
    secret_token: secret,
    // Only the update type this bot acts on. Fewer deliveries, less to ignore.
    allowed_updates: ["message"],
    // Old queued updates are almost always noise from a previous deployment, and
    // replaying them would post stale transactions into the ledger.
    drop_pending_updates: true,
  });

  console.log(styles.ok(`Telegram will POST updates to ${url}`));
  console.log(styles.dim("  Secret sent as X-Telegram-Bot-Api-Secret-Token on every delivery."));
  console.log(styles.dim("  Pending updates dropped, so nothing stale replays."));

  return await status();
}

async function remove() {
  await call("deleteWebhook", { drop_pending_updates: true });
  console.log(styles.ok("Webhook removed. The bot now receives nothing."));
  return 0;
}

async function main() {
  const [command, argument] = process.argv.slice(2);

  if (!command || ["-h", "--help", "help"].includes(command)) usage();
  if (!token) {
    usage("TELEGRAM_BOT_TOKEN is not set. Get one from @BotFather with /newbot.");
  }

  try {
    if (command === "status") return await status();
    if (command === "set") return await set(argument);
    if (command === "delete") return await remove();
    usage(`Unknown command "${command}".`);
  } catch (error) {
    console.log(styles.bad(`Telegram refused: ${error.message}`));
    if (/unauthorized/i.test(error.message)) {
      console.log(styles.dim("  That usually means TELEGRAM_BOT_TOKEN is wrong or revoked."));
    }
    return 1;
  }
}

process.exit(await main());
