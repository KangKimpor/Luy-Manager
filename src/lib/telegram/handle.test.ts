import { beforeEach, describe, expect, test, vi } from "vitest";
import type { AccountBalance } from "@/lib/domain/types";

const mocks = vi.hoisted(() => ({ admin: null as unknown, sent: vi.fn(), after: [] as Array<() => Promise<void>> }));
vi.mock("next/server", () => ({ after: (task: () => Promise<void>) => mocks.after.push(task) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => mocks.admin }));
vi.mock("./client", async (original) => ({ ...await original<typeof import("./client")>(), sendMessage: mocks.sent }));
import { handleUpdate, namedAccount } from "./handle";

const USER = "11111111-2222-3333-4444-555555555555";
const OTHER = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const CHAT = 100;
type Row = Record<string, unknown>;
type Predicate = { key: string; operator: "eq" | "neq" | "is" | "gte" | "lt" | "lte" | "contains"; value: unknown };

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
      ...row, id: row.account_id, opening_balance: 0,
    }));
  }
  unsafeQueries: string[] = [];
  reads: string[] = [];
  walletReadGate: Promise<void> | null = null;
  failClaim = false;
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
    } else {
      let rows = this.db.tables[this.table].filter((row) => this.predicates.every(({ key, operator, value }) => {
        if (operator === "contains") return row[key] && Object.entries(value as Row).every(([field, expected]) => (row[key] as Row)[field] === expected);
        if (operator === "eq") return row[key] === value;
        if (operator === "neq") return row[key] !== value;
        if (operator === "is") return (row[key] ?? null) === value;
        if (operator === "gte") return String(row[key]) >= String(value);
        if (operator === "lte") return String(row[key]) <= String(value);
        return String(row[key]) < String(value);
      }));
      rows.sort((left, right) => {
        for (const { key, ascending } of this.sorting) {
          const comparison = String(left[key]).localeCompare(String(right[key]));
          if (comparison) return ascending ? comparison : -comparison;
        }
        return 0;
      });
      const count = this.counted ? rows.length : null;
      rows = rows.slice(this.offset, this.offset + Math.min(this.maximum, 1000));
      if (this.operation === "update") for (const row of rows) Object.assign(row, this.payload[0]);
      result = { data: this.singular ? rows[0] ?? null : rows, error: null, count };
    }
    const ready = this.table === "accounts" && this.operation === "select" && this.db.walletReadGate ? this.db.walletReadGate : Promise.resolve();
    return ready.then(() => resolve(structuredClone(result)));
  }
}

let db: TestDatabase;
function update(id: number, text: string) {
  return { update_id: id, message: { message_id: id, text, chat: { id: CHAT, type: "private" }, from: { id: CHAT, is_bot: false } } };
}
beforeEach(() => {
  vi.useRealTimers(); vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "test-secret"); vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token");
  db = new TestDatabase(); mocks.admin = db;
  mocks.after = [];
  mocks.sent.mockReset().mockResolvedValue({ ok: true });
});

describe("retry-safe Telegram ledger writes", () => {
  test.each([
    ["Cancel", []], ["Undo", ["transactions"]], ["Rate", ["exchange_rates"]],
    ["Accounts", ["settings", "account_balances"]], ["Recent", ["accounts", "transactions"]],
    ["Expense USD", ["accounts"]], ["Choose account", ["accounts"]],
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
    expect(mocks.sent.mock.calls.at(-1)?.[1]).toContain("yes");
    expect(db.unsafeQueries).toEqual([]);
  });
  test("wallet buttons select the account for expenses and incomes, including quick and explicit entries", async () => {
    await handleUpdate(update(1, "Expense USD"));
    expect(mocks.sent.mock.calls.at(-1)?.[2]).toEqual(expect.arrayContaining([["Use Wing USD (USD)"]]));
    expect(JSON.stringify(mocks.sent.mock.calls.at(-1)?.[2])).not.toContain("Other wallet");
    expect(JSON.stringify(mocks.sent.mock.calls.at(-1)?.[2])).not.toContain("Cash KHR");
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

test("an ambiguous institution requires the full account name", () => {
  const accounts = [
    { name: "ABA spending", institution: "ABA", currency: "USD", isActive: true },
    { name: "ABA savings", institution: "ABA", currency: "USD", isActive: true },
  ] as AccountBalance[];
  expect(namedAccount(accounts, "ABA", "USD")).toBeNull();
  expect(namedAccount(accounts, "ABA savings", "USD")?.name).toBe("ABA savings");
});
