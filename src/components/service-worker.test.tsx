import { fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
const router = { refresh };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { ServiceWorkerRegistration } from "./service-worker";

describe("Safari foreground freshness", () => {
  beforeEach(() => {
    refresh.mockClear();
    window.history.replaceState({}, "", "/");
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  });

  it("refreshes overview data after a restored Safari page", () => {
    render(<ServiceWorkerRegistration />);
    fireEvent(window, new PageTransitionEvent("pageshow", { persisted: true }));
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("coalesces foreground and reconnect signals into one refresh", () => {
    render(<ServiceWorkerRegistration />);
    fireEvent(window, new PageTransitionEvent("pageshow", { persisted: true }));
    fireEvent.online(window);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it.each(["/add", "/accounts/new", "/transactions/id/edit", "/settings", "/login"])("preserves drafts on %s", (path) => {
    window.history.replaceState({}, "", path);
    render(<ServiceWorkerRegistration />);
    fireEvent(window, new PageTransitionEvent("pageshow", { persisted: true }));
    fireEvent.online(window);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("preserves a focused search field on an overview screen", () => {
    const { getByRole } = render(<><input aria-label="Search" /><ServiceWorkerRegistration /></>);
    getByRole("textbox").focus();
    fireEvent.online(window);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does not request data while offline or hidden", () => {
    render(<ServiceWorkerRegistration />);
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    fireEvent(window, new PageTransitionEvent("pageshow", { persisted: true }));
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    fireEvent.online(window);
    expect(refresh).not.toHaveBeenCalled();
  });
});
