import { beforeEach, describe, expect, test, vi } from "vitest";
import type { AccountBalance } from "@/lib/domain/types";

const mocks = vi.hoisted(() => ({ admin: null as unknown, sent: vi.fn(), edited: vi.fn(), auth: vi.fn(), context: vi.fn(), revalidate: vi.fn(), after: [] as Array<() => Promise<void>> }));
vi.mock("next/server", () => ({ after: (task: () => Promise<void>) => mocks.after.push(task) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/auth", async (original) => ({ ...await original<typeof import("@/lib/auth")>(), requireUserId: mocks.auth }));
vi.mock("@/lib/data/client", async (original) => ({ ...await original<typeof import("@/lib/data/client")>(), dataContext: mocks.context }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => mocks.admin }));
vi.mock("./client", async (original) => ({ ...await original<typeof import("./client")>(), sendMessage: mocks.sent, editMessage: mocks.edited }));
import { deleteTransaction, restoreTransaction } from "@/app/actions/transactions";
import { handleUpdate, namedAccount } from "./handle";
import { clearMenuMetadata } from "./menu-cache";
import { refreshTelegramReports } from "./report-sync";

const USER = "11111111-2222-3333-4444-555555555555";
const OTHER = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const CHAT = 100;
type Row = Record<string, unknown>;
type Predicate = { key: string; operator: "eq" | "neq" | "is" | "gte" | "lt" | "lte" | "contains"; value: unknown };

function containsJson(actual: unknown, expected: Row): boolean {
  if (!actual || typeof actual !== "object") return false;
  return Object.entries(expected).every(([key, value]) => value && typeof value === "object"
    ? containsJson((actual as Row)[key], value as Row) : (actual as Row)[key] === value);
}

function orderValue(row: Row, key: string): unknown {
  const [column, field] = key.split("->>");
  return field ? (row[column] as Row | null)?.[field] : row[column];
}

/** In-memory PostgREST boundary: uniqueness and conditional updates are atomic. */
class TestDatabase {
  tables: Record<string, Row[]> = {
    profiles: [{ id: USER, telegram_chat_id: CHAT, base_currency: "USD", timezone: "Asia/Phnom_Penh" }],
    settings: [{ user_id: USER, default_account_id: "aba" }],
    account_balances: [
      { account_id: "aba", user_id: USER, name: "ABA USD", institution: "ABA", type: "bank", currency: "USD", is_active: true, include_in_net_worth: true, counts_toward_net_worth: true, current_balance: 100000, transaction_count: 0 },
      { account_id: "wing", user_id: USER, name: "Wing USD", institution: "Wing", type: "ewallet", currency: "USD", is_active: true, include_in_net_worth: true, counts_toward_net_worth: true, current_balance: 0, transaction_count: 0 },
      { account_id: "cash", user_id: USER, name: "Cash KHR", institution: null, type: "cash", currency: "KHR", is_active: true, include_in_net_worth: true, counts_toward_net_worth: true, current_balance: 0, transaction_count: 0 },
      { account_id: "foreign", user_id: OTHER, name: "Other wallet", institution: null, type: "bank", currency: "USD", is_active: true, include_in_net_worth: true, counts_toward_net_worth: true, current_balance: 999999, transaction_count: 0 },
    ],
    categories: [{ id: "coffee", user_id: USER, name: "Coffee", applies_to: ["expense"], deleted_at: null }],
    transactions: [], budgets: [], telegram_logs: [],
    exchange_rates: [
      { rate: "4000", base_currency: "USD", quote_currency: "KHR", as_of: "2026-10-09", source: "api", user_id: null },
      { rate: "4100", base_currency: "USD", quote_currency: "KHR", as_of: "2026-10-09", source: "manual", user_id: USER },
      { rate: "9999", base_currency: "USD", quote_currency: "KHR", as_of: "2026-10-09", source: "manual", user_id: OTHER },
    ],
  };
  constructor() {
    this.tables.accounts = this.tables.account_balances.map((row) => ({
      ...row, id: row.account_id, opening_balance: row.current_balance,
    }));
  }
  unsafeQueries: string[] = [];
  reads: string[] = [];
  walletReadGate: Promise<void> | null = null;
  claimGate: Promise<void> | null = null;
  rateReadGate: Promise<void> | null = null;
  failClaim = false;
  dropTransactionUpdates = false;
  sequence = 0;
  from(table: string) { return new TestQuery(this, table); }
}

class TestQuery {
  private operation: "select" | "insert" | "update" = "select";
  private payload: Row[] = [];
  private predicates: Predicate[] = [];
  private sorting: { key: string; ascending: boolean }[] = [];
  private maximum = Infinity;
  private offset = 0;
  private counted = false;
  private singular = false;
  constructor(private db: TestDatabase, private table: string) {}
  select(_columns?: string, options?: { count?: string }) { this.counted = options?.count === "exact"; return this; }
  insert(payload: Row | Row[]) { this.operation = "insert"; this.payload = Array.isArray(payload) ? payload : [payload]; return this; }
  update(payload: Row) { this.operation = "update"; this.payload = [payload]; return this; }
  eq(key: string, value: unknown) { this.predicates.push({ key, value, operator: "eq" }); return this; }
  neq(key: string, value: unknown) { this.predicates.push({ key, value, operator: "neq" }); return this; }
  contains(key: string, value: unknown) { this.predicates.push({ key, value, operator: "contains" }); return this; }
  is(key: string, value: unknown) { this.predicates.push({ key, value, operator: "is" }); return this; }
  gte(key: string, value: unknown) { this.predicates.push({ key, value, operator: "gte" }); return this; }
  lt(key: string, value: unknown) { this.predicates.push({ key, value, operator: "lt" }); return this; }
  lte(key: string, value: unknown) { this.predicates.push({ key, value, operator: "lte" }); return this; }
  order(key: string, options: { ascending: boolean }) { this.sorting.push({ key, ascending: options.ascending }); return this; }
  limit(count: number) { this.maximum = count; return this; }
  range(from: number, to: number) { this.offset = from; this.maximum = to - from + 1; return this; }
  single() { this.singular = true; return this; }
  maybeSingle() { this.singular = true; return this; }
  then<T>(resolve: (result: { data: unknown; error: { code: string; message: string } | null; count?: number | null }) => T) {
    if (this.operation === "select") this.db.reads.push(this.table);
    let result: { data: unknown; error: { code: string; message: string } | null; count?: number | null };
    if (this.operation !== "insert" && this.table !== "profiles" && !this.predicates.some((predicate) => predicate.key === "user_id")) {
      this.db.unsafeQueries.push(this.table);
      result = { data: null, error: { code: "TEST", message: "Missing user scope" } };
    } else if (this.operation === "insert") {
      const duplicate = this.table === "telegram_logs" && this.payload.some((row) => row.direction === "inbound" && row.update_id !== undefined && this.db.tables.telegram_logs.some((saved) => saved.direction === "inbound" && saved.update_id === row.update_id));
      if (duplicate || (this.db.failClaim && this.table === "telegram_logs" && this.payload[0].direction === "inbound")) {
        result = { data: null, error: { code: duplicate ? "23505" : "42703", message: "Cannot claim update" } };
      } else {
        const rows = this.payload.map((row) => ({ id: `row-${++this.db.sequence}`, created_at: new Date(Date.now() + this.db.sequence).toISOString(), consumed_at: null, deleted_at: null, ...row }));
        this.db.tables[this.table].push(...rows);
        result = { data: this.singular ? rows[0] : rows, error: null };
      }
    } else if (this.operation === "update" && this.table === "transactions" && this.db.dropTransactionUpdates) {
      result = { data: [], error: null };
    } else {
      const source: Row[] = this.table === "account_balances" ? this.db.tables.account_balances.map(row => {
        const account = this.db.tables.accounts.find(account => account.id === row.account_id)!;
        const ledger = this.db.tables.transactions.filter(transaction => transaction.account_id === row.account_id && transaction.user_id === row.user_id && transaction.deleted_at === null);
        return { ...row, is_active: account.is_active, current_balance: Number(account.opening_balance) + ledger.reduce((total, transaction) => total + Number(transaction.amount), 0), transaction_count: ledger.length };
      }) : this.db.tables[this.table];
      let rows = source.filter((row) => this.predicates.every(({ key, operator, value }) => {
        if (operator === "contains") return containsJson(row[key], value as Row);
        if (operator === "eq") return row[key] === value;
        if (operator === "neq") return row[key] !== value;
        if (operator === "is") return (row[key] ?? null) === value;
        if (operator === "gte") return String(row[key]) >= String(value);
        if (operator === "lte") return String(row[key]) <= String(value);
        return String(row[key]) < String(value);
      }));
      rows.sort((left, right) => {
        for (const { key, ascending } of this.sorting) {
          const comparison = String(orderValue(left, key)).localeCompare(String(orderValue(right, key)));
          if (comparison) return ascending ? comparison : -comparison;
        }
        return 0;
      });
      const count = this.counted ? rows.length : null;
      rows = rows.slice(this.offset, this.offset + Math.min(this.maximum, 1000));
      if (this.operation === "update") for (const row of rows) {
        Object.assign(row, this.payload[0]);
        if (this.table === "transactions") row.updated_at = new Date(Date.now() + ++this.db.sequence).toISOString();
      }
      result = { data: this.singular ? rows[0] ?? null : rows, error: null, count };
    }
    const ready = this.operation === "select" && this.table === "accounts" ? this.db.walletReadGate
      : this.operation === "select" && this.table === "exchange_rates" ? this.db.rateReadGate
      : this.operation === "insert" && this.table === "telegram_logs" && this.payload[0].direction === "inbound" ? this.db.claimGate : null;
    return (ready ?? Promise.resolve()).then(() => resolve(structuredClone(result)));
  }
}

let db: TestDatabase;
function update(id: number, text: string) {
  return { update_id: id, message: { message_id: id, text, chat: { id: CHAT, type: "private" }, from: { id: CHAT, is_bot: false } } };
}
beforeEach(() => {
  clearMenuMetadata();
  vi.useRealTimers(); vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "test-secret"); vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token");
  db = new TestDatabase(); mocks.admin = db;
  mocks.after = [];
  mocks.auth.mockReset().mockResolvedValue(USER);
  mocks.context.mockReset().mockResolvedValue({ userId: USER, supabase: db });
  mocks.revalidate.mockReset();
  mocks.edited.mockReset().mockResolvedValue({ ok: true });
  let messageId = 1000;
  mocks.sent.mockReset().mockImplementation(async () => ({ ok: true, messageId: ++messageId }));
});

describe("retry-safe Telegram ledger writes", () => {
  test("wallet selectors reuse metadata but selections and saves reject a newly closed wallet", async () => {
    await handleUpdate(update(1, "Expense"));
    db.reads = [];
    await handleUpdate(update(2, "Choose account"));
    await handleUpdate(update(3, "Back"));
    expect(db.reads).not.toContain("accounts");
    db.tables.accounts.find((a) => a.id === "aba")!.is_active = false;
    await handleUpdate(update(4, "5 coffee"));
    expect(db.reads).toContain("accounts");
    expect(db.tables.transactions).toHaveLength(0);
    expect(mocks.sent.mock.calls.at(-1)?.[1]).toContain("unavailable");
    await handleUpdate(update(5, "Use ABA USD (USD)"));
    expect(db.tables.transactions).toHaveLength(0);
    expect(mocks.sent.mock.calls.at(-1)?.[1]).toContain("unavailable");
    expect(db.unsafeQueries).toEqual([]);
  });
  test("Discard cancels only the preview, keeps the wallet, and cannot be confirmed later", async () => {
    await handleUpdate(update(1, "Use Wing USD (USD)"));
    await handleUpdate(update(2, "Spent 5 coffee"));
    expect(mocks.sent.mock.calls.at(-1)?.[1]).toContain("Wallet: Wing USD");
    expect(mocks.sent.mock.calls.at(-1)?.[2]).toEqual([["Save", "Discard"]]);
    await handleUpdate(update(3, "Discard"));
    expect(mocks.sent.mock.calls.at(-1)?.[1]).toContain("Expense · Wing USD · USD");
    await handleUpdate(update(4, "Save"));
    expect(db.tables.transactions).toHaveLength(0);
    await handleUpdate(update(5, "5 coffee"));
    expect(db.tables.transactions[0]).toMatchObject({ account_id: "wing", amount: -500 });
    expect(db.unsafeQueries).toEqual([]);
  });
  test("Save restores the focused entry controls after committing the preview", async () => {
    await handleUpdate(update(1, "Use Wing USD (USD)"));
    await handleUpdate(update(2, "Spent 5 coffee"));
    await Promise.all([handleUpdate(update(3, "Save")), handleUpdate(update(3, "Save"))]);
    expect(db.tables.transactions).toHaveLength(1);
    expect(mocks.sent.mock.calls.at(-1)?.[1]).toContain("Next: <b>Expense · Wing USD · USD");
    expect(mocks.sent.mock.calls.at(-1)?.[2]?.flat()).toContain("Income");
    expect(db.unsafeQueries).toEqual([]);
  });
  test("one Expense tap selects the preferred wallet and the next message saves without another selector", async () => {
    db.tables.settings[0].default_account_id = "wing";
    await handleUpdate(update(1, "Expense"));
    expect(mocks.sent.mock.calls.at(-1)?.[1]).toContain("Expense · Wing USD · USD");
    expect(db.tables.transactions).toHaveLength(0);
    await handleUpdate(update(2, "5 coffee"));
    expect(db.tables.transactions).toMatchObject([{ account_id: "wing", amount: -500, currency: "USD" }]);
    expect(mocks.sent.mock.calls.at(-1)?.[1]).toContain("Next: <b>Expense · Wing USD · USD");
    expect(mocks.sent.mock.calls.at(-1)?.[2]?.flat()).toContain("Income");
    await handleUpdate(update(3, "3 coffee"));
    expect(db.tables.transactions).toHaveLength(2);
    expect(db.unsafeQueries).toEqual([]);
  });
  test("a preferred KHR wallet supplies its zero-decimal currency and Income stays in the chosen wallet", async () => {
    db.tables.settings[0].default_account_id = "cash";
    await handleUpdate(update(1, "Expense"));
    expect(mocks.sent.mock.calls.at(-1)?.[1]).toContain("Cash KHR · KHR");
    await handleUpdate(update(2, "6000 coffee"));
    await handleUpdate(update(3, "Income"));
    await handleUpdate(update(4, "60000 salary"));
    expect(db.tables.transactions).toMatchObject([
      { account_id: "cash", amount: -6000, currency: "KHR" },
      { account_id: "cash", amount: 60000, currency: "KHR", type: "income" },
    ]);
  });
  test("wallet shortcuts switch account and currency in one tap without a Choose account step", async () => {
    await handleUpdate(update(1, "Expense"));
    const shortcuts = mocks.sent.mock.calls.at(-1)?.[2]?.flat();
    expect(shortcuts).toContain("Use Cash KHR (KHR)");
    await handleUpdate(update(2, "Use Cash KHR (KHR)"));
    expect(mocks.sent.mock.calls.at(-1)?.[1]).toContain("Expense · Cash KHR · KHR");
    await handleUpdate(update(3, "6000 lunch"));
    expect(db.tables.transactions[0]).toMatchObject({ account_id: "cash", currency: "KHR", amount: -6000 });
    expect(db.unsafeQueries).toEqual([]);
  });
  test("the wallet selector uses two columns and Back restores the current entry without changing it", async () => {
    await handleUpdate(update(1, "Income"));
    await handleUpdate(update(2, "Choose account"));
    expect(mocks.sent.mock.calls.at(-1)?.[1]).toContain("Current: ABA USD · USD");
    expect(mocks.sent.mock.calls.at(-1)?.[2]?.[0]).toEqual(["Use ABA USD (USD)", "Use Wing USD (USD)"]);
    await handleUpdate(update(3, "More"));
    expect(mocks.sent.mock.calls.at(-1)?.[2]?.flat()).toContain("Transfer");
    await handleUpdate(update(4, "Back"));
    expect(mocks.sent.mock.calls.at(-1)?.[1]).toContain("Income · ABA USD · USD");
    await handleUpdate(update(5, "20 gift"));
    expect(db.tables.transactions[0]).toMatchObject({ account_id: "aba", type: "income", amount: 2000 });
  });
  test("an explicit currency can override an automatic wallet, while a manually chosen wallet stays fixed", async () => {
    await handleUpdate(update(1, "Expense KHR"));
    await handleUpdate(update(2, "$5 coffee"));
    expect(db.tables.transactions[0]).toMatchObject({ account_id: "aba", currency: "USD", amount: -500 });
    await handleUpdate(update(3, "Use Cash KHR (KHR)"));
    await handleUpdate(update(4, "Income"));
    await handleUpdate(update(5, "$10 gift"));
    expect(db.tables.transactions).toHaveLength(1);
    expect(mocks.sent.mock.calls.at(-1)?.[1]).toContain("does not hold USD");
  });
  test("an unavailable currency clears entry mode instead of leaving the previous wallet active", async () => {
    await handleUpdate(update(1, "Expense"));
    db.tables.accounts.find((account) => account.id === "cash")!.is_active = false;
    await handleUpdate(update(2, "Expense KHR"));
    expect(mocks.sent.mock.calls.at(-1)?.[1]).toContain("no active KHR wallet");
    await handleUpdate(update(3, "5 coffee"));
    expect(db.tables.transactions).toHaveLength(0);
    expect(mocks.sent.mock.calls.at(-1)?.[2]).toEqual([["Save", "Discard"]]);
  });
  test("quick entry with no active wallets explains how to start and never saves money", async () => {
    db.tables.accounts.forEach((account) => { account.is_active = false; });
    await handleUpdate(update(1, "Income"));
    expect(mocks.sent.mock.calls.at(-1)?.[1]).toContain("Add an account in the app first");
    expect(db.tables.transactions).toHaveLength(0);
  });
  test("wallet data loads while the durable claim is in flight, but no money is saved before it succeeds", async () => {
    let release!: () => void;
    db.claimGate = new Promise<void>((resolve) => { release = resolve; });
    const handling = handleUpdate(update(1, "Spent $5 coffee"));
    await vi.waitFor(() => expect(db.reads).toContain("accounts"));
    expect(db.tables.transactions).toHaveLength(0);
    expect(mocks.sent).not.toHaveBeenCalled();
    release();
    await handling;
    expect(db.tables.transactions).toHaveLength(1);
    expect(db.unsafeQueries).toEqual([]);
  });
  test("summary transactions load while exchange rates are in flight", async () => {
    let release!: () => void;
    db.rateReadGate = new Promise<void>((resolve) => { release = resolve; });
    const handling = handleUpdate(update(1, "Summary month"));
    await vi.waitFor(() => expect(db.reads).toContain("transactions"));
    expect(mocks.sent).not.toHaveBeenCalled();
    release();
    await handling;
    expect(mocks.sent.mock.calls.at(-1)?.[1]).toContain("This month");
    expect(db.unsafeQueries).toEqual([]);
  });
  test.each([
    ["Cancel", []], ["Undo", ["transactions"]], ["Rate", ["exchange_rates"]],
    ["Accounts", ["settings", "account_balances", "transactions"]], ["Recent", ["accounts", "transactions"]],
    ["Expense USD", ["settings", "accounts"]], ["Expense", ["settings", "accounts"]], ["Choose account", ["accounts"]],
    ["Summary month", ["exchange_rates", "transactions"]],
  ])("%s only reads the data its answer needs", async (command, tables) => {
    await handleUpdate(update(1, command));
    expect(db.reads.filter((table) => table === "profiles")).toHaveLength(1);
    expect(new Set(db.reads.filter((table) => !["profiles", "telegram_logs"].includes(table))))
      .toEqual(new Set(tables));
    expect(db.unsafeQueries).toEqual([]);
  });
  test("webhook replies follow a committed save and do not wait for outbound audit logging", async () => {
    const deliver = vi.fn(async () => {
      expect(db.tables.transactions).toHaveLength(1);
      return { ok: true, viaWebhook: true as const };
    });
    await handleUpdate(update(1, "Spent $5 coffee"), deliver);
    await handleUpdate(update(1, "Spent $5 coffee"), deliver);
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(mocks.sent).not.toHaveBeenCalled();
    expect(db.tables.telegram_logs.find((row) => row.direction === "inbound")?.transaction_id).toBeUndefined();
    expect(db.tables.telegram_logs.filter((row) => row.direction === "outbound")).toHaveLength(0);
    await Promise.all(mocks.after.map((task) => task()));
    expect(db.tables.telegram_logs).toEqual(expect.arrayContaining([
      expect.objectContaining({ direction: "inbound", transaction_id: db.tables.transactions[0].id }),
      expect.objectContaining({ direction: "outbound", user_id: USER, parsed: { delivery: "webhook-response-unverified" } }),
    ]));
    expect(db.unsafeQueries).toEqual([]);
  });
  test("an unverified webhook reply cannot activate a confirmation", async () => {
    const deliver = vi.fn().mockResolvedValue({ ok: true, viaWebhook: true });
    mocks.sent.mockResolvedValue({ ok: false, error: "Delivery failed" });
    await handleUpdate(update(1, "Spent 5 coffee"), deliver);
    expect(mocks.sent).toHaveBeenCalledOnce();
    expect(deliver).not.toHaveBeenCalled();
    await handleUpdate(update(2, "Yes"), deliver);
    expect(db.tables.transactions).toHaveLength(0);
    expect(deliver.mock.calls.at(-1)?.[1]).toContain("nothing waiting");
    expect(db.unsafeQueries).toEqual([]);
  });
  test("one mode selection supports repeated quick entries, currency override and safe cancellation", async () => {
    await handleUpdate(update(1, "Expense KHR"));
    await Promise.all([handleUpdate(update(2, "6000 coffee")), handleUpdate(update(2, "6000 coffee"))]);
    await handleUpdate(update(3, "$5 coffee"));
    await handleUpdate(update(4, "Income USD"));
    await handleUpdate(update(5, "600 salary"));
    expect(db.tables.transactions).toMatchObject([
      { user_id: USER, account_id: "cash", amount: -6000, currency: "KHR" },
      { user_id: USER, account_id: "aba", amount: -500, currency: "USD" },
      { user_id: USER, account_id: "aba", amount: 60000, currency: "USD", type: "income" },
    ]);
    await handleUpdate(update(6, "Cancel"));
    await handleUpdate(update(7, "5 coffee"));
    expect(db.tables.transactions).toHaveLength(3);
    expect(mocks.sent.mock.calls.at(-1)?.[1]).toContain("Save");
    expect(db.unsafeQueries).toEqual([]);
  });
  test("wallet buttons select the account for expenses and incomes, including quick and explicit entries", async () => {
    await handleUpdate(update(1, "Expense USD"));
    expect(mocks.sent.mock.calls.at(-1)?.[2]?.flat()).toContain("Use Wing USD (USD)");
    expect(JSON.stringify(mocks.sent.mock.calls.at(-1)?.[2])).not.toContain("Other wallet");
    expect(mocks.sent.mock.calls.at(-1)?.[2]?.flat()).toContain("Use Cash KHR (KHR)");
    await handleUpdate(update(2, "Use Wing USD (USD)"));
    await Promise.all([handleUpdate(update(3, "5 coffee")), handleUpdate(update(3, "5 coffee"))]);
    await handleUpdate(update(4, "Income USD"));
    await handleUpdate(update(5, "600 salary"));
    await handleUpdate(update(6, "+$20 gift"));
    await handleUpdate(update(7, "Expense $2 coffee from ABA USD"));
    expect(db.tables.transactions).toMatchObject([
      { account_id: "wing", type: "expense", amount: -500 },
      { account_id: "wing", type: "income", amount: 60000 },
      { account_id: "wing", type: "income", amount: 2000 },
      { account_id: "aba", type: "expense", amount: -200 },
    ]);
    expect(db.reads).not.toContain("account_balances");
    expect(db.unsafeQueries).toEqual([]);
  });
  test("selected wallet currency is explicit and a closed or incompatible wallet never falls back", async () => {
    await handleUpdate(update(1, "Income KHR"));
    await handleUpdate(update(2, "Use Cash KHR (KHR)"));
    await handleUpdate(update(3, "6000 gift"));
    expect(db.tables.transactions[0]).toMatchObject({ account_id: "cash", amount: 6000, currency: "KHR", type: "income" });
    await handleUpdate(update(4, "Expense $5 coffee"));
    expect(db.tables.transactions).toHaveLength(1);
    expect(mocks.sent.mock.calls.at(-1)?.[1]).toContain("does not hold USD");
    db.tables.accounts.find((row) => row.id === "cash")!.is_active = false;
    await handleUpdate(update(5, "6000 gift"));
    expect(db.tables.transactions).toHaveLength(1);
    await handleUpdate(update(6, "Use Other wallet (USD)"));
    expect(mocks.sent.mock.calls.at(-1)?.[1]).toContain("unavailable");
    expect(db.unsafeQueries).toEqual([]);
  });
  test("account switching discards old confirmations and Cancel clears the wallet", async () => {
    await handleUpdate(update(1, "Spent 5 coffee"));
    await handleUpdate(update(2, "Use Wing USD (USD)"));
    await handleUpdate(update(3, "Yes"));
    expect(db.tables.transactions).toHaveLength(0);
    await handleUpdate(update(4, "Cancel"));
    await handleUpdate(update(5, "Spent $5 coffee"));
    expect(db.tables.transactions[0]).toMatchObject({ account_id: "aba" });
  });
  test("confirmations use lightweight account reads and keep the offered wallet fixed", async () => {
    await handleUpdate(update(1, "Use Wing USD (USD)"));
    await handleUpdate(update(2, "Spent 5 coffee"));
    expect(mocks.sent.mock.calls.at(-1)?.[1]).toContain("Wing USD");
    db.tables.settings[0].default_account_id = "cash";
    await handleUpdate(update(3, "Yes"));
    expect(db.tables.transactions[0]).toMatchObject({ account_id: "wing", amount: -500 });
    expect(db.reads).not.toContain("account_balances");
    expect(db.reads).not.toContain("exchange_rates");
    expect(db.unsafeQueries).toEqual([]);
  });
  test("a quick-entry mode still loads the real conversion rate when it changes the initial currency guess", async () => {
    await handleUpdate(update(1, "Income KHR"));
    await handleUpdate(update(2, "Use Cash KHR (KHR)"));
    await handleUpdate(update(3, "500 gift"));
    expect(db.tables.transactions[0]).toMatchObject({ amount: 500, currency: "KHR", account_id: "cash", exchange_rate: 1 / 4100, base_amount: 12 });
    expect(db.reads).toContain("exchange_rates");
  });
  test("a message arriving during wallet selection cannot save into the previous or default wallet", async () => {
    let release!: () => void;
    db.walletReadGate = new Promise<void>((resolve) => { release = resolve; });
    const selecting = handleUpdate(update(1, "Use Wing USD (USD)"));
    await vi.waitFor(() => expect(db.reads).toContain("accounts"));
    await handleUpdate(update(2, "Spent $5 coffee"));
    expect(db.tables.transactions).toHaveLength(0);
    release();
    await selecting;
    db.walletReadGate = null;
    await handleUpdate(update(3, "Spent $5 coffee"));
    expect(db.tables.transactions[0]).toMatchObject({ account_id: "wing" });
    expect(db.unsafeQueries).toEqual([]);
  });
  test("expired and foreign entry modes cannot silently choose currency or direction", async () => {
    db.tables.telegram_logs.push(
      { id: "expired", user_id: USER, chat_id: CHAT, direction: "inbound", created_at: new Date(Date.now() - 11 * 60_000).toISOString(), parsed: { kind: "entry", mode: { type: "income", currency: "USD" } } },
      { id: "foreign-mode", user_id: OTHER, chat_id: CHAT, direction: "inbound", created_at: new Date().toISOString(), parsed: { kind: "entry", mode: { type: "income", currency: "USD" } } },
    );
    await handleUpdate(update(1, "5 coffee"));
    expect(db.tables.transactions).toHaveLength(0);
    expect(mocks.sent.mock.calls.at(-1)?.[1]).toContain("expense");
    expect(db.unsafeQueries).toEqual([]);
  });
  test("concurrent duplicate deliveries create one signed expense even if replies fail", async () => {
    mocks.sent.mockResolvedValue({ ok: false, error: "Delivery failed" });
    await Promise.all([handleUpdate(update(1, "Spent $5 coffee")), handleUpdate(update(1, "Spent $5 coffee"))]);
    expect(db.tables.transactions).toHaveLength(1);
    expect(db.tables.transactions[0]).toMatchObject({ user_id: USER, account_id: "aba", amount: -500, currency: "USD", created_via: "telegram" });
    expect(db.tables.telegram_logs.filter((row) => row.direction === "inbound")).toHaveLength(1);
    expect(db.unsafeQueries).toEqual([]);
  });
  test("two Yes messages consume a pending guess only once", async () => {
    await handleUpdate(update(1, "Spent 5 coffee"));
    expect(db.tables.transactions).toHaveLength(0);
    await Promise.all([handleUpdate(update(2, "Yes")), handleUpdate(update(3, "Yes"))]);
    expect(db.tables.transactions).toHaveLength(1);
    await handleUpdate(update(4, "Yes"));
    expect(db.tables.transactions).toHaveLength(1);
    expect(db.unsafeQueries).toEqual([]);
  });
  test("a resolved latest offer never revives an older unconfirmed message", async () => {
    await handleUpdate(update(1, "Spent 5 coffee"));
    await handleUpdate(update(2, "Spent 6 lunch"));
    await handleUpdate(update(3, "No"));
    await handleUpdate(update(4, "Yes"));
    expect(db.tables.transactions).toHaveLength(0);
  });
  test("a currency-correct replacement discards its old guessed offer", async () => {
    await handleUpdate(update(1, "Spent 5 coffee"));
    await handleUpdate(update(2, "Spent $5 coffee"));
    await handleUpdate(update(3, "Yes"));
    expect(db.tables.transactions).toHaveLength(1);
  });
  test("a missing delivery-safety migration refuses writes", async () => {
    db.failClaim = true;
    await handleUpdate(update(1, "Income $600 salary"));
    expect(db.tables.transactions).toHaveLength(0);
    expect(mocks.sent.mock.calls[0][1]).toContain("Nothing was saved");
  });
  test("an explicit unknown account never falls back to the default", async () => {
    await handleUpdate(update(1, "Expense $5 coffee from Typo"));
    await handleUpdate(update(2, "Transfer $10 Typo to Wing"));
    expect(db.tables.transactions).toHaveLength(0);
  });
  test("income and riel expenses keep their integer scale and account currency", async () => {
    await handleUpdate(update(1, "Income $600 salary"));
    await handleUpdate(update(2, "Expense 12000 riel lunch from Cash KHR"));
    expect(db.tables.transactions).toEqual(expect.arrayContaining([
      expect.objectContaining({ amount: 60000, currency: "USD", type: "income" }),
      expect.objectContaining({ amount: -12000, currency: "KHR", account_id: "cash", base_amount: -293 }),
    ]));
  });
  test("a transfer inserts both legs together using the user's actual received amount", async () => {
    await handleUpdate(update(1, "Transfer $10 ABA to Cash received 40500 riel"));
    expect(db.tables.transactions).toHaveLength(2);
    const [out, incoming] = db.tables.transactions;
    expect(out).toMatchObject({ user_id: USER, amount: -1000, currency: "USD", type: "transfer" });
    expect(incoming).toMatchObject({ user_id: USER, amount: 40500, currency: "KHR", type: "transfer" });
    expect(out.transfer_group_id).toBe(incoming.transfer_group_id);
    expect(db.unsafeQueries).toEqual([]);
  });
  test("estimated cross-currency transfers show the user's own quote before saving", async () => {
    await handleUpdate(update(1, "Transfer $10 ABA to Cash"));
    expect(db.tables.transactions).toHaveLength(0);
    expect(mocks.sent.mock.calls[0][1]).toContain("41,000");
    await handleUpdate(update(2, "Yes"));
    expect(db.tables.transactions[1]).toMatchObject({ amount: 41000, currency: "KHR" });
  });
  test("retrying Undo never deletes a second transaction", async () => {
    await handleUpdate(update(1, "Expense $5 coffee"));
    await handleUpdate(update(2, "Expense $6 lunch"));
    await handleUpdate(update(3, "Undo")); await handleUpdate(update(3, "Undo"));
    expect(db.tables.transactions.filter((row) => row.deleted_at === null)).toHaveLength(1);
  });
  test("unlinked chats cannot read or write the ledger", async () => {
    db.tables.profiles = [];
    await handleUpdate(update(1, "Accounts")); await handleUpdate(update(2, "Income $600 salary"));
    expect(db.tables.transactions).toHaveLength(0);
    expect(mocks.sent.mock.calls.every((call) => !String(call[1]).includes("Other wallet"))).toBe(true);
  });
  test("account summaries exclude another user's balance", async () => {
    await handleUpdate(update(1, "Accounts"));
    expect(mocks.sent.mock.calls[0][1]).toContain("ABA USD");
    expect(mocks.sent.mock.calls[0][1]).not.toContain("Other wallet");
    expect(db.unsafeQueries).toEqual([]);
  });
  test.each(["Summary month", "Budgets"])("%s includes all spending beyond the API row cap", async (command) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-09T12:00:00Z"));
    db.tables.budgets = [{ id: "budget", user_id: USER, name: "Monthly", amount: 200000,
      currency: "USD", period: "monthly", starts_on: "2026-10-01", alert_threshold: "0.8", is_active: true }];
    const transaction = { user_id: USER, account_id: "aba", category_id: "coffee", type: "expense",
      amount: -100, currency: "USD", occurred_at: "2026-10-05T12:00:00Z", deleted_at: null, created_via: "telegram" };
    db.tables.transactions = Array.from({ length: 1205 }, (_, index) => ({ ...transaction, id: `expense-${index}` }));
    db.tables.transactions.push({ ...transaction, id: "other", user_id: OTHER, amount: -999999 });
    await handleUpdate(update(1, command));
    expect(mocks.sent.mock.calls[0][1]).toContain("$1,205.00");
    expect(db.unsafeQueries).toEqual([]);
    vi.useRealTimers();
  });
});

describe("web and Telegram ledger consistency", () => {
  const DELETED = "10101010-1010-4010-8010-101010101010";
  const REMAINING = "20202020-2020-4020-8020-202020202020";
  const FOREIGN = "30303030-3030-4030-8030-303030303030";

  function ledger(currency: "USD" | "KHR" = "USD") {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-10T09:00:00Z"));
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-role");
    db.tables.profiles[0].base_currency = currency;
    const common = { user_id: USER, account_id: currency === "USD" ? "aba" : "cash", category_id: "coffee", type: "expense", currency,
      occurred_at: "2026-10-10T02:00:00Z", updated_at: "2026-10-10T02:00:00Z", deleted_at: null, created_via: "telegram" };
    db.tables.transactions = [
      { ...common, id: DELETED, amount: currency === "USD" ? -500 : -4000, notes: "delete-me-web" },
      { ...common, id: REMAINING, amount: currency === "USD" ? -700 : -12000, notes: "keep-me-web" },
      { ...common, id: FOREIGN, user_id: OTHER, account_id: "foreign", notes: "private-other-user", amount: -999999 },
    ];
    db.tables.budgets = [{ id: "budget", user_id: USER, category_id: "coffee", name: "Coffee budget", amount: 100000, currency,
      period: "monthly", starts_on: "2026-10-01", alert_threshold: "0.8", is_active: true, deleted_at: null }];
  }

  async function finishBackground() {
    for (const task of mocks.after.splice(0)) await task();
  }

  test("a 6000 riel coffee summary waiting on rates cannot arrive stale after a web deletion", async () => {
    ledger();
    db.tables.transactions = [{ ...db.tables.transactions[0], amount: -6000, currency: "KHR", account_id: "cash", notes: "coffee" }];
    db.tables.exchange_rates.find(row => row.user_id === USER)!.rate = "4050";
    let release!: () => void;
    db.rateReadGate = new Promise<void>(resolve => { release = resolve; });
    const summary = handleUpdate(update(1, "Summary today"));
    await vi.waitFor(() => expect(db.reads).toContain("exchange_rates"));
    db.rateReadGate = null;
    expect((await deleteTransaction(DELETED)).ok).toBe(true);
    await finishBackground();
    release();
    await summary;
    const reply = mocks.sent.mock.calls.at(-1)?.[1];
    expect(reply).toContain("Out: $0.00");
    expect(reply).toContain("0 transactions");
    expect(reply).not.toContain("$1.48");
    expect(db.unsafeQueries).toEqual([]);
  });

  test("a deletion during delivery repairs the 6000 riel coffee reply once its message id exists", async () => {
    ledger();
    db.tables.transactions = [{ ...db.tables.transactions[0], amount: -6000, currency: "KHR", account_id: "cash", notes: "coffee" }];
    db.tables.exchange_rates.find(row => row.user_id === USER)!.rate = "4050";
    let release!: () => void;
    const sending = new Promise<void>(resolve => { release = resolve; });
    mocks.sent.mockImplementationOnce(async () => { await sending; return { ok: true, messageId: 2000 }; });
    const summary = handleUpdate(update(1, "Summary today"));
    await vi.waitFor(() => expect(mocks.sent).toHaveBeenCalledTimes(1));
    expect(mocks.sent.mock.calls[0][1]).toContain("Out: $1.48");
    expect((await deleteTransaction(DELETED)).ok).toBe(true);
    await finishBackground();
    expect(mocks.edited).not.toHaveBeenCalled();
    release();
    await summary;
    expect(mocks.after).toHaveLength(1);
    await finishBackground();
    expect(mocks.edited).toHaveBeenCalledWith(CHAT, 2000, expect.stringContaining("Out: $0.00"));
    expect(mocks.edited.mock.calls[0][2]).toContain("0 transactions");
    expect(db.unsafeQueries).toEqual([]);
  });

  test.each([
    ["Summary month", "Out: $0.00"], ["Recent", "no transactions"],
    ["Budgets", "$0.00 of"], ["Accounts", "0៛"],
  ])("%s waiting for its inbound claim rereads a deleted coffee entry", async (command, expected) => {
    ledger();
    db.tables.transactions = [{ ...db.tables.transactions[0], amount: -6000, currency: "KHR", account_id: "cash", notes: "coffee" }];
    db.tables.exchange_rates.find(row => row.user_id === USER)!.rate = "4050";
    let release!: () => void;
    db.claimGate = new Promise<void>(resolve => { release = resolve; });
    const reporting = handleUpdate(update(1, command));
    await vi.waitFor(() => expect(db.reads).toContain(command === "Accounts" ? "account_balances" : command === "Recent" ? "accounts" : "exchange_rates"));
    expect((await deleteTransaction(DELETED)).ok).toBe(true);
    await finishBackground();
    release();
    await reporting;
    const reply = mocks.sent.mock.calls.at(-1)?.[1];
    expect(reply).toContain(expected);
    expect(reply).not.toContain("6,000");
    expect(reply).not.toContain("$1.48");
    expect(db.unsafeQueries).toEqual([]);
  });

  test.each(["USD", "KHR"] as const)("a web delete and restore update %s summaries, history, budgets, and balances", async currency => {
    ledger(currency);
    const total = currency === "USD" ? "$12.00" : "16,000៛";
    const remaining = currency === "USD" ? "$7.00" : "12,000៛";
    for (const [id, command] of ["Summary today", "Summary month", "Recent", "Budgets", "Accounts"].entries()) {
      await handleUpdate(update(id + 1, command));
    }
    expect(mocks.sent.mock.calls[0][1]).toContain(`Out: ${total}`);
    expect(mocks.sent.mock.calls[2][1]).toContain("delete-me-web");
    const originalBalances = mocks.sent.mock.calls[4][1];
    mocks.sent.mockClear();
    expect(await deleteTransaction(DELETED)).toEqual({ ok: true, data: undefined });
    expect(db.tables.transactions[0].deleted_at).not.toBeNull();
    expect(db.tables.transactions[2].deleted_at).toBeNull();
    expect(mocks.edited).not.toHaveBeenCalled();
    await finishBackground();
    expect(mocks.sent).not.toHaveBeenCalled();
    expect(mocks.edited).toHaveBeenCalledTimes(5);
    const edited = mocks.edited.mock.calls.map(call => call[2] as string);
    expect(edited.filter(text => text.includes(`Out: ${remaining}`))).toHaveLength(2);
    expect(edited.find(text => text.includes("Recent transactions"))).not.toContain("delete-me-web");
    expect(edited.find(text => text.includes("Budget progress"))).toContain(`${remaining} of`);
    expect(edited.find(text => text.includes("Your accounts"))).not.toBe(originalBalances);
    expect(edited.join("\n")).not.toContain("private-other-user");
    for (const [id, command] of ["Summary today", "Summary month", "Recent", "Budgets"].entries()) {
      await handleUpdate(update(id + 20, command));
    }
    expect(mocks.sent.mock.calls[0][1]).toContain(`Out: ${remaining}`);
    expect(mocks.sent.mock.calls[1][1]).toContain("1 transaction");
    expect(mocks.sent.mock.calls[2][1]).not.toContain("delete-me-web");
    expect(mocks.sent.mock.calls[3][1]).toContain(`${remaining} of`);
    expect(await restoreTransaction(DELETED)).toEqual({ ok: true, data: undefined });
    mocks.edited.mockClear();
    await finishBackground();
    const restored = mocks.edited.mock.calls.map(call => call[2] as string);
    expect(restored.filter(text => text.includes(`Out: ${total}`))).toHaveLength(2);
    expect(restored.find(text => text.includes("Recent transactions"))).toContain("delete-me-web");
    expect(restored.find(text => text.includes("Your accounts"))).toBe(originalBalances);
    expect(db.unsafeQueries).toEqual([]);
  });

  test("a legacy webhook reply is replaced by one current overview that subsequent changes edit", async () => {
    ledger();
    db.tables.telegram_logs.push({ id: "legacy", user_id: USER, chat_id: CHAT, direction: "outbound", message_text: "Out: $12.00", parsed: null, error_message: null, created_at: "2026-10-10T03:00:00Z" });
    expect((await deleteTransaction(DELETED)).ok).toBe(true);
    await finishBackground();
    expect(mocks.sent).toHaveBeenCalledTimes(1);
    expect(mocks.sent.mock.calls[0][1]).toContain("Updated from the web");
    expect(mocks.sent.mock.calls[0][1]).toContain("Out: $7.00");
    expect(mocks.sent.mock.calls[0][1]).not.toContain("delete-me-web");
    expect((await restoreTransaction(DELETED)).ok).toBe(true);
    await finishBackground();
    expect(mocks.sent).toHaveBeenCalledTimes(1);
    expect(mocks.edited.mock.calls[0][2]).toContain("Out: $12.00");
    expect(mocks.edited.mock.calls[0][2]).toContain("delete-me-web");
  });

  test("both transfer legs disappear from Telegram and a foreign group member stays untouched", async () => {
    ledger();
    const group = "40404040-4040-4040-8040-404040404040";
    db.tables.transactions[0] = { ...db.tables.transactions[0], type: "transfer", transfer_group_id: group, amount: -500 };
    db.tables.transactions[1] = { ...db.tables.transactions[1], type: "transfer", transfer_group_id: group, account_id: "wing", amount: 500 };
    db.tables.transactions[2].transfer_group_id = group;
    await handleUpdate(update(1, "Recent"));
    expect((await deleteTransaction(DELETED)).ok).toBe(true);
    await finishBackground();
    expect(db.tables.transactions.slice(0, 2).every(row => row.deleted_at !== null)).toBe(true);
    expect(db.tables.transactions[2].deleted_at).toBeNull();
    expect(mocks.edited.mock.calls[0][2]).toContain("no transactions");
    expect((await restoreTransaction(REMAINING)).ok).toBe(true);
    await finishBackground();
    expect(db.tables.transactions.slice(0, 2).every(row => row.deleted_at === null)).toBe(true);
    expect(mocks.edited.mock.calls.at(-1)?.[2]).toContain("transfer");
    expect(db.unsafeQueries).toEqual([]);
  });

  test("zero affected rows never claim success or schedule a Telegram update", async () => {
    ledger(); db.dropTransactionUpdates = true;
    expect((await deleteTransaction(DELETED)).ok).toBe(false);
    expect((await restoreTransaction(DELETED)).ok).toBe(false);
    expect(db.tables.transactions[0].deleted_at).toBeNull();
    expect(mocks.after).toHaveLength(0);
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  test("anonymous and foreign-row deletes cannot change the ledger or Telegram", async () => {
    ledger(); mocks.auth.mockRejectedValueOnce(new Error("Sign in"));
    expect((await deleteTransaction(DELETED)).ok).toBe(false);
    expect((await deleteTransaction(FOREIGN)).ok).toBe(false);
    expect((await restoreTransaction(FOREIGN)).ok).toBe(false);
    expect(db.tables.transactions.every(row => row.deleted_at === null)).toBe(true);
    expect(mocks.after).toHaveLength(0);
  });

  test("a disconnected or relinked chat never receives another owner's financial reports", async () => {
    ledger(); db.tables.profiles[0].telegram_chat_id = null;
    expect((await deleteTransaction(DELETED)).ok).toBe(true);
    await finishBackground();
    expect(mocks.sent).not.toHaveBeenCalled(); expect(mocks.edited).not.toHaveBeenCalled();
    db.tables.profiles[0].telegram_chat_id = CHAT + 1;
    db.tables.telegram_logs.push({ user_id: USER, chat_id: CHAT, direction: "outbound", error_message: null, message_text: "Old chat", created_at: "2026-10-10T03:00:00Z",
      parsed: { kind: "report", messageId: 99, request: { kind: "recent" }, at: "2026-10-10T03:00:00Z" } });
    db.tables.telegram_logs.push({ user_id: OTHER, chat_id: CHAT + 1, direction: "outbound", error_message: null, message_text: "Foreign", created_at: "2026-10-10T03:00:00Z",
      parsed: { kind: "report", messageId: 98, request: { kind: "recent" }, at: "2026-10-10T03:00:00Z" } });
    await refreshTelegramReports(USER);
    expect(mocks.edited).not.toHaveBeenCalled();
    expect(mocks.sent.mock.calls[0][0]).toBe(CHAT + 1);
    expect(mocks.sent.mock.calls[0][1]).not.toContain("private-other-user");
    expect(db.unsafeQueries).toEqual([]);
  });

  test.each([null, CHAT + 1])("a chat unlinked during report reads (%s) receives no background data", async chatId => {
    ledger(); await handleUpdate(update(1, "Summary today"));
    mocks.sent.mockClear(); db.reads = [];
    let release!: () => void;
    db.rateReadGate = new Promise<void>(resolve => { release = resolve; });
    expect((await deleteTransaction(DELETED)).ok).toBe(true);
    const refreshing = finishBackground();
    await vi.waitFor(() => expect(db.reads).toContain("exchange_rates"));
    db.tables.profiles[0].telegram_chat_id = chatId;
    release();
    await refreshing;
    expect(mocks.sent).not.toHaveBeenCalled();
    expect(mocks.edited).not.toHaveBeenCalled();
    expect(db.tables.transactions[0].deleted_at).not.toBeNull();
    expect(db.unsafeQueries).toEqual([]);
  });

  test("Telegram delivery failure cannot roll back or disguise a committed deletion", async () => {
    ledger(); await handleUpdate(update(1, "Summary today"));
    mocks.edited.mockResolvedValue({ ok: false, error: "Delivery failed" });
    expect((await deleteTransaction(DELETED)).ok).toBe(true);
    await finishBackground();
    expect(db.tables.transactions[0].deleted_at).not.toBeNull();
    expect(db.tables.telegram_logs.some(row => row.error_message === "Delivery failed")).toBe(true);
  });

  test("a deleted Telegram message gets a new report rather than leaving stale data", async () => {
    ledger(); await handleUpdate(update(1, "Recent"));
    mocks.edited.mockResolvedValueOnce({ ok: false, missing: true });
    expect((await deleteTransaction(DELETED)).ok).toBe(true);
    await finishBackground();
    expect(mocks.sent).toHaveBeenCalledTimes(3);
    expect(mocks.sent.mock.calls[2][1]).not.toContain("delete-me-web");
    expect((await restoreTransaction(DELETED)).ok).toBe(true);
    await finishBackground();
    expect(mocks.edited.mock.calls.some(call => call[1] === 1003)).toBe(true);
  });

  test("a concurrent web deletion during delivery cannot leave the final report behind", async () => {
    ledger(); await handleUpdate(update(1, "Summary today"));
    mocks.edited.mockImplementationOnce(async () => {
      db.tables.transactions[1].deleted_at = "2026-10-10T09:01:00Z";
      db.tables.transactions[1].updated_at = "2026-10-10T09:01:00Z";
      return { ok: true };
    });
    expect((await deleteTransaction(DELETED)).ok).toBe(true);
    await finishBackground();
    expect(mocks.edited).toHaveBeenCalledTimes(3);
    expect(mocks.edited.mock.calls.at(-1)?.[2]).toContain("Out: $0.00");
    expect(mocks.edited.mock.calls.at(-1)?.[2]).toContain("0 transactions");
  });

  test("refreshing a previous day's summary keeps its original timezone and date window", async () => {
    ledger(); await handleUpdate(update(1, "Summary today"));
    vi.setSystemTime(new Date("2026-10-11T09:00:00Z"));
    db.tables.profiles[0].timezone = "America/Los_Angeles";
    expect((await deleteTransaction(DELETED)).ok).toBe(true);
    await finishBackground();
    expect(mocks.edited.mock.calls[0][2]).toContain("10 Oct 2026");
    expect(mocks.edited.mock.calls[0][2]).toContain("Out: $7.00");
    expect(mocks.edited.mock.calls[0][2]).toContain("Asia/Phnom_Penh");
  });

  test("frequent history updates do not prevent an older budget report from refreshing", async () => {
    ledger(); await handleUpdate(update(1, "Budgets"));
    const at = new Date().toISOString();
    for (let index = 0; index < 220; index++) db.tables.telegram_logs.push({
      id: `history-audit-${index}`, user_id: USER, chat_id: CHAT, direction: "outbound", error_message: null,
      message_text: "Older history", created_at: new Date(Date.now() + 1000 + index).toISOString(),
      parsed: { kind: "report", messageId: 900, request: { kind: "recent" }, at, timezone: "Asia/Phnom_Penh" },
    });
    expect((await deleteTransaction(DELETED)).ok).toBe(true);
    await finishBackground();
    expect(mocks.edited.mock.calls.some(call => String(call[2]).includes("$7.00 of"))).toBe(true);
  });

  test("report refreshes require valid message ids and never target malformed log data", async () => {
    ledger();
    db.tables.telegram_logs.push({ user_id: USER, chat_id: CHAT, direction: "outbound", error_message: null,
      message_text: "Malformed", created_at: new Date().toISOString(),
      parsed: { kind: "report", messageId: -5, request: { kind: "recent" }, at: new Date().toISOString(), timezone: "Asia/Phnom_Penh" },
    });
    expect((await deleteTransaction(DELETED)).ok).toBe(true);
    await finishBackground();
    expect(mocks.edited).not.toHaveBeenCalled();
    expect(mocks.sent.mock.calls[0][1]).toContain("Out: $7.00");
  });
});

test("an ambiguous institution requires the full account name", () => {
  const accounts = [
    { name: "ABA spending", institution: "ABA", currency: "USD", isActive: true },
    { name: "ABA savings", institution: "ABA", currency: "USD", isActive: true },
  ] as AccountBalance[];
  expect(namedAccount(accounts, "ABA", "USD")).toBeNull();
  expect(namedAccount(accounts, "ABA savings", "USD")?.name).toBe("ABA savings");
});
