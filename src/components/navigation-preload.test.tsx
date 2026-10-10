import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ pathname: "/", router: { prefetch: vi.fn() } }));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname, useRouter: () => mocks.router }));
import { NavigationPreload } from "./navigation-preload";

beforeEach(() => {
  mocks.pathname = "/"; mocks.router.prefetch.mockReset();
  vi.stubEnv("NODE_ENV", "production"); vi.useFakeTimers();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  Object.defineProperty(navigator, "connection", { configurable: true, value: undefined });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("complete route preloading", () => {
  test("warms More destinations on phones with full data, without making repeat requests", async () => {
    render(<NavigationPreload />);
    await act(async () => { vi.advanceTimersByTime(350); });
    const calls = mocks.router.prefetch.mock.calls;
    for (const route of ["/add", "/accounts", "/transactions", "/budgets", "/reports", "/settings"]) expect(calls.some(([href, options]) => href === route && options.kind === "full")).toBe(true);
    expect(calls.some(([href]) => href === "/")).toBe(false);
    const count = calls.length;
    await act(async () => { window.dispatchEvent(new Event("pointerdown")); vi.advanceTimersByTime(350); });
    expect(mocks.router.prefetch).toHaveBeenCalledTimes(count);
    await act(async () => { calls[0][1].onInvalidate(); vi.advanceTimersByTime(350); });
    expect(mocks.router.prefetch).toHaveBeenCalledTimes(count + 1);
  });
  test("stops refreshing invalidated routes when idle and cancels on unmount", async () => {
    const view = render(<NavigationPreload />);
    await act(async () => { vi.advanceTimersByTime(350); });
    const count = mocks.router.prefetch.mock.calls.length;
    const invalidate = mocks.router.prefetch.mock.calls[0][1].onInvalidate;
    await act(async () => { vi.advanceTimersByTime(60_000); invalidate(); vi.advanceTimersByTime(350); });
    expect(mocks.router.prefetch).toHaveBeenCalledTimes(count);
    view.unmount(); invalidate(); vi.advanceTimersByTime(1000);
    expect(mocks.router.prefetch).toHaveBeenCalledTimes(count);
  });
  test("respects sign-in boundaries and data saver preferences", async () => {
    mocks.pathname = "/login";
    const view = render(<NavigationPreload />);
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(mocks.router.prefetch).not.toHaveBeenCalled();
    view.unmount(); mocks.pathname = "/";
    Object.defineProperty(navigator, "connection", { configurable: true, value: { saveData: true } });
    render(<NavigationPreload />);
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(mocks.router.prefetch).not.toHaveBeenCalled();
  });
});
