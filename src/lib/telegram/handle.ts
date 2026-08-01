import { asRows, TRANSACTION_COLUMNS } from "@/lib/data/client";
import { mapRows, toAccountBalance, toCategory, toTransaction } from "@/lib/data/mappers";
import { buildTransaction, summarizeCashFlow } from "@/lib/domain/transactions";
import { planTransfer, transferInserts } from "@/lib/domain/transfers";
import type { AccountBalance, Category } from "@/lib/domain/types";
// CurrencyCode comes from the money layer; domain/types imports it rather than
// re-exporting it.
import { formatMoney, money, type CurrencyCode, type Money } from "@/lib/money";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadUsdKhrRate } from "@/lib/rates/repository";

import { escapeHtml, readMessage, sendMessage } from "./client";
import { requireTelegramEnv } from "./env";
import { verifyLinkToken } from "./link";
import {
  needsConfirmation,
  parseMessage,
  type RecordIntent,
  type TelegramIntent,
  type TransferIntent,
} from "./parse";

/**
 * The bot's brain: an intent plus a chat id, turned into a ledger write and a reply.
 *
 * ## Every query here is written as if RLS did not exist, because it does not
 *
 * A webhook has no session. There is no cookie, no JWT, and therefore no
 * `auth.uid()`, so the policies that protect every other read in this app are
 * inert. This module uses the service role client, which bypasses Row Level
 * Security completely.
 *
 * That makes one rule absolute: **every single query must filter on `user_id`
 * explicitly.** A forgotten filter here does not fail closed and return nothing,
 * the way it would elsewhere in the app. It silently returns or modifies every
 * user's rows. The user id always comes from `profiles.telegram_chat_id`, matched
 * against the chat Telegram delivered, and never from anything in the message body.
 *
 * ## Confirmation is stateful, and the state lives in telegram_logs
 *
 * PRD Section 9 requires confirming before saving when confidence is below 90%,
 * which means the bot must remember what it offered. Rather than add a table, the
 * pending intent is written to `telegram_logs.parsed`, which exists precisely to
 * record what the parser made of a message. A confirmation looks for the most
 * recent unresolved pending row for that chat.
 */

type Admin = ReturnType<typeof createAdminClient>;

/** A pending intent older than this is stale; the user has moved on. */
const PENDING_TTL_MINUTES = 10;

const HELP = [
  "<b>Luy Manager</b>",
  "",
  "Log money by just typing it:",
  "• <code>Spent $5 coffee</code>",
  "• <code>Spent 12000 riel lunch</code>",
  "• <code>Salary $600</code>",
  "• <code>Fuel $20</code>",
  "• <code>Transfer $100 ABA to Wing</code>",
  "",
  "Ask me things:",
  "• <code>Summary today</code> or <code>Summary month</code>",
  "• <code>Show budget</code>",
  "• <code>Undo last transaction</code>",
  "",
  "Always say the currency when you can. <code>5</code> on its own could be $5 or 5៛, so I will ask.",
].join("\n");

/* -------------------------------------------------------------------------- */
/* Logging                                                                     */
/* -------------------------------------------------------------------------- */

async function log(
  admin: Admin,
  entry: {
    chatId: number;
    userId: string | null;
    direction: "inbound" | "outbound";
    text?: string | null;
    parsed?: unknown;
    transactionId?: string | null;
    error?: string | null;
  },
): Promise<string | null> {
  const { data } = await admin
    .from("telegram_logs")
    .insert({
      chat_id: entry.chatId,
      user_id: entry.userId,
      direction: entry.direction,
      message_text: entry.text ?? null,
      parsed: entry.parsed ?? null,
      transaction_id: entry.transactionId ?? null,
      error_message: entry.error ?? null,
    })
    .select("id")
    .maybeSingle();

  return (data as { id: string } | null)?.id ?? null;
}

/** Reply and record that we replied, so a conversation can be reconstructed later. */
async function reply(
  admin: Admin,
  chatId: number,
  userId: string | null,
  text: string,
): Promise<void> {
  const sent = await sendMessage(chatId, text);
  await log(admin, {
    chatId,
    userId,
    direction: "outbound",
    text,
    error: sent.ok ? null : sent.error,
  });
}

/* -------------------------------------------------------------------------- */
/* Reading the user's own data                                                 */
/* -------------------------------------------------------------------------- */

async function userIdForChat(admin: Admin, chatId: number): Promise<string | null> {
  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("telegram_chat_id", chatId)
    .maybeSingle();

  return (data as { id: string } | null)?.id ?? null;
}

interface UserContext {
  userId: string;
  baseCurrency: CurrencyCode;
  defaultAccountId: string | null;
  accounts: AccountBalance[];
  categories: Category[];
}

async function loadContext(admin: Admin, userId: string): Promise<UserContext> {
  const [profile, settings, accounts, categories] = await Promise.all([
    admin.from("profiles").select("base_currency").eq("id", userId).maybeSingle(),
    admin.from("settings").select("default_account_id").eq("user_id", userId).maybeSingle(),
    admin
      .from("account_balances")
      .select("*")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true }),
    admin
      .from("categories")
      .select("*")
      .eq("user_id", userId)
      .is("deleted_at", null),
  ]);

  return {
    userId,
    baseCurrency:
      ((profile.data as { base_currency?: CurrencyCode } | null)?.base_currency as
        | CurrencyCode
        | undefined) ?? "USD",
    defaultAccountId:
      (settings.data as { default_account_id: string | null } | null)?.default_account_id ??
      null,
    accounts: mapRows(asRows(accounts.data), toAccountBalance, "account_balances"),
    categories: mapRows(asRows(categories.data), toCategory, "categories"),
  };
}

/* -------------------------------------------------------------------------- */
/* Resolution                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Pick the account to post to.
 *
 * Currency drives this, not preference, and that is not a stylistic choice: an
 * account is single-currency and the `transactions_currency_matches_account`
 * trigger from migration 0003 rejects a mismatch outright. So "Spent 12000 riel"
 * cannot land in a USD account no matter which account is the default. Order:
 *
 *   1. A name the user actually mentioned, if its currency fits.
 *   2. Their default account, if its currency fits.
 *   3. The first active account holding that currency.
 *
 * Returning null is a real outcome, not an edge case: a user with only a USD
 * account genuinely cannot record a riel expense, and saying so is more useful
 * than converting silently into a currency they did not name.
 */
export function resolveAccount(
  accounts: readonly AccountBalance[],
  currency: CurrencyCode,
  hint: string | null,
  defaultAccountId: string | null,
): AccountBalance | null {
  const usable = accounts.filter((account) => account.isActive);
  const matching = usable.filter((account) => account.currency === currency);

  if (hint && hint.trim() !== "") {
    const needle = hint.trim().toLowerCase();
    const named = matching.find(
      (account) =>
        account.name.toLowerCase().includes(needle) ||
        (account.institution ?? "").toLowerCase().includes(needle),
    );
    if (named) return named;
  }

  const preferred = matching.find((account) => account.accountId === defaultAccountId);
  if (preferred) return preferred;

  return matching[0] ?? null;
}

/**
 * Match free text to one of the user's categories.
 *
 * Exact name first, then a containment match either way round so "coffee" finds
 * "Coffee" and "brown coffee" also finds it. Anything cleverer belongs behind a
 * model, which is why this returns null rather than guessing: an uncategorised
 * transaction is easy to fix later, a wrongly categorised one is invisible.
 */
export function resolveCategory(
  categories: readonly Category[],
  descriptor: string,
): Category | null {
  const needle = descriptor.trim().toLowerCase();
  if (needle === "") return null;

  const exact = categories.find((category) => category.name.toLowerCase() === needle);
  if (exact) return exact;

  return (
    categories.find((category) => {
      const name = category.name.toLowerCase();
      return needle.includes(name) || name.includes(needle);
    }) ?? null
  );
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                      */
/* -------------------------------------------------------------------------- */

function describeAmount(amount: Money): string {
  return escapeHtml(formatMoney(amount));
}

async function saveRecord(
  admin: Admin,
  context: UserContext,
  intent: RecordIntent,
): Promise<{ ok: true; message: string; transactionId: string } | { ok: false; message: string }> {
  const account = resolveAccount(
    context.accounts,
    intent.amount.currency,
    intent.descriptor,
    context.defaultAccountId,
  );

  if (!account) {
    return {
      ok: false,
      message:
        `You have no active ${intent.amount.currency} account, so I cannot record ` +
        `${describeAmount(intent.amount)}. Add one in the app first.`,
    };
  }

  const category = resolveCategory(context.categories, intent.descriptor);
  const { rate } = await loadUsdKhrRate();

  const row = buildTransaction(
    {
      accountId: account.accountId,
      type: intent.type,
      amount: intent.amount,
      categoryId: category?.id ?? null,
      notes: intent.descriptor === "" ? null : intent.descriptor,
    },
    context.baseCurrency,
    rate,
  );

  const { data, error } = await admin
    .from("transactions")
    // created_via marks the origin, so the audit trail distinguishes a message
    // from a tap. user_id comes from the linked profile, never from the message.
    .insert({ ...row, user_id: context.userId, created_via: "telegram" })
    .select("id")
    .single();

  if (error) return { ok: false, message: `I could not save that: ${escapeHtml(error.message)}` };

  const transactionId = (data as { id: string }).id;
  const parts = [
    `Saved ${describeAmount(intent.amount)}`,
    `in ${escapeHtml(account.name)}`,
    category ? `as ${escapeHtml(category.name)}` : "with no category",
  ];

  return { ok: true, transactionId, message: `${parts.join(" ")}.` };
}

async function saveTransfer(
  admin: Admin,
  context: UserContext,
  intent: TransferIntent,
): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const from = resolveAccount(
    context.accounts,
    intent.amount.currency,
    intent.fromHint,
    context.defaultAccountId,
  );
  if (!from) {
    return {
      ok: false,
      message: `I could not find a ${intent.amount.currency} account matching "${escapeHtml(intent.fromHint)}".`,
    };
  }

  // The destination may hold either currency, so it is matched by name across all
  // active accounts rather than filtered by the sent currency first.
  const to =
    context.accounts.find(
      (account) =>
        account.isActive &&
        account.accountId !== from.accountId &&
        (account.name.toLowerCase().includes(intent.toHint.toLowerCase()) ||
          (account.institution ?? "").toLowerCase().includes(intent.toHint.toLowerCase())),
    ) ?? null;

  if (!to) {
    return {
      ok: false,
      message: `I could not find an account matching "${escapeHtml(intent.toHint)}".`,
    };
  }

  const { rate } = await loadUsdKhrRate();

  try {
    // planTransfer enforces what the database would otherwise reject: two distinct
    // accounts, a non-zero amount, and each leg in its own account's currency.
    const plan = planTransfer({ from, to, amount: intent.amount }, rate);
    const groupId = crypto.randomUUID();
    const [out, incoming] = transferInserts(plan, groupId, context.baseCurrency, rate);

    // One insert, so both legs land in a single transaction and migration 0004's
    // deferred two-leg check sees a balanced group at COMMIT.
    const { error } = await admin.from("transactions").insert([
      { ...out, user_id: context.userId, created_via: "telegram" },
      { ...incoming, user_id: context.userId, created_via: "telegram" },
    ]);

    if (error) {
      return { ok: false, message: `I could not save that: ${escapeHtml(error.message)}` };
    }

    return {
      ok: true,
      message:
        `Moved ${describeAmount(plan.sent)} from ${escapeHtml(from.name)} ` +
        `to ${describeAmount(plan.received)} in ${escapeHtml(to.name)}.`,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? escapeHtml(error.message) : "That transfer does not work.",
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Read-only answers                                                           */
/* -------------------------------------------------------------------------- */

async function summarise(
  admin: Admin,
  context: UserContext,
  window: "today" | "month",
): Promise<string> {
  const now = new Date();
  const from =
    window === "today"
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
      : new Date(now.getFullYear(), now.getMonth(), 1);

  const { data } = await admin
    .from("transactions")
    .select(TRANSACTION_COLUMNS)
    .eq("user_id", context.userId)
    .is("deleted_at", null)
    .gte("occurred_at", from.toISOString())
    .order("occurred_at", { ascending: false });

  // asRows: an explicit column list is a template string the client's generics
  // cannot narrow, so it types `data` as an error shape. Same helper the rest of
  // the data layer uses for this.
  const transactions = mapRows(asRows(data), toTransaction, "transactions");
  const { rate } = await loadUsdKhrRate();
  const flow = summarizeCashFlow(transactions, context.baseCurrency, rate);

  const label = window === "today" ? "Today" : "This month";
  return [
    `<b>${label}</b>`,
    `In: ${describeAmount(flow.income)}`,
    `Out: ${describeAmount(flow.expense)}`,
    `Net: ${describeAmount(flow.net)}`,
    `<i>${transactions.length} transaction${transactions.length === 1 ? "" : "s"}, in ${context.baseCurrency}</i>`,
  ].join("\n");
}

async function budgetSummary(admin: Admin, context: UserContext): Promise<string> {
  const { data } = await admin
    .from("budgets")
    .select("*")
    .eq("user_id", context.userId)
    .is("deleted_at", null)
    .eq("is_active", true);

  const rows = (data ?? []) as Array<{
    name: string | null;
    category_id: string | null;
    amount: number;
    currency: CurrencyCode;
  }>;

  if (rows.length === 0) return "You have no active budgets. Add one in the app.";

  // Limits only. Computing spend-against-budget needs the same period arithmetic
  // the budgets page does, and duplicating that here would be a second
  // implementation of the number that matters most.
  const lines = rows.map((row) => {
    const name =
      row.name ??
      context.categories.find((category) => category.id === row.category_id)?.name ??
      "Everything";
    // money() rather than an object literal: it validates the integer and collapses
    // negative zero, which a bare { minor, currency } quietly skips.
    return `• ${escapeHtml(name)}: ${escapeHtml(formatMoney(money(row.amount, row.currency)))}`;
  });

  return [`<b>Active budgets</b>`, ...lines, "", "Open the app for spend against each."].join(
    "\n",
  );
}

async function undoLast(admin: Admin, context: UserContext): Promise<string> {
  const { data } = await admin
    .from("transactions")
    .select("id, transfer_group_id, amount, currency")
    .eq("user_id", context.userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const row = data as {
    id: string;
    transfer_group_id: string | null;
    amount: number;
    currency: CurrencyCode;
  } | null;

  if (!row) return "There is nothing to undo.";

  const deletedAt = new Date().toISOString();

  /*
   * The user filter is applied where the builder is created, not on each branch
   * below.
   *
   * It was previously added per-branch, which was correct but not *visibly*
   * correct: the statement constructing the update carried no scope, so an audit
   * reading that line alone saw an unscoped update against every user's
   * transactions, and a later edit reusing the builder would have been unscoped
   * for real. In a webhook, where RLS is absent, that distinction is the whole
   * safety margin.
   */
  const scoped = admin
    .from("transactions")
    .update({ deleted_at: deletedAt })
    .eq("user_id", context.userId);

  // Both legs together when it is a transfer: migration 0004 refuses a
  // half-deleted pair, correctly, since one leg alone debits and credits nothing.
  const { error } = row.transfer_group_id
    ? await scoped.eq("transfer_group_id", row.transfer_group_id)
    : await scoped.eq("id", row.id);

  if (error) return `I could not undo that: ${escapeHtml(error.message)}`;

  return `Removed ${describeAmount(money(row.amount, row.currency))}. It is recoverable in the app.`;
}

/* -------------------------------------------------------------------------- */
/* Pending confirmations                                                       */
/* -------------------------------------------------------------------------- */

async function storePending(
  admin: Admin,
  chatId: number,
  userId: string,
  text: string,
  intent: TelegramIntent,
): Promise<void> {
  await log(admin, {
    chatId,
    userId,
    direction: "inbound",
    text,
    parsed: { pending: intent },
  });
}

async function takePending(
  admin: Admin,
  chatId: number,
  userId: string,
): Promise<{ id: string; intent: TelegramIntent } | null> {
  const cutoff = new Date(Date.now() - PENDING_TTL_MINUTES * 60_000).toISOString();

  // The jsonb key is filtered in JavaScript rather than with a PostgREST `->`
  // operator. Expressing "this JSON key is present" through the query string is
  // easy to get subtly wrong, and getting it wrong here fails open: it would
  // return the newest inbound row whether or not it holds a pending intent, and a
  // stray "yes" could then save something the user never saw offered.
  const { data } = await admin
    .from("telegram_logs")
    .select("id, parsed")
    .eq("user_id", userId)
    .eq("chat_id", chatId)
    .eq("direction", "inbound")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(10);

  const rows = (data ?? []) as Array<{ id: string; parsed: { pending?: TelegramIntent } | null }>;
  const row = rows.find((candidate) => candidate.parsed?.pending) ?? null;
  if (!row?.parsed?.pending) return null;

  // Consumed immediately so a second "yes" cannot save the same thing twice. The
  // append-only trigger on telegram_logs blocks anon and authenticated, not the
  // service role, so this update is permitted.
  await admin
    .from("telegram_logs")
    .update({ parsed: { resolved: row.parsed.pending } })
    .eq("id", row.id)
    .eq("user_id", userId);

  return { id: row.id, intent: row.parsed.pending };
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Handle one Telegram update, end to end.
 *
 * Never throws. The webhook must answer 200 even when something goes wrong,
 * because Telegram retries anything else and a retry after a successful insert
 * records the transaction twice.
 */
export async function handleUpdate(update: unknown): Promise<void> {
  const inbound = readMessage(update);
  if (!inbound) return;

  const { webhookSecret } = requireTelegramEnv();
  const admin = createAdminClient();
  const intent = parseMessage(inbound.text);

  try {
    // Linking is the one intent that runs before we know who is calling, since
    // establishing that is its entire purpose.
    if (intent.kind === "link") {
      const verified = verifyLinkToken(intent.token, webhookSecret);

      if (!verified.ok) {
        const message =
          verified.reason === "expired"
            ? "That connect link has expired. Open Settings in the app and tap Connect Telegram again."
            : "That connect link is not valid. Open Settings in the app and tap Connect Telegram.";
        await reply(admin, inbound.chatId, null, message);
        return;
      }

      // .select() so the affected rows come back. Without it an update matching
      // nothing returns no error, and the bot would cheerfully report "Connected"
      // for a user id that does not exist.
      const { data: linked, error } = await admin
        .from("profiles")
        .update({ telegram_chat_id: inbound.chatId })
        .eq("id", verified.userId)
        .select("id");

      if (!error && (linked ?? []).length === 0) {
        await reply(
          admin,
          inbound.chatId,
          null,
          "That link is signed correctly but the account no longer exists.",
        );
        return;
      }

      if (error) {
        // telegram_chat_id is unique, so the readable cause is this chat already
        // belonging to a different account.
        await reply(
          admin,
          inbound.chatId,
          verified.userId,
          "I could not connect this chat. It may already be linked to another account.",
        );
        return;
      }

      await reply(
        admin,
        inbound.chatId,
        verified.userId,
        `Connected. ${HELP}`,
      );
      return;
    }

    const userId = await userIdForChat(admin, inbound.chatId);

    if (!userId) {
      await log(admin, {
        chatId: inbound.chatId,
        userId: null,
        direction: "inbound",
        text: inbound.text,
        parsed: intent,
        error: "chat is not linked to a profile",
      });
      await reply(
        admin,
        inbound.chatId,
        null,
        "This chat is not connected to an account yet. Open Settings in the Luy Manager app and tap Connect Telegram.",
      );
      return;
    }

    if (intent.kind === "help") {
      await log(admin, { chatId: inbound.chatId, userId, direction: "inbound", text: inbound.text, parsed: intent });
      await reply(admin, inbound.chatId, userId, HELP);
      return;
    }

    const context = await loadContext(admin, userId);

    if (intent.kind === "cancel") {
      const pending = await takePending(admin, inbound.chatId, userId);
      await reply(
        admin,
        inbound.chatId,
        userId,
        pending ? "Discarded." : "There is nothing waiting to be confirmed.",
      );
      return;
    }

    if (intent.kind === "confirm") {
      const pending = await takePending(admin, inbound.chatId, userId);
      if (!pending) {
        await reply(
          admin,
          inbound.chatId,
          userId,
          "There is nothing waiting to be confirmed.",
        );
        return;
      }
      await execute(admin, context, inbound.chatId, pending.intent, inbound.text);
      return;
    }

    if (intent.kind === "record" || intent.kind === "transfer") {
      if (needsConfirmation(intent)) {
        await storePending(admin, inbound.chatId, userId, inbound.text, intent);
        await reply(admin, inbound.chatId, userId, describePending(intent));
        return;
      }
      await execute(admin, context, inbound.chatId, intent, inbound.text);
      return;
    }

    await log(admin, {
      chatId: inbound.chatId,
      userId,
      direction: "inbound",
      text: inbound.text,
      parsed: intent,
    });

    if (intent.kind === "undo") {
      await reply(admin, inbound.chatId, userId, await undoLast(admin, context));
      return;
    }
    if (intent.kind === "budget") {
      await reply(admin, inbound.chatId, userId, await budgetSummary(admin, context));
      return;
    }
    if (intent.kind === "summary") {
      await reply(admin, inbound.chatId, userId, await summarise(admin, context, intent.window));
      return;
    }

    await reply(
      admin,
      inbound.chatId,
      userId,
      `I did not understand that.\n\n${HELP}`,
    );
  } catch (error) {
    // Logged rather than rethrown, for the retry reason above.
    await log(admin, {
      chatId: inbound.chatId,
      userId: null,
      direction: "inbound",
      text: inbound.text,
      parsed: intent,
      error: error instanceof Error ? error.message : "handler failed",
    });
    await sendMessage(inbound.chatId, "Something went wrong on my side. Nothing was saved.");
  }
}

/** What the bot says when it is about to guess. */
function describePending(intent: RecordIntent | TransferIntent): string {
  const percent = Math.round(intent.confidence * 100);

  if (intent.kind === "transfer") {
    return [
      `I read that as a transfer of ${describeAmount(intent.amount)}`,
      `from "${escapeHtml(intent.fromHint)}" to "${escapeHtml(intent.toHint)}".`,
      "",
      `I am only ${percent}% sure. Reply <b>yes</b> to save it, or <b>no</b> to discard.`,
    ].join(" ");
  }

  const what = intent.descriptor === "" ? "no description" : `"${escapeHtml(intent.descriptor)}"`;
  return [
    `I read that as ${intent.type} of ${describeAmount(intent.amount)} with ${what}.`,
    "",
    `I am only ${percent}% sure, usually because the currency or direction was not stated.`,
    "Reply <b>yes</b> to save it, <b>no</b> to discard, or send it again with the currency spelled out.",
  ].join("\n");
}

/** Run a write intent and report the outcome. */
async function execute(
  admin: Admin,
  context: UserContext,
  chatId: number,
  intent: TelegramIntent,
  originalText: string,
): Promise<void> {
  if (intent.kind === "record") {
    const result = await saveRecord(admin, context, intent);
    await log(admin, {
      chatId,
      userId: context.userId,
      direction: "inbound",
      text: originalText,
      parsed: intent,
      transactionId: result.ok ? result.transactionId : null,
      error: result.ok ? null : result.message,
    });
    await reply(admin, chatId, context.userId, result.message);
    return;
  }

  if (intent.kind === "transfer") {
    const result = await saveTransfer(admin, context, intent);
    await log(admin, {
      chatId,
      userId: context.userId,
      direction: "inbound",
      text: originalText,
      parsed: intent,
      error: result.ok ? null : result.message,
    });
    await reply(admin, chatId, context.userId, result.message);
    return;
  }

  await reply(admin, chatId, context.userId, "That is no longer something I can save.");
}
