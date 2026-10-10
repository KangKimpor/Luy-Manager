import { afterEach, describe, expect, test, vi } from "vitest";
import { editMessage, entryKeyboard, isFromTelegram, MAIN_KEYBOARD, MORE_KEYBOARD, messagePayload, readMessage, sendMessage } from "./client";
import { parseMessage } from "./parse";

const update = { update_id: 12, message: { text: "Spent $5 coffee", chat: { id: 100, type: "private" }, from: { id: 100, is_bot: false } } };

test("all advertised buttons lead to supported actions and the home menu stays compact", () => {
  const keyboard = entryKeyboard({ type: "expense", currency: "USD", accountId: "aba" }, [
    { accountId: "aba", name: "ABA", currency: "USD", isActive: true },
    { accountId: "cash", name: "Cash", currency: "KHR", isActive: true },
  ]);
  expect(MAIN_KEYBOARD.flat()).toHaveLength(6);
  for (const label of [...MAIN_KEYBOARD.flat(), ...MORE_KEYBOARD.flat(), ...keyboard.flat()]) {
    expect(parseMessage(label).kind, label).not.toBe("unknown");
  }
  expect(keyboard.flat()).toContain("Use Cash (KHR)");
  expect(keyboard.flat()).not.toContain("Use ABA (USD)");
  expect(messagePayload(100, "Ready", keyboard).reply_markup.keyboard).toEqual(keyboard.map((row) => row.map((text) => ({ text }))));
});

test("large wallet lists expose two shortcuts and the complete selector without a tall entry menu", () => {
  const wallets = Array.from({ length: 10 }, (_, index) => ({ accountId: String(index), name: `Wallet ${index}`, currency: "USD", isActive: index !== 1 }));
  const keyboard = entryKeyboard({ type: "income", currency: "USD", accountId: "0" }, wallets);
  expect(keyboard).toHaveLength(4);
  expect(keyboard.flat().filter((label) => label.startsWith("Use "))).toHaveLength(2);
  expect(keyboard.flat()).toContain("Choose account");
  expect(keyboard.flat()).not.toContain("Use Wallet 1 (USD)");
});

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("private Telegram updates", () => {
  test("requires a durable delivery id and the matching private sender", () => {
    expect(readMessage(update)).toMatchObject({ updateId: 12, chatId: 100, text: "Spent $5 coffee" });
    expect(readMessage({ ...update, update_id: undefined })).toBeNull();
    expect(readMessage({ ...update, message: { ...update.message, from: { id: 200 } } })).toBeNull();
  });
  test("group members cannot link or operate somebody else's ledger", () => {
    expect(readMessage({ ...update, message: { ...update.message, chat: { id: -100, type: "group" } } })).toBeNull();
    expect(readMessage({ ...update, message: { ...update.message, from: { id: 100, is_bot: true } } })).toBeNull();
  });
  test("photo captions can carry a text entry", () => {
    expect(readMessage({ ...update, message: { ...update.message, text: undefined, caption: "Income $600 salary" } })).toMatchObject({ text: "Income $600 salary", unsupportedAttachment: false });
  });
  test("an attachment without text can receive clear instructions", () => {
    expect(readMessage({ ...update, message: { ...update.message, text: undefined } })).toMatchObject({ unsupportedAttachment: true });
  });
});

test("a different-length secret refuses without throwing", () => {
  expect(isFromTelegram(new Request("https://app.test", { headers: { "x-telegram-bot-api-secret-token": "x" } }), "expected-long-secret")).toBe(false);
  expect(isFromTelegram(new Request("https://app.test", { headers: { "x-telegram-bot-api-secret-token": "expected-long-secret" } }), "expected-long-secret")).toBe(true);
});

test("reply failures never throw or leak the credential URL", async () => {
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-private-token");
  vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "test-secret");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("https://api.telegram.org/bottest-private-token/sendMessage failed")));
  const result = await sendMessage(100, "Saved.");
  expect(result.ok).toBe(false);
  expect(JSON.stringify(result)).not.toContain("test-private-token");
});

test("Telegram's JSON refusal is detected even on HTTP 200", async () => {
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token"); vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "test-secret");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: false })));
  expect((await sendMessage(100, "Saved.")).ok).toBe(false);
});

test("only a verified message id from the addressed chat can become a refresh target", async () => {
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token"); vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "test-secret");
  vi.stubGlobal("fetch", vi.fn()
    .mockResolvedValueOnce(Response.json({ ok: true, result: { message_id: 123, chat: { id: 100 } } }))
    .mockResolvedValueOnce(Response.json({ ok: true, result: { message_id: 123, chat: { id: 200 } } })));
  expect(await sendMessage(100, "Report")).toEqual({ ok: true, messageId: 123 });
  expect(await sendMessage(100, "Report")).toEqual({ ok: true });
});

test("report edits preserve the existing keyboard and use the specified message", async () => {
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token"); vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "test-secret");
  const request = vi.fn().mockResolvedValue(Response.json({ ok: true }));
  vi.stubGlobal("fetch", request);
  expect((await editMessage(100, 123, "Out: $0.00")).ok).toBe(true);
  const payload = JSON.parse(request.mock.calls[0][1].body);
  expect(payload).toMatchObject({ chat_id: 100, message_id: 123, text: "Out: $0.00", parse_mode: "HTML" });
  expect(payload).not.toHaveProperty("reply_markup");
});

test("an unchanged edit is successful and a missing report can be replaced", async () => {
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token"); vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "test-secret");
  vi.stubGlobal("fetch", vi.fn()
    .mockResolvedValueOnce(Response.json({ ok: false, description: "Bad Request: message is not modified" }, { status: 400 }))
    .mockResolvedValueOnce(Response.json({ ok: false, description: "Bad Request: message to edit not found" }, { status: 400 })));
  expect(await editMessage(100, 123, "Report")).toEqual({ ok: true });
  expect(await editMessage(100, 123, "Report")).toMatchObject({ ok: false, missing: true });
});

test("an edit transport failure never exposes the token or throws", async () => {
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "private-token"); vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "test-secret");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("https://api.telegram.org/botprivate-token/editMessageText")));
  const result = await editMessage(100, 123, "Report");
  expect(result.ok).toBe(false); expect(JSON.stringify(result)).not.toContain("private-token");
});
