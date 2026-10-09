import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ configured: true, database: true, handle: vi.fn() }));
vi.mock("@/lib/telegram/env", () => ({ isTelegramConfigured: () => mocks.configured, requireTelegramEnv: () => ({ webhookSecret: "secret" }) }));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => mocks.database, isServiceRoleConfigured: () => mocks.database }));
vi.mock("@/lib/telegram/handle", () => ({ handleUpdate: mocks.handle }));
import { POST } from "./route";

beforeEach(() => { mocks.configured = true; mocks.database = true; mocks.handle.mockReset(); });
function request(body = "{}", secret = "secret") {
  return new Request("https://app.test/api/telegram/webhook", { method: "POST", body, headers: { "x-telegram-bot-api-secret-token": secret } });
}

describe("webhook acknowledgements", () => {
  test("authentication happens before reading the body", async () => {
    const req = request("{}", "wrong");
    const body = vi.spyOn(req, "json");
    expect((await POST(req)).status).toBe(401);
    expect(body).not.toHaveBeenCalled(); expect(mocks.handle).not.toHaveBeenCalled();
  });
  test("missing configuration reports 503 rather than pretending to process", async () => {
    mocks.configured = false;
    expect((await POST(request())).status).toBe(503);
    mocks.configured = true; mocks.database = false;
    expect((await POST(request())).status).toBe(503);
  });
  test("malformed JSON is acknowledged without a retry loop", async () => {
    expect((await POST(request("{bad"))).status).toBe(200);
    expect(mocks.handle).not.toHaveBeenCalled();
  });
  test("a post-write exception is acknowledged without leaking its content", async () => {
    mocks.handle.mockRejectedValueOnce(new Error("private-token"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(JSON.stringify(logged.mock.calls)).not.toContain("private-token");
    logged.mockRestore();
  });
});
