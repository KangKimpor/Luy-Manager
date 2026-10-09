import { afterEach, expect, test, vi } from "vitest";
import { readTelegramStatus } from "./status";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

test("status returns safe delivery details without credentials or another origin", async () => {
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "private-token"); vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "private-secret");
  vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => Promise.resolve(Response.json({ ok: true, result: url.endsWith("getMe")
    ? { username: "LuyManagerBot" }
    : { url: "https://private-origin.example/api/telegram/webhook", pending_update_count: 3, last_error_message: "Wrong response: 401 private-token private-secret" } }))));
  const result = await readTelegramStatus("https://app.test");
  expect(result).toMatchObject({ username: "LuyManagerBot", webhookRegistered: true, webhookMatches: false, pendingUpdates: 3 });
  expect(result.deliveryError).toContain("secret matches");
  expect(JSON.stringify(result)).not.toMatch(/private-token|private-secret|private-origin/);
});

test("a matching registered route can be healthy", async () => {
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token"); vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "test-secret");
  vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => Promise.resolve(Response.json({ ok: true, result: url.endsWith("getMe")
    ? { username: "LuyManagerBot" } : { url: "https://app.test/api/telegram/webhook", pending_update_count: 0 } }))));
  expect(await readTelegramStatus("https://app.test")).toMatchObject({ webhookMatches: true, deliveryError: null, pendingUpdates: 0 });
});
