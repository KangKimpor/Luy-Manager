import { afterEach, describe, expect, test, vi } from "vitest";
import { isFromTelegram, readMessage, sendMessage } from "./client";

const update = { update_id: 12, message: { text: "Spent $5 coffee", chat: { id: 100, type: "private" }, from: { id: 100, is_bot: false } } };

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
