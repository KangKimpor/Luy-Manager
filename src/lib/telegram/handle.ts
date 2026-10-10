import { after } from "next/server";

import { ACCOUNT_BALANCE_COLUMNS, ACCOUNT_COLUMNS, asRows, BUDGET_COLUMNS, CATEGORY_COLUMNS, TRANSACTION_COLUMNS } from "@/lib/data/client";
import { mapRows, toAccount, toAccountBalance, toBudget, toCategory, toTransaction } from "@/lib/data/mappers";
import { readTransactionsInRange } from "@/lib/data/transactions";
import { currentPeriod, summarizeBudgets } from "@/lib/domain/budgets";
import { buildTransaction, summarizeCashFlow } from "@/lib/domain/transactions";
import { planTransfer, transferInserts } from "@/lib/domain/transfers";
import type { AccountBalance, Budget, Category, Transaction } from "@/lib/domain/types";
// CurrencyCode comes from the money layer; domain/types imports it rather than
// re-exporting it.
import { formatMoney, money, type CurrencyCode, type Money } from "@/lib/money";
import { createAdminClient } from "@/lib/supabase/admin";
import { describeFreshness, fallbackSnapshot, type RateSnapshot } from "@/lib/rates/repository";

import { CONFIRM_KEYBOARD, entryKeyboard, escapeHtml, MAIN_KEYBOARD, MORE_KEYBOARD, readMessage, sendMessage, type ReplyKeyboard, type ReplySender } from "./client";
import { requireTelegramEnv } from "./env";
import { verifyLinkToken } from "./link";
import {
  needsConfirmation,
  parseMessage,
  type RecordIntent,
  type EntryMode,
  type TelegramIntent,
  type TransferIntent,
} from "./parse";
import { loadBotRate } from "./rates";
import { clearMenuMetadata, readMenuMetadata } from "./menu-cache";
import { reportingWindow, validTimezone } from "./reporting";
import { reportRequest, type ReportRequest } from "./report-state";

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

const WELCOME = [
  "<b>Luy Manager</b>",
  "Tap <b>Expense</b> or <b>Income</b>, then type the amount and description. Your wallet and currency appear before you enter an amount.",
  "",
  "Or send <code>-$5 coffee</code> or <code>+60000r salary</code> directly.",
  "More has transfers, budgets and reports.",
].join("\n");

const HELP = [
  "<b>Luy Manager</b>",
  "",
  "Fast entry:",
  "• <code>-$5 coffee</code> or <code>+ $600 salary</code>",
  "• <code>/e $5 coffee</code> or <code>/i $600 salary</code>",
  "• Tap <b>Expense</b> or <b>Income</b>. I select your wallet and show its currency. Then send <code>5 coffee</code> or <code>600 salary</code>.",
  "• <b>Choose account</b> changes the wallet in one selection. Switching wallets also switches currency. The entry buttons let you change direction or currency directly.",
  "• After saving, keep typing amounts for the same wallet. <b>Undo</b> removes the last transaction.",
  "The selected mode and account last 10 minutes. Cancel clears them. Explicit currencies and account names always win.",
  "",
  "Other entries:",
  "• <code>Spent $5 coffee</code>",
  "• <code>Spent 12000 riel lunch</code>",
  "• <code>Salary $600</code>",
  "• <code>Expense $20 fuel from ABA</code>",
  "• <code>Transfer $100 ABA to Wing</code>",
  "• <code>Transfer $10 ABA to Cash received 41000 riel</code>",
  "",
  "Ask me things:",
  "• <code>Summary today</code> or <code>Summary month</code>",
  "• <code>Show budget</code>",
  "• <code>Accounts</code>, <code>Recent</code>, <code>Rate</code>",
  "• <code>Undo last transaction</code>",
  "",
  "Without a selected mode, say the currency. <code>5</code> could be $5 or 5៛, so I will ask.",
  "Transfers record movements in your ledger. Your bank moves the actual funds.",
  "Use the menu buttons to switch direction or currency.",
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
  try {
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
  } catch {
    console.error("[telegram] Could not write the message log.");
    return null;
  }
}

/** Reply and record that we replied, so a conversation can be reconstructed later. */
async function reply(
  admin: Admin,
  chatId: number,
  userId: string | null,
  text: string,
  keyboard: ReplyKeyboard = MAIN_KEYBOARD,
  deliver: ReplySender = sendMessage,
  report?: { request: ReportRequest; at: string; timezone: string },
): Promise<boolean> {
  // A confirmation must be delivered before Yes becomes valid. Webhook replies
  // have no delivery receipt, so those prompts keep the verified API request.
  // Refreshable reports need the API's message id; a webhook response has no receipt.
  const sender: ReplySender = keyboard === CONFIRM_KEYBOARD || report ? sendMessage : deliver;
  const sent = await sender(chatId, text, keyboard);
  const writeLog = () => log(admin, {
    chatId,
    userId,
    direction: "outbound",
    text,
    parsed: report && sent.ok && sent.messageId
      ? { kind: "report", messageId: sent.messageId, ...report }
      : sent.viaWebhook ? { delivery: "webhook-response-unverified" } : null,
    error: sent.ok ? null : sent.error,
  });
  if (sent.viaWebhook) after(async () => { await writeLog(); });
  else await writeLog();
  return sent.ok;
}

/* -------------------------------------------------------------------------- */
/* Reading the user's own data                                                 */
/* -------------------------------------------------------------------------- */

interface LinkedProfile {
  id: string;
  base_currency: CurrencyCode;
  timezone: string;
}

async function profileForChat(admin: Admin, chatId: number): Promise<LinkedProfile | null> {
  const { data, error } = await admin
    .from("profiles")
    .select("id, base_currency, timezone")
    .eq("telegram_chat_id", chatId)
    .maybeSingle();

  if (error) throw new Error("Could not find the linked account.");
  return data as LinkedProfile | null;
}

type BotAccount = Pick<AccountBalance, "accountId" | "userId" | "name" | "institution" | "type" | "currency" | "isActive">;

interface UserContext {
  userId: string;
  baseCurrency: CurrencyCode;
  defaultAccountId: string | null;
  accounts: BotAccount[];
  balances: AccountBalance[];
  categories: Category[];
  timezone: string;
  rate: RateSnapshot;
  report: { transactions: Transaction[]; budgets: Budget[]; now: Date };
}

/** Report reads share the same network window as wallet, rate and claim reads. */
async function loadReport(admin: Admin, profile: LinkedProfile, intent: TelegramIntent, now: Date): Promise<UserContext["report"]> {
  const context = { supabase: admin, userId: profile.id };
  if (intent.kind === "summary") {
    const { from, to } = reportingWindow(now, intent.window, validTimezone(profile.timezone));
    const transactions = await readTransactionsInRange(context, from, new Date(to.getTime() - 1));
    return { transactions, budgets: [], now };
  }
  if (intent.kind === "recent") {
    const { data, error } = await admin.from("transactions").select(TRANSACTION_COLUMNS)
      .eq("user_id", profile.id).is("deleted_at", null)
      .order("occurred_at", { ascending: false }).order("id", { ascending: false }).limit(8);
    if (error) throw new Error("Could not read recent transactions.");
    return { transactions: mapRows(asRows(data), toTransaction, "transactions"), budgets: [], now };
  }
  if (intent.kind === "budget") {
    const { data, error } = await admin.from("budgets").select(BUDGET_COLUMNS)
      .eq("user_id", profile.id).is("deleted_at", null).eq("is_active", true);
    if (error) throw new Error("Could not read your budgets.");
    const budgets = mapRows(asRows(data), toBudget, "budgets");
    if (budgets.length === 0) return { transactions: [], budgets, now };
    const periods = budgets.map((budget) => currentPeriod(budget, now));
    const from = new Date(Math.min(...periods.map((period) => period.from.getTime())));
    const to = new Date(Math.max(...periods.map((period) => period.to.getTime())) - 1);
    const transactions = await readTransactionsInRange(context, from, to);
    return { transactions, budgets, now };
  }
  return { transactions: [], budgets: [], now };
}

async function loadContext(admin: Admin, profile: LinkedProfile, intent: TelegramIntent, mayChangeCurrency = false, now = new Date()): Promise<UserContext> {
  const { kind } = intent;
  const userId = profile.id;
  const writing = kind === "record" || kind === "transfer";
  const needsBalances = kind === "accounts" || kind === "transfer";
  const needsAccounts = writing || needsBalances || kind === "recent" || kind === "entry" || kind === "start-entry" || kind === "back" || kind === "discard" || kind === "choose-account" || kind === "select-account";
  // Same-currency rows do not use a rate. Amount-first entries still need one
  // because their selected mode can change the currency while these reads run.
  const needsRate = intent.kind === "record" ? mayChangeCurrency || intent.amount.currency !== (profile.base_currency ?? "USD")
    : kind === "transfer" || kind === "budget" || kind === "summary" || kind === "rate";
  const menuOnly = ["entry", "start-entry", "choose-account", "select-account", "back", "discard"].includes(kind);
  const changingMode = ["entry", "start-entry", "select-account"].includes(kind);
  if (writing || kind === "accounts") clearMenuMetadata(userId);
  const settingsQuery = () => admin.from("settings").select("default_account_id").eq("user_id", userId).maybeSingle();
  const accountsQuery = () => {
    let query = admin.from(needsBalances ? "account_balances" : "accounts")
      .select(needsBalances ? ACCOUNT_BALANCE_COLUMNS : ACCOUNT_COLUMNS.replace("opening_balance, ", "")).eq("user_id", userId);
    if (!needsBalances) query = query.is("deleted_at", null);
    return query.order("sort_order", { ascending: true });
  };
  const checked = async <T extends { error: unknown }>(query: PromiseLike<T>): Promise<T> => {
    const result = await query;
    if (result.error) throw new Error("Could not read wallet metadata.");
    return result;
  };
  // Read commands should not wait on data they never use, or fail because an
  // unrelated part of the ledger is unavailable.
  const [settings, accounts, categories, rate, report] = await Promise.all([
    writing || kind === "accounts" || kind === "entry" || kind === "start-entry"
      ? menuOnly ? readMenuMetadata(userId, "settings", () => checked(settingsQuery()), changingMode) : settingsQuery()
      : { data: null, error: null },
    needsAccounts ? menuOnly ? readMenuMetadata(userId, "accounts", () => checked(accountsQuery()), changingMode) : accountsQuery() : { data: [], error: null },
    writing || kind === "budget" ? admin
      .from("categories")
      .select(CATEGORY_COLUMNS)
      .eq("user_id", userId)
      .is("deleted_at", null) : { data: [], error: null },
    needsRate ? loadBotRate(admin, userId) : fallbackSnapshot(),
    loadReport(admin, profile, intent, now),
  ]);

  if (settings.error || accounts.error || categories.error) {
    throw new Error("Could not load your ledger.");
  }

  // A normal entry only needs wallet metadata. Computing balances scans the
  // ledger, so reserve that view for answers and transfer previews that use it.
  const balances = needsBalances ? mapRows(asRows(accounts.data), toAccountBalance, "account_balances") : [];
  // Opening balances are not used by the bot's metadata path and never enter its menu cache.
  const wallets = needsBalances ? balances : mapRows(asRows(accounts.data).map((row) => ({ ...row, opening_balance: 0 })), toAccount, "accounts")
    .map((account) => ({ ...account, accountId: account.id }));
  return {
    userId,
    baseCurrency: profile.base_currency ?? "USD",
    defaultAccountId:
      (settings.data as { default_account_id: string | null } | null)?.default_account_id ??
      null,
    accounts: wallets,
    balances,
    categories: mapRows(asRows(categories.data), toCategory, "categories"),
    timezone: validTimezone(profile.timezone),
    rate,
    report,
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
  accounts: readonly BotAccount[],
  currency: CurrencyCode,
  hint: string | null,
  defaultAccountId: string | null,
): BotAccount | null {
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

/** Ambiguous or misspelled explicit names must never choose a different wallet. */
export function namedAccount<T extends BotAccount>(
  accounts: readonly T[],
  hint: string,
  currency?: CurrencyCode,
): T | null {
  const usable = accounts.filter((account) => account.isActive && (!currency || account.currency === currency));
  const needle = hint.trim().toLowerCase();
  if (!needle) return null;
  const exact = usable.filter((account) => account.name.toLowerCase() === needle);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  const matches = usable.filter((account) => account.name.toLowerCase().includes(needle) ||
    (account.institution ?? "").toLowerCase().includes(needle));
  return matches.length === 1 ? matches[0] : null;
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
  const account = intent.resolvedAccountId
    ? context.accounts.find((entry) => entry.accountId === intent.resolvedAccountId && entry.isActive && entry.currency === intent.amount.currency) ?? null
    : intent.accountHint ? namedAccount(context.accounts, intent.accountHint, intent.amount.currency) : resolveAccount(
    context.accounts,
    intent.amount.currency,
    intent.descriptor,
    context.defaultAccountId,
  );

  if (!account) {
    return {
      ok: false,
      message: intent.resolvedAccountId
        ? `The selected account is unavailable or does not hold ${intent.amount.currency}. Tap Choose account to select an active ${intent.amount.currency} wallet.`
        : intent.accountHint
        ? `I could not uniquely match an active ${intent.amount.currency} account named "${escapeHtml(intent.accountHint)}". Send /accounts and use its full name.`
        :
        `You have no active ${intent.amount.currency} account, so I cannot record ` +
        `${describeAmount(intent.amount)}. Add one in the app first.`,
    };
  }

  const category = resolveCategory(context.categories.filter((entry) => entry.appliesTo.includes(intent.type)), intent.descriptor);
  const { rate } = context.rate;

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
    `Saved ${intent.type}: ${describeAmount(intent.amount)}`,
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
  const from = intent.resolvedFromId
    ? context.balances.find((entry) => entry.accountId === intent.resolvedFromId && entry.isActive && entry.currency === intent.amount.currency) ?? null
    : namedAccount(context.balances, intent.fromHint, intent.amount.currency);
  if (!from) {
    return {
      ok: false,
      message: `I could not find a ${intent.amount.currency} account matching "${escapeHtml(intent.fromHint)}".`,
    };
  }

  // The destination may hold either currency, so it is matched by name across all
  // active accounts rather than filtered by the sent currency first.
  const to = intent.resolvedToId
    ? context.balances.find((entry) => entry.accountId === intent.resolvedToId && entry.isActive) ?? null
    : namedAccount(context.balances, intent.toHint, intent.receivedAmount?.currency);

  if (!to) {
    return {
      ok: false,
      message: `I could not find an account matching "${escapeHtml(intent.toHint)}".`,
    };
  }

  const { rate } = context.rate;

  try {
    // planTransfer enforces what the database would otherwise reject: two distinct
    // accounts, a non-zero amount, and each leg in its own account's currency.
    const plan = planTransfer({ from, to, amount: intent.amount, receivedAmount: intent.receivedAmount }, rate);
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
        `Recorded ${describeAmount(plan.sent)} from ${escapeHtml(from.name)} ` +
        `to ${describeAmount(plan.received)} in ${escapeHtml(to.name)}.` +
        (plan.receivedBasis === "rate-table" ? `\nConverted using ${escapeHtml(describeFreshness(context.rate))}. Specify "received 41000 riel" to use the amount your bank actually credited.` : ""),
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

function summarise(context: UserContext, window: "today" | "month"): string {
  const { transactions } = context.report;
  const { rate } = context.rate;
  const flow = summarizeCashFlow(transactions, context.baseCurrency, rate);

  const dateFormat = new Intl.DateTimeFormat("en-GB", {
    timeZone: context.timezone, ...(window === "today" ? { day: "numeric" } : {}), month: "short", year: "numeric",
  });
  const date = dateFormat.format(context.report.now);
  const label = date === dateFormat.format(new Date())
    ? window === "today" ? "Today" : "This month"
    : window === "today" ? "Day summary" : "Month summary";
  return [
    `<b>${label} · ${escapeHtml(date)}</b>`,
    `In: ${describeAmount(flow.income)}`,
    `Out: ${describeAmount(flow.expense)}`,
    `Net: ${describeAmount(flow.net)}`,
    `<i>${transactions.length} transaction${transactions.length === 1 ? "" : "s"}, converted to ${context.baseCurrency}. ${escapeHtml(context.timezone)}.</i>`,
  ].join("\n");
}

function budgetSummary(context: UserContext): string {
  const { budgets, transactions, now } = context.report;
  if (budgets.length === 0) return "You have no active budgets. Add one in the app.";
  const progress = summarizeBudgets(budgets, transactions, context.rate.rate, now);
  const lines = progress.slice(0, 12).map((entry) => {
    const name = entry.budget.name ??
      context.categories.find((category) => category.id === entry.budget.categoryId)?.name ??
      "Everything";
    return `• <b>${escapeHtml(name)}</b>\n  ${describeAmount(entry.spent)} of ${describeAmount(entry.limit)} spent, ${describeAmount(entry.remaining)} left.`;
  });
  return ["<b>Budget progress</b>", ...lines, ...(progress.length > 12 ? ["Open the app for all budgets."] : [])].join("\n");
}

function accountSummary(context: UserContext): string {
  const accounts = context.balances.filter((account) => account.isActive);
  if (accounts.length === 0) return "You have no active accounts. Add an account in the app first.";
  return ["<b>Your accounts</b>", ...accounts.slice(0, 20).map((account) =>
    `• <b>${escapeHtml(account.name)}</b>: ${describeAmount(money(account.currentBalance, account.currency))}${account.accountId === context.defaultAccountId ? " (default)" : ""}`),
    "", 'Tap Choose account to pick a wallet, or use its exact name: <code>Spent $5 coffee from ABA</code>.'].join("\n");
}

function accountKeyboard(accounts: readonly BotAccount[], currency?: CurrencyCode): ReplyKeyboard {
  const labels = accounts.filter((account) => account.isActive && (!currency || account.currency === currency))
    .map((account) => `Use ${account.name} (${account.currency})`);
  const rows: string[][] = [];
  for (let index = 0; index < labels.length; index += 2) rows.push(labels.slice(index, index + 2));
  return [...rows, ["Back", "Cancel"]];
}

function entryPrompt(mode: EntryMode, account: BotAccount): string {
  const example = mode.currency === "KHR" ? mode.type === "income" ? "60000 salary" : "6000 coffee"
    : mode.type === "income" ? "600 salary" : "5 coffee";
  return `<b>${mode.type === "income" ? "Income" : "Expense"} · ${escapeHtml(account.name)} · ${mode.currency}</b>\nSend <code>${example}</code>. Keep sending amounts for this wallet for 10 minutes.\nTap a wallet button to switch. Cancel ends quick entry.`;
}

function recentTransactions(context: UserContext): string {
  const { transactions } = context.report;
  if (transactions.length === 0) return "Your ledger has no transactions yet. Try <code>Spent $5 coffee</code>.";
  return ["<b>Recent transactions</b>", ...transactions.map((transaction) => {
    const account = context.accounts.find((entry) => entry.accountId === transaction.accountId);
    const date = new Intl.DateTimeFormat("en-GB", { timeZone: context.timezone, day: "numeric", month: "short" }).format(new Date(transaction.occurredAt));
    return `• ${escapeHtml(date)}: ${describeAmount(money(transaction.amount, transaction.currency))} ${transaction.type}\n  ${escapeHtml(account?.name ?? "Account")}${transaction.notes ? `, ${escapeHtml(transaction.notes.slice(0, 100))}` : ""}`;
  })].join("\n");
}

function reportText(context: UserContext, request: Exclude<ReportRequest, { kind: "ledger" }>): string {
  if (request.kind === "summary") return summarise(context, request.window);
  if (request.kind === "accounts") return accountSummary(context);
  if (request.kind === "budget") return budgetSummary(context);
  return recentTransactions(context);
}

/** Reuse the command readers so a background refresh cannot diverge from the bot. */
export async function renderTelegramReport(admin: Admin, profile: LinkedProfile, request: ReportRequest, at = new Date()): Promise<string> {
  if (request.kind !== "ledger") {
    const intent: TelegramIntent = { ...request, confidence: 1 };
    return reportText(await loadContext(admin, profile, intent, false, at), request);
  }
  // Older webhook replies have no message id. Replace their stale snapshot with
  // one current overview, then keep editing that overview instead of flooding chat.
  const now = new Date();
  const [month, recent] = await Promise.all([
    loadContext(admin, profile, { kind: "summary", window: "month", confidence: 1 }, false, now),
    loadContext(admin, profile, { kind: "recent", confidence: 1 }, false, now),
  ]);
  const { from, to } = reportingWindow(now, "today", month.timezone);
  const today = { ...month, report: { ...month.report, transactions: month.report.transactions.filter(transaction => {
    const time = new Date(transaction.occurredAt).getTime();
    return time >= from.getTime() && time < to.getTime();
  }) } };
  return ["<b>Updated from the web</b>", summarise(today, "today"), summarise(month, "month"), recentTransactions(recent)].join("\n\n");
}

function operationGuide(operation: "expense" | "income" | "refund" | "transfer"): string {
  const examples = {
    expense: "Expense $5 coffee from ABA\nExpense 12000 riel lunch from Cash",
    income: "Income $600 salary from ABA\nIncome 50000 riel gift from Cash",
    refund: "Refund $12 shirt from ABA",
    transfer: "Transfer $100 ABA to Wing\nTransfer $10 ABA to Cash received 41000 riel",
  };
  return [operation === "transfer" ? "Record money you already moved between your accounts:" : `Send the ${operation} amount, currency and description:`,
    `<code>${examples[operation]}</code>`, "", "Send /accounts to see the exact account names.",
    operation === "transfer" ? "This records the ledger movement. Your bank moves the actual funds." : "If the currency or direction is unclear, check the preview and tap Save or Discard."].join("\n");
}

async function undoLast(admin: Admin, context: Pick<UserContext, "userId">): Promise<string> {
  const { data, error: readError } = await admin
    .from("transactions")
    .select("id, transfer_group_id, amount, currency")
    .eq("user_id", context.userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (readError) throw new Error("Could not find the latest transaction.");

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

  return `Removed ${describeAmount(money(row.amount, row.currency))}${row.transfer_group_id ? " and both transfer legs" : ""} from your ledger.`;
}

/* -------------------------------------------------------------------------- */
/* Pending confirmations                                                       */
/* -------------------------------------------------------------------------- */

async function storePending(
  admin: Admin,
  logId: string,
  chatId: number,
  userId: string,
  intent: TelegramIntent,
): Promise<void> {
  const { error } = await admin.from("telegram_logs")
    .update({ parsed: { offered: intent } })
    .eq("id", logId).eq("user_id", userId).eq("chat_id", chatId);
  if (error) throw new Error("Could not store the confirmation. Nothing was saved.");
}

async function takePending(
  admin: Admin,
  chatId: number,
  userId: string,
  allowOffered = false,
): Promise<{ id: string; intent: TelegramIntent } | null> {
  const cutoff = new Date(Date.now() - PENDING_TTL_MINUTES * 60_000).toISOString();

  // The jsonb key is filtered in JavaScript rather than with a PostgREST `->`
  // operator. Expressing "this JSON key is present" through the query string is
  // easy to get subtly wrong, and getting it wrong here fails open: it would
  // return the newest inbound row whether or not it holds a pending intent, and a
  // stray "yes" could then save something the user never saw offered.
  const { data, error } = await admin
    .from("telegram_logs")
    .select("id, parsed, consumed_at")
    .eq("user_id", userId)
    .eq("chat_id", chatId)
    .eq("direction", "inbound")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw new Error("Could not read the pending confirmation.");

  const rows = (data ?? []) as Array<{ id: string; parsed: { pending?: TelegramIntent; offered?: TelegramIntent; resolved?: TelegramIntent } | null; consumed_at: string | null }>;
  // A consumed newest offer ends the search. Looking for the next unconsumed
  // row would resurrect an older offer after a second Yes or No.
  const row = rows.find((candidate) => candidate.parsed?.pending || candidate.parsed?.offered || candidate.parsed?.resolved);
  const intent = row?.parsed?.pending ?? (allowOffered ? row?.parsed?.offered : undefined);
  if (!row || !intent || row.consumed_at) return null;

  // Consumed immediately so a second "yes" cannot save the same thing twice. The
  // append-only trigger on telegram_logs blocks anon and authenticated, not the
  // service role, so this update is permitted.
  const claimed = await admin
    .from("telegram_logs")
    .update({ parsed: { resolved: intent }, consumed_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("user_id", userId)
    .eq("chat_id", chatId)
    .is("consumed_at", null)
    .select("id");
  if (claimed.error) throw new Error("Could not claim the pending confirmation.");
  if (!claimed.data?.length) return null;

  return { id: row.id, intent };
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                 */
/* -------------------------------------------------------------------------- */

async function entryMode(admin: Admin, chatId: number, userId: string, currentLogId: string, changingMode = false): Promise<EntryMode | null> {
  const { data, error } = await admin.from("telegram_logs").select("parsed")
    .eq("user_id", userId).eq("chat_id", chatId).eq("direction", "inbound")
    .neq("id", currentLogId)
    .contains("parsed", { kind: "entry" })
    .gte("created_at", new Date(Date.now() - PENDING_TTL_MINUTES * 60_000).toISOString())
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error("Could not read the selected entry mode.");
  const parsed = (data as { parsed?: { mode?: EntryMode; selecting?: boolean } } | null)?.parsed;
  // A rapid next message must not use the old wallet while a selection is in
  // flight. Cancel or a fresh mode selection can replace an interrupted choice.
  if (parsed?.selecting && !changingMode) throw new Error("The account selection has not finished.");
  const mode = parsed?.mode;
  return mode && (mode.type === "expense" || mode.type === "income") &&
    (mode.currency === "USD" || mode.currency === "KHR") &&
    (mode.autoAccount === undefined || typeof mode.autoAccount === "boolean") &&
    (mode.accountId === undefined || typeof mode.accountId === "string") ? mode : null;
}

/**
 * Handle one Telegram update, end to end.
 *
 * Never throws. The webhook must answer 200 even when something goes wrong,
 * because Telegram retries anything else and a retry after a successful insert
 * records the transaction twice.
 */
export async function handleUpdate(update: unknown, deliver: ReplySender = sendMessage): Promise<void> {
  const inbound = readMessage(update);
  if (!inbound) return;

  const { webhookSecret } = requireTelegramEnv();
  const admin = createAdminClient();
  let intent = parseMessage(inbound.text);
  let linkedUserId: string | null = null;
  let inboundLogId: string | null = null;
  const respond = (...args: [Admin, number, string | null, string, ReplyKeyboard?]) =>
    reply(args[0], args[1], args[2], args[3], args[4], deliver);

  try {
    const profile = await profileForChat(admin, inbound.chatId);
    linkedUserId = profile?.id ?? null;
    const amountFirst = /^[\d$]/.test(inbound.text.trim());
    // Only reads run ahead of the durable claim. State changes and financial
    // writes still wait for it. Settle errors immediately so a rejected read on
    // a duplicate delivery cannot escape as an unhandled rejection.
    const readAhead = profile && !["link", "help", "guide", "cancel", "undo", "confirm"].includes(intent.kind)
      ? loadContext(admin, profile, intent, amountFirst).then(
        (context) => ({ ok: true as const, context }),
        () => ({ ok: false as const }),
      ) : null;
    const preparedContext = async () => {
      const prepared = await readAhead;
      if (!prepared?.ok) throw new Error("Could not load your ledger.");
      return prepared.context;
    };
    // Uniqueness is enforced by Postgres, so two concurrent webhook deliveries
    // cannot both pass this check. Without a durable claim, even Undo repeats.
    const claim = await admin.from("telegram_logs").insert({
      update_id: inbound.updateId,
      chat_id: inbound.chatId,
      user_id: linkedUserId,
      direction: "inbound",
      message_text: intent.kind === "link" ? "/start [connect token]" : inbound.text,
      parsed: intent.kind === "link" ? { kind: "link" }
        : intent.kind === "entry" || intent.kind === "start-entry" || intent.kind === "select-account" ? { kind: "entry", selecting: true } : intent,
    }).select("id").single();
    if (claim.error?.code === "23505") return;
    if (claim.error || !claim.data) {
      await deliver(inbound.chatId, "I could not securely accept this message. Nothing was saved. Ask the app owner to check the Telegram database migration.");
      return;
    }
    inboundLogId = (claim.data as { id: string }).id;

    // Linking is the one intent that runs before we know who is calling, since
    // establishing that is its entire purpose.
    if (intent.kind === "link") {
      const verified = verifyLinkToken(intent.token, webhookSecret);

      if (!verified.ok) {
        const message =
          verified.reason === "expired"
            ? "That connect link has expired. Open Settings in the app and tap Connect Telegram again."
            : "That connect link is not valid. Open Settings in the app and tap Connect Telegram.";
        await respond(admin, inbound.chatId, null, message);
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
        await respond(
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
        await respond(
          admin,
          inbound.chatId,
          verified.userId,
          "I could not connect this chat. It may already be linked to another account.",
        );
        return;
      }

      let scopedLog = admin.from("telegram_logs").update({ user_id: verified.userId })
        .eq("id", inboundLogId).eq("chat_id", inbound.chatId);
      scopedLog = linkedUserId ? scopedLog.eq("user_id", linkedUserId) : scopedLog.is("user_id", null);
      await scopedLog;
      linkedUserId = verified.userId;

      await respond(
        admin,
        inbound.chatId,
        verified.userId,
        `Connected. ${WELCOME}`,
      );
      return;
    }

    const userId = linkedUserId;

    if (!userId || !profile) {
      await respond(
        admin,
        inbound.chatId,
        null,
        "This chat is not connected to an account yet. Open Settings in the Luy Manager app and tap Connect Telegram.",
      );
      return;
    }

    if (intent.kind === "help") {
      await respond(admin, inbound.chatId, userId, HELP, MORE_KEYBOARD);
      return;
    }

    if (inbound.unsupportedAttachment) {
      await respond(admin, inbound.chatId, userId, "Send a text message or a photo with an amount in its caption. I cannot transcribe voice messages or read receipt photos yet. Try <code>Spent $5 coffee</code>.");
      return;
    }
    if (intent.kind === "more") {
      await respond(admin, inbound.chatId, userId, "<b>More actions</b>\nChoose a report or transfer. Back returns to your quick entry.", MORE_KEYBOARD);
      return;
    }
    if (intent.kind === "guide") {
      await respond(admin, inbound.chatId, userId, operationGuide(intent.operation), MORE_KEYBOARD);
      return;
    }

    if (intent.kind === "cancel") {
      const pending = await takePending(admin, inbound.chatId, userId, true);
      const cleared = await admin.from("telegram_logs").update({ parsed: { kind: "entry", mode: null } })
        .eq("id", inboundLogId).eq("user_id", userId).eq("chat_id", inbound.chatId);
      if (cleared.error) throw new Error("Could not clear entry mode.");
      await respond(
        admin,
        inbound.chatId,
        userId,
        pending ? "Discarded. Entry mode cleared." : "Entry mode cleared. Nothing was saved.",
      );
      return;
    }

    if (intent.kind === "undo") {
      await respond(admin, inbound.chatId, userId, await undoLast(admin, { userId }));
      return;
    }
    if (intent.kind === "rate") {
      const { rate } = await preparedContext();
      await respond(admin, inbound.chatId, userId, `<b>USD / KHR</b>\n$1 = ${escapeHtml(rate.rate.rate.toLocaleString("en-US"))} riel\n${escapeHtml(describeFreshness(rate))}.`);
      return;
    }

    if (intent.kind === "confirm") {
      const pending = await takePending(admin, inbound.chatId, userId);
      if (!pending) {
        await respond(admin, inbound.chatId, userId, "There is nothing waiting to be confirmed.");
        return;
      }
      const [context, mode] = await Promise.all([
        loadContext(admin, profile, pending.intent),
        entryMode(admin, inbound.chatId, userId, inboundLogId),
      ]);
      await execute(admin, context, inbound.chatId, inboundLogId, pending.intent, deliver, mode);
      return;
    }

    const readsMode = amountFirst || intent.kind === "record" || intent.kind === "entry" || intent.kind === "start-entry" || intent.kind === "back" || intent.kind === "discard" || intent.kind === "choose-account" || intent.kind === "select-account";
    const clearsPending = intent.kind === "record" || intent.kind === "transfer" || intent.kind === "entry" || intent.kind === "start-entry" || intent.kind === "select-account" || intent.kind === "discard";
    const [context, mode, clearedOffer] = await Promise.all([
      preparedContext(),
      readsMode ? entryMode(admin, inbound.chatId, userId, inboundLogId, intent.kind === "entry" || intent.kind === "start-entry" || intent.kind === "select-account") : null,
      // Invalidate an old offer before saving its replacement, while the wallet
      // and mode reads are in flight rather than adding another serial wait.
      clearsPending ? takePending(admin, inbound.chatId, userId, true) : null,
    ]);
    if (amountFirst) intent = parseMessage(inbound.text, mode);
    if (intent.kind === "record" && mode?.accountId && !intent.accountHint && (!mode.autoAccount || intent.amount.currency === mode.currency)) {
      intent = { ...intent, resolvedAccountId: mode.accountId };
    }

    if (intent.kind === "discard") {
      const selected = context.accounts.find((account) => account.accountId === mode?.accountId && account.isActive && account.currency === mode.currency);
      const message = clearedOffer ? "Preview discarded. Nothing was saved." : "There is no preview to discard.";
      await respond(admin, inbound.chatId, userId,
        message + (mode && selected ? `\n${entryPrompt(mode, selected)}` : ""),
        mode && selected ? entryKeyboard(mode, context.accounts) : MAIN_KEYBOARD);
      return;
    }

    if (intent.kind === "back") {
      const selected = context.accounts.find((account) => account.accountId === mode?.accountId && account.isActive && account.currency === mode.currency);
      await respond(admin, inbound.chatId, userId,
        mode && selected ? entryPrompt(mode, selected) : WELCOME,
        mode && selected ? entryKeyboard(mode, context.accounts) : MAIN_KEYBOARD);
      return;
    }

    if (intent.kind === "choose-account") {
      const selected = context.accounts.find((account) => account.accountId === mode?.accountId && account.isActive);
      await respond(admin, inbound.chatId, userId,
        `<b>Choose a wallet</b>${selected ? `\nCurrent: ${escapeHtml(selected.name)} · ${selected.currency}` : ""}\nTap a wallet below. Its currency is selected too.`,
        accountKeyboard(context.accounts));
      return;
    }

    if ((intent.kind === "entry" && intent.mode) || intent.kind === "start-entry" || intent.kind === "select-account") {
      const requestedCurrency = intent.kind === "entry" ? intent.mode!.currency : undefined;
      const previous = context.accounts.find((account) => account.accountId === mode?.accountId && account.isActive && (!requestedCurrency || account.currency === requestedCurrency));
      const selected = intent.kind === "select-account"
        ? namedAccount(context.accounts, intent.name, intent.currency)
        : previous ?? context.accounts.find((account) => account.accountId === context.defaultAccountId && account.isActive && (!requestedCurrency || account.currency === requestedCurrency))
          ?? context.accounts.find((account) => account.isActive && account.currency === (requestedCurrency ?? context.baseCurrency))
          ?? (!requestedCurrency ? context.accounts.find((account) => account.isActive) : null);
      if (!selected) {
        const cleared = await admin.from("telegram_logs").update({ parsed: { kind: "entry", mode: null } })
          .eq("id", inboundLogId).eq("user_id", userId).eq("chat_id", inbound.chatId);
        if (cleared.error) throw new Error("Could not clear the invalid account selection.");
        const message = intent.kind === "select-account" ? "That account is unavailable or its name is ambiguous. Choose an active wallet below."
          : requestedCurrency ? `You have no active ${requestedCurrency} wallet. Choose another wallet below, or add one in the app.`
          : "You have no active wallets. Add an account in the app first.";
        await respond(admin, inbound.chatId, userId, message, accountKeyboard(context.accounts));
        return;
      }
      const nextMode: EntryMode = {
        type: intent.kind === "start-entry" ? intent.type : intent.kind === "entry" ? intent.mode!.type : mode?.type ?? "expense",
        currency: selected.currency,
        accountId: selected.accountId,
        autoAccount: intent.kind !== "select-account" && (!previous || mode?.autoAccount === true),
      };
      const saved = await admin.from("telegram_logs").update({ parsed: { kind: "entry", mode: nextMode } })
        .eq("id", inboundLogId).eq("user_id", userId).eq("chat_id", inbound.chatId);
      if (saved.error) throw new Error("Could not select the entry account.");
      await respond(admin, inbound.chatId, userId, entryPrompt(nextMode, selected), entryKeyboard(nextMode, context.accounts));
      return;
    }

    if (intent.kind === "record" || intent.kind === "transfer") {
      const target = intent.kind === "transfer" ? namedAccount(context.accounts, intent.toHint) : null;
      const estimatesReceived = intent.kind === "transfer" && target && target.currency !== intent.amount.currency && !intent.receivedAmount;
      if (needsConfirmation(intent) || estimatesReceived) {
        let offered: RecordIntent | TransferIntent = intent;
        if (intent.kind === "transfer") {
          const from = namedAccount(context.balances, intent.fromHint, intent.amount.currency);
          const to = namedAccount(context.balances, intent.toHint, intent.receivedAmount?.currency);
          if (from && to) {
            const plan = planTransfer({ from, to, amount: intent.amount, receivedAmount: intent.receivedAmount }, context.rate.rate);
            offered = { ...intent, resolvedFromId: from.accountId, resolvedToId: to.accountId, receivedAmount: plan.received };
          }
        } else {
          const recordIntent = intent;
          const account = intent.resolvedAccountId ? context.accounts.find((entry) => entry.accountId === recordIntent.resolvedAccountId && entry.isActive && entry.currency === recordIntent.amount.currency)
            : intent.accountHint ? namedAccount(context.accounts, intent.accountHint, intent.amount.currency)
            : resolveAccount(context.accounts, intent.amount.currency, intent.descriptor, context.defaultAccountId);
          if (account) offered = { ...intent, resolvedAccountId: account.accountId };
        }
        await storePending(admin, inboundLogId, inbound.chatId, userId, offered);
        const delivered = await respond(admin, inbound.chatId, userId, describePending(intent.kind === "record" ? offered : intent, context), CONFIRM_KEYBOARD);
        // The staged offer is a barrier while delivery is in flight. Yes cannot
        // execute unseen terms, and a failed offer never revives an older one.
        const activated = await admin.from("telegram_logs")
          .update(delivered ? { parsed: { pending: offered } } : { parsed: { resolved: offered }, consumed_at: new Date().toISOString() })
          .eq("id", inboundLogId).eq("user_id", userId).eq("chat_id", inbound.chatId).is("consumed_at", null);
        if (activated.error) throw new Error("Could not activate the confirmation.");
        return;
      }
      // Resending an ambiguous message with explicit currency replaces the old
      // offer. A later Yes must not resurrect the version the user corrected.
      await execute(admin, context, inbound.chatId, inboundLogId, intent, deliver, mode);
      return;
    }

    const request = reportRequest(intent);
    if (request) {
      await reply(admin, inbound.chatId, userId, reportText(context, request), MAIN_KEYBOARD, deliver, {
        request, at: context.report.now.toISOString(), timezone: context.timezone,
      });
      return;
    }
    await respond(
      admin,
      inbound.chatId,
      userId,
      `Try an amount and description, like <code>-$5 coffee</code>, or tap Expense or Income to start.\nHelp in More shows all examples.`,
    );
  } catch {
    // Logged rather than rethrown, for the retry reason above.
    await log(admin, {
      chatId: inbound.chatId,
      userId: linkedUserId,
      direction: "outbound",
      error: "Could not complete the request. Check recent transactions before retrying.",
    });
    // A write may already have committed before a later operation failed. Never
    // promise that nothing was saved or encourage an immediate duplicate write.
    await deliver(inbound.chatId, "I could not finish that request. Check /recent before trying it again.");
  }
}

/** What the bot says when it is about to guess. */
function describePending(intent: RecordIntent | TransferIntent, context: UserContext): string {
  if (intent.kind === "transfer") {
    const to = namedAccount(context.balances, intent.toHint, intent.receivedAmount?.currency);
    const from = namedAccount(context.balances, intent.fromHint, intent.amount.currency);
    let received = "";
    if (from && to) {
      try {
        const plan = planTransfer({ from, to, amount: intent.amount, receivedAmount: intent.receivedAmount }, context.rate.rate);
        received = `Credit ${describeAmount(plan.received)}${plan.receivedBasis === "rate-table" ? ` estimated using ${escapeHtml(describeFreshness(context.rate))}` : ""}.`;
      } catch { /* The execution path will explain an invalid account pair. */ }
    }
    return [
      "<b>Confirm transfer</b>",
      `From: ${describeAmount(intent.amount)} · ${escapeHtml(from?.name ?? intent.fromHint)}`,
      `To: ${escapeHtml(to?.name ?? intent.toHint)}`,
      received,
      "Check the amount received, then tap <b>Save</b> or <b>Discard</b>. If your bank credited a different amount, resend with the actual received amount.",
    ].join("\n");
  }

  const account = intent.resolvedAccountId ? context.accounts.find((entry) => entry.accountId === intent.resolvedAccountId) : null;
  return [
    `<b>Confirm ${intent.type}</b>`,
    `Amount: <b>${describeAmount(intent.amount)}</b> (${intent.amount.currency})`,
    `Wallet: ${escapeHtml(account?.name ?? intent.accountHint ?? "No matching wallet")}`,
    ...(intent.descriptor ? [`Description: ${escapeHtml(intent.descriptor)}`] : []),
    "",
    "The currency or direction was unclear. Check the details above.",
    "Tap <b>Save</b> to record it or <b>Discard</b> to cancel. You can also resend it with corrections.",
  ].join("\n");
}

/** Run a write intent and report the outcome. */
async function execute(
  admin: Admin,
  context: UserContext,
  chatId: number,
  logId: string,
  intent: TelegramIntent,
  deliver: ReplySender,
  mode?: EntryMode | null,
): Promise<void> {
  if (intent.kind === "record" || intent.kind === "transfer") {
    const result = intent.kind === "record" ? await saveRecord(admin, context, intent) : await saveTransfer(admin, context, intent);
    // The durable update claim and financial write have finished. Attaching the
    // result to that audit row must not add another round trip before the reply.
    after(async () => {
      const { error } = await admin.from("telegram_logs").update({ parsed: intent,
        transaction_id: result.ok && "transactionId" in result ? result.transactionId : null,
        error_message: result.ok ? null : result.message,
      }).eq("id", logId).eq("user_id", context.userId).eq("chat_id", chatId);
      if (error) console.error("[telegram] Could not annotate the saved request.");
    });
    const selected = mode && context.accounts.find((account) => account.accountId === mode.accountId && account.isActive && account.currency === mode.currency);
    const next = mode && selected ? `\nNext: <b>${mode.type === "expense" ? "Expense" : "Income"} · ${escapeHtml(selected.name)} · ${mode.currency}</b>. Send another amount, or use the buttons below.` : "";
    await reply(admin, chatId, context.userId, result.message + next, mode && selected ? entryKeyboard(mode, context.accounts) : MAIN_KEYBOARD, deliver);
    return;
  }

  await reply(admin, chatId, context.userId, "That is no longer something I can save.", MAIN_KEYBOARD, deliver);
}
