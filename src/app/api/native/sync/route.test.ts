import { beforeEach, expect, it, vi } from "vitest";

const { getUser, refresh } = vi.hoisted(() => ({ getUser: vi.fn(), refresh: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: { getUser } }) }));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => true,
  requireSupabaseEnv: () => ({ url: "https://example.supabase.co", anonKey: "public" }) }));
vi.mock("@/lib/telegram/report-refresh", () => ({ queueTelegramReportRefresh: refresh }));
import { POST } from "./route";

beforeEach(() => { vi.clearAllMocks(); });
it("rejects missing and invalid bearer sessions before refreshing any chat", async () => {
  expect((await POST(new Request("https://example.com/api/native/sync", { method: "POST" }))).status).toBe(401);
  expect(getUser).not.toHaveBeenCalled();
  getUser.mockResolvedValue({ data: { user: null }, error: new Error("expired") });
  expect((await POST(new Request("https://example.com/api/native/sync", { method: "POST", headers: { authorization: "Bearer expired" } }))).status).toBe(401);
  expect(refresh).not.toHaveBeenCalled();
});
it("refreshes only the verified session owner, ignoring supplied owner and chat IDs", async () => {
  getUser.mockResolvedValue({ data: { user: { id: "verified-owner" } }, error: null });
  const response = await POST(new Request("https://example.com/api/native/sync", { method: "POST",
    headers: { authorization: "Bearer valid" }, body: JSON.stringify({ userId: "victim", chatId: 123 }) }));
  expect(response.status).toBe(200);
  expect(getUser).toHaveBeenCalledWith("valid");
  expect(refresh).toHaveBeenCalledExactlyOnceWith("verified-owner");
});
it("returns a retryable failure when the auth service is unavailable", async () => {
  getUser.mockRejectedValue(new Error("network"));
  expect((await POST(new Request("https://example.com/api/native/sync", { method: "POST", headers: { authorization: "Bearer valid" } }))).status).toBe(503);
  expect(refresh).not.toHaveBeenCalled();
});
