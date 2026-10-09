import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(new URL("../../../public/sw.js", import.meta.url), "utf8");

interface WorkerEvent {
  request?: { method: string; url: string; mode?: string };
  waitUntil: (work: Promise<unknown>) => void;
  respondWith: (response: Promise<Response>) => void;
}

function worker() {
  const listeners: Record<string, (event: WorkerEvent) => void> = {};
  const cache = {
    match: vi.fn().mockResolvedValue(undefined),
    put: vi.fn().mockResolvedValue(undefined),
    keys: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(true),
  };
  const caches = {
    open: vi.fn().mockResolvedValue(cache),
    keys: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(true),
  };
  const fetch = vi.fn().mockResolvedValue(new Response("asset", {
    headers: { "Content-Type": "application/javascript" },
  }));
  const claim = vi.fn().mockResolvedValue(undefined);
  runInNewContext(source, {
    URL, Response, caches, fetch,
    self: {
      location: new URL("https://luy.test"),
      clients: { claim },
      skipWaiting: vi.fn().mockResolvedValue(undefined),
      addEventListener: (type: string, callback: (event: WorkerEvent) => void) => { listeners[type] = callback; },
    },
  });
  const dispatch = async (type: string, request?: WorkerEvent["request"]) => {
    const work: Promise<unknown>[] = [];
    let response: Promise<Response> | undefined;
    listeners[type]({
      request,
      waitUntil: (promise) => { work.push(promise); },
      respondWith: (promise) => { response = promise; },
    });
    const result = response ? await response : undefined;
    await Promise.all(work);
    return result;
  };
  return { cache, caches, fetch, claim, dispatch };
}

describe("installed app cache boundaries", () => {
  it("retires this app's old caches while preserving other origin caches", async () => {
    const app = worker();
    app.caches.keys.mockResolvedValue(["luy-v1-shell", "luy-v2-assets", "another-app"]);
    await app.dispatch("activate");
    expect(app.caches.delete.mock.calls.map(([key]) => key)).toEqual(["luy-v1-shell"]);
    expect(app.claim).toHaveBeenCalledOnce();
  });

  it.each([
    { method: "POST", url: "https://luy.test/add" },
    { method: "GET", url: "https://luy.test/api/telegram/webhook", mode: "navigate" },
    { method: "GET", url: "https://luy.test/auth/callback", mode: "navigate" },
    { method: "GET", url: "https://luy.test/login", mode: "navigate" },
    { method: "GET", url: "https://supabase.test/rest/v1/transactions" },
    { method: "GET", url: "https://luy.test/accounts?_rsc=latest", mode: "cors" },
  ])("leaves mutations, sessions and live data to the browser: $url", async (request) => {
    const app = worker();
    expect(await app.dispatch("fetch", request)).toBeUndefined();
    expect(app.caches.open).not.toHaveBeenCalled();
    expect(app.fetch).not.toHaveBeenCalled();
  });

  it("loads assets when Safari refuses storage", async () => {
    const app = worker();
    app.caches.open.mockRejectedValue(new Error("Storage unavailable"));
    const response = await app.dispatch("fetch", {
      method: "GET", url: "https://luy.test/_next/static/chunks/version.js",
    });
    expect(await response?.text()).toBe("asset");
  });

  it("keeps static cache writes alive and evicts old build assets", async () => {
    const app = worker();
    app.cache.keys.mockResolvedValue(Array.from({ length: 60 }, (_, i) => `asset-${i}`));
    await app.dispatch("fetch", {
      method: "GET", url: "https://luy.test/_next/static/chunks/version.js",
    });
    expect(app.cache.put).toHaveBeenCalledOnce();
    expect(app.cache.delete).toHaveBeenCalledTimes(12);
    expect(app.cache.delete).toHaveBeenLastCalledWith("asset-11");
  });

  it("never stores an HTML redirect/error body as a JavaScript chunk", async () => {
    const app = worker();
    app.fetch.mockResolvedValue(new Response("sign in", { headers: { "Content-Type": "text/html" } }));
    await app.dispatch("fetch", {
      method: "GET", url: "https://luy.test/_next/static/chunks/version.js",
    });
    expect(app.cache.put).not.toHaveBeenCalled();
  });

  it("shows a non-cacheable offline notice instead of stale ledger HTML", async () => {
    const app = worker();
    app.fetch.mockRejectedValue(new Error("Offline"));
    const response = await app.dispatch("fetch", {
      method: "GET", url: "https://luy.test/accounts", mode: "navigate",
    });
    expect(response?.status).toBe(503);
    expect(response?.headers.get("Cache-Control")).toBe("no-store");
    expect(await response?.text()).toContain("Connect to the internet");
    expect(app.caches.open).not.toHaveBeenCalled();
  });
});
