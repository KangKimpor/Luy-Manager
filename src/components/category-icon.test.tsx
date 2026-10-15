import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { AppIcon } from "./app-icon";
import { CategoryIcon } from "./category-icon";
import type { Category } from "@/lib/domain/types";

it("uses a local semantic icon for an emoji and a safe fallback for unknown keys", () => {
  const category: Category = { id: "1", userId: "owner", name: "Coffee", icon: "\u2615", color: null,
    parentId: null, appliesTo: ["expense"], isSystem: true, sortOrder: 0 };
  const { container, rerender } = render(<CategoryIcon category={category} />);
  expect(container.firstElementChild?.getAttribute("style")).toContain("/icons/lets-icons/drink.svg");
  expect(container.textContent).toBe("");
  rerender(<CategoryIcon icon="unknown/asset" />);
  expect(container.firstElementChild?.getAttribute("style")).toContain("/icons/lets-icons/widget.svg");
  rerender(<AppIcon name="send" aria-label="Added via Telegram" />);
  expect(screen.getByRole("img", { name: "Added via Telegram" })).toBeTruthy();
});

it("draws common custom categories with their own icon instead of the generic grid", () => {
  const base: Category = { id: "1", userId: "owner", name: "", icon: null, color: null,
    parentId: null, appliesTo: ["expense"], isSystem: false, sortOrder: 0 };
  const expected = { Game: "gamepad", Internet: "wifi", Selfcare: "sparkle", "Social Life": "chat-smile", Subscription: "refresh", Trading: "candlestick" };
  for (const [name, file] of Object.entries(expected)) {
    const { container, unmount } = render(<CategoryIcon category={{ ...base, name }} />);
    expect(container.firstElementChild?.getAttribute("style")).toContain(`/icons/lets-icons/${file}.svg`);
    unmount();
  }
});
