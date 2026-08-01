import { isFromTelegram } from "@/lib/telegram/client";
import { isTelegramConfigured, requireTelegramEnv } from "@/lib/telegram/env";
import { handleUpdate } from "@/lib/telegram/handle";
import { isServiceRoleConfigured, isSupabaseConfigured } from "@/lib/supabase/env";

/**
 * Telegram webhook, PRD Section 9.
 *
 * Telegram POSTs every message here. Three things make this endpoint different from
 * the rest of the app and shape everything below:
 *
 *   1. **There is no session.** The caller is Telegram, not a browser, so there is
 *      no cookie and `auth.uid()` is null. Row Level Security therefore protects
 *      nothing here, and the handler compensates by filtering every query on a
 *      user id resolved from `profiles.telegram_chat_id`.
 *
 *   2. **The only authentication is a header.** Telegram echoes the secret given to
 *      setWebhook as `X-Telegram-Bot-Api-Secret-Token`. Anyone who learns this URL
 *      and gets past that header can write into somebody's ledger, so it is checked
 *      before the body is even read.
 *
 *   3. **A non-2xx response causes a retry.** Telegram redelivers anything it
 *      considers failed, so throwing after a successful insert would record the
 *      same transaction twice. This route answers 200 for every message it accepts,
 *      including ones it could not act on, and reports problems in the reply and in
 *      `telegram_logs` rather than in the status code.
 *
 * Not cached. Route handlers are uncached by default in this version of Next.js and
 * this one reads headers, which pins it to request time regardless.
 */

/** Telegram sends nothing but POST. A GET here is a human checking the URL. */
export async function GET(): Promise<Response> {
  return Response.json(
    {
      ok: true,
      endpoint: "telegram-webhook",
      configured: isTelegramConfigured(),
      hint: "Telegram delivers updates by POST with the X-Telegram-Bot-Api-Secret-Token header.",
    },
    { status: 200 },
  );
}

export async function POST(request: Request): Promise<Response> {
  if (!isTelegramConfigured()) {
    // 503, not 401: the endpoint exists but the bot was never configured, and
    // saying so plainly is what an operator needs. No secret is involved yet.
    return Response.json(
      {
        ok: false,
        error:
          "Telegram is not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET.",
      },
      { status: 503 },
    );
  }

  const { webhookSecret } = requireTelegramEnv();

  if (!isFromTelegram(request, webhookSecret)) {
    // Deliberately terse. Naming what was wrong with the credential helps an
    // attacker more than an operator, who has the logs.
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  // Checked after authentication so an unauthenticated caller cannot probe which
  // parts of the deployment are wired up.
  if (!isSupabaseConfigured() || !isServiceRoleConfigured()) {
    return Response.json(
      {
        ok: false,
        error:
          "The bot needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and " +
          "SUPABASE_SERVICE_ROLE_KEY. It writes without a user session, so Row Level " +
          "Security cannot resolve the author and the service role key is required.",
      },
      { status: 503 },
    );
  }

  let update: unknown;
  try {
    update = await request.json();
  } catch {
    // Malformed JSON is not worth a retry, so it still gets a 200.
    return Response.json({ ok: true, ignored: "unparseable body" }, { status: 200 });
  }

  try {
    await handleUpdate(update);
  } catch (error) {
    // handleUpdate is written not to throw. If it does anyway, swallowing it here
    // is still correct: a retry would re-run a handler that may already have
    // written to the ledger.
    console.error("[telegram] handler threw", error);
  }

  return Response.json({ ok: true }, { status: 200 });
}
