import { beforeEach, expect, test, vi } from "vitest";
import { DEFAULT_RATE } from "@/lib/money";
import type { Account } from "@/lib/domain/types";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), context: vi.fn(), account: vi.fn(), profile: vi.fn(), rate: vi.fn(), insert: vi.fn(), refresh: vi.fn(), notify: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUserId: mocks.auth }));
vi.mock("@/lib/data/client", () => ({ dataContext: mocks.context }));
vi.mock("@/lib/data/accounts", () => ({ getAccount: mocks.account }));
vi.mock("@/lib/data/reference", () => ({ getProfile: mocks.profile }));
vi.mock("@/lib/rates/repository", () => ({ loadUsdKhrRate: mocks.rate }));
vi.mock("@/lib/telegram/report-refresh", () => ({ queueTelegramReportRefresh: vi.fn(), queueTelegramTransactionNotification: mocks.notify }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.refresh }));
import { createTransaction, createTransfer } from "./transactions";

const ID = "11111111-2222-4333-8444-555555555555";
const OTHER = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const wallet: Account = { id: ID, userId: "user", name: "ABA", currency: "USD", type: "bank", institution: null, openingBalance: 0, icon: null, color: null, isActive: true, includeInNetWorth: true, sortOrder: 0 };
const input = { accountId: ID, type: "expense" as const, currency: "KHR" as const, amount: "5" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue("user");
  mocks.profile.mockResolvedValue({ baseCurrency: "USD", timezone: "Asia/Phnom_Penh" });
  mocks.account.mockResolvedValue(wallet);
  mocks.rate.mockResolvedValue({ rate: DEFAULT_RATE });
  mocks.insert.mockReturnValue({ select: () => ({ single: async () => ({ data: { id: ID }, error: null }) }), then: (resolve: (result: unknown) => unknown) => Promise.resolve(resolve({ error: null })) });
  mocks.context.mockResolvedValue({ userId: "user", supabase: { from: () => ({ insert: mocks.insert }) } });
});

test("reads profile and rate while a direct account read is pending, and takes currency from the row", async () => {
  let release!: (account: Account) => void;
  mocks.account.mockReturnValue(new Promise(resolve => { release = resolve; }));
  const saving = createTransaction(input);
  await vi.waitFor(() => expect(mocks.rate).toHaveBeenCalled());
  expect(mocks.account).toHaveBeenCalledWith(ID);
  expect(mocks.insert).not.toHaveBeenCalled();
  release(wallet);
  expect((await saving).ok).toBe(true);
  expect(mocks.insert.mock.calls[0][0]).toMatchObject({ account_id: ID, currency: "USD", amount: -500 });
  expect(mocks.notify).toHaveBeenCalledExactlyOnceWith("user", "Saved expense: -$5.00 · ABA");
});

test("retains missing and closed account errors", async () => {
  mocks.account.mockResolvedValue(null);
  expect(await createTransaction(input)).toMatchObject({ ok: false, error: "That account does not exist." });
  mocks.account.mockResolvedValue({ ...wallet, isActive: false });
  expect(await createTransaction(input)).toMatchObject({ ok: false, error: "ABA is closed. Reopen it before adding to it." });
  expect(mocks.notify).not.toHaveBeenCalled();
});

test("a failed insert never schedules a transaction notification", async () => {
  mocks.insert.mockReturnValue({ select: () => ({ single: async () => ({ data: null, error: { message: "Insert failed" } }) }) });
  expect(await createTransaction(input)).toEqual({ ok: false, error: "Insert failed" });
  expect(mocks.notify).not.toHaveBeenCalled();
});

test("writes two cross-currency legs in one insert without reading balances", async () => {
  mocks.account.mockImplementation(async (id: string) => ({ ...wallet, id, currency: id === OTHER ? "KHR" : "USD" }));
  const result = await createTransfer({ fromAccountId: ID, toAccountId: OTHER, amount: "10", receivedAmount: "41000" });
  expect(result.ok).toBe(true);
  expect(mocks.notify).toHaveBeenCalledExactlyOnceWith("user", "Saved transfer: -$10.00 · ABA to 41,000៛ · ABA");
  expect(mocks.insert.mock.calls[0][0]).toMatchObject([
    { account_id: ID, amount: -1000, currency: "USD" },
    { account_id: OTHER, amount: 4100000, currency: "KHR" },
  ]);
  expect(await createTransfer({ fromAccountId: ID, toAccountId: OTHER, amount: "0" })).toMatchObject({ ok: false, error: "A transfer must move a non-zero amount." });
  expect(await createTransfer({ fromAccountId: ID, toAccountId: OTHER, amount: "10", receivedAmount: "0" })).toMatchObject({ ok: false, error: "A transfer must credit a non-zero amount." });
});
