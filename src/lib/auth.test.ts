import { beforeEach, describe, expect, it, vi } from "vitest";

const getClaims = vi.fn();

vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getClaims } }),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

// A fresh module per test, because getUser is memoised per render by React's cache.
async function load() {
  vi.resetModules();
  return (await import("./auth")).getUser;
}

describe("getUser", () => {
  beforeEach(() => getClaims.mockReset());

  it("maps verified claims to the signed-in user", async () => {
    getClaims.mockResolvedValue({
      data: {
        claims: {
          sub: "u1",
          email: "a@b.co",
          user_metadata: { full_name: "Kimpor", avatar_url: "https://x/y.png" },
        },
      },
      error: null,
    });
    const getUser = await load();
    expect(await getUser()).toEqual({
      id: "u1",
      email: "a@b.co",
      displayName: "Kimpor",
      avatarUrl: "https://x/y.png",
    });
  });

  it("is signed out when verification fails", async () => {
    getClaims.mockResolvedValue({ data: null, error: new Error("bad jwt") });
    const getUser = await load();
    expect(await getUser()).toBeNull();
  });

  it("is signed out when the token carries no subject", async () => {
    getClaims.mockResolvedValue({ data: { claims: {} }, error: null });
    const getUser = await load();
    expect(await getUser()).toBeNull();
  });
});
