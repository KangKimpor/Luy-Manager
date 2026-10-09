import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), status: vi.fn(), configured: true }));
vi.mock("@/lib/auth", () => ({ requireUserId: mocks.auth }));
vi.mock("@/lib/telegram/status", () => ({ readTelegramStatus: mocks.status }));
vi.mock("@/lib/telegram/env", () => ({ isTelegramConfigured: () => mocks.configured }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "app.test" }) }));
import { checkTelegramStatus } from "./telegram";

beforeEach(() => { mocks.auth.mockReset(); mocks.status.mockReset(); mocks.configured = true; });

test("an anonymous caller cannot probe bot delivery status", async () => {
  mocks.auth.mockRejectedValueOnce(new Error("Sign in"));
  expect((await checkTelegramStatus()).ok).toBe(false);
  expect(mocks.status).not.toHaveBeenCalled();
});

test("a network failure cannot return a token-bearing URL to the client", async () => {
  mocks.auth.mockResolvedValueOnce("user");
  mocks.status.mockRejectedValueOnce(new Error("https://api.telegram.org/botprivate-token/getMe"));
  const result = await checkTelegramStatus();
  expect(result.ok).toBe(false); expect(JSON.stringify(result)).not.toContain("private-token");
});
