import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { clearMenuMetadata, readMenuMetadata } from "./menu-cache";

beforeEach(() => { clearMenuMetadata(); vi.useFakeTimers(); });
afterEach(() => { clearMenuMetadata(); vi.useRealTimers(); });

describe("Telegram menu metadata", () => {
  test("reuses wallet metadata within the TTL, keeps owners separate and returns copies", async () => {
    const load = vi.fn(async () => ({ name: "ABA" }));
    const first = await readMenuMetadata("alice", "accounts", load); first.name = "Changed";
    expect(await readMenuMetadata("alice", "accounts", load)).toEqual({ name: "ABA" });
    expect(load).toHaveBeenCalledTimes(1);
    await readMenuMetadata("bob", "accounts", load); expect(load).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(15_001);
    await readMenuMetadata("alice", "accounts", load); expect(load).toHaveBeenCalledTimes(3);
  });
  test("coalesces selector reads but fresh mode changes bypass even an in-flight result", async () => {
    let finish!: (value: { name: string }) => void;
    const old = vi.fn(() => new Promise<{ name: string }>((resolve) => { finish = resolve; }));
    const first = readMenuMetadata("alice", "accounts", old);
    const second = readMenuMetadata("alice", "accounts", old);
    expect(old).toHaveBeenCalledTimes(1);
    await readMenuMetadata("alice", "accounts", () => Promise.resolve({ name: "Current" }), true);
    finish({ name: "Old" }); await Promise.all([first, second]);
    expect(await readMenuMetadata("alice", "accounts", old)).toEqual({ name: "Current" });
  });
  test("failed requests are never cached and clearing does not resurrect old reads", async () => {
    await expect(readMenuMetadata("alice", "accounts", () => Promise.reject(new Error("offline")))).rejects.toThrow("offline");
    let finish!: (value: string) => void;
    const pending = readMenuMetadata("alice", "accounts", () => new Promise<string>((resolve) => { finish = resolve; }));
    clearMenuMetadata("alice"); finish("Stale"); await pending;
    expect(await readMenuMetadata("alice", "accounts", () => Promise.resolve("Fresh"))).toBe("Fresh");
  });
});
