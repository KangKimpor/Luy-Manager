import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { fallbackSnapshot } from "@/lib/rates/repository";

const { history, setAppearanceMock } = vi.hoisted(() => ({
  history: vi.fn(),
  setAppearanceMock: vi.fn(),
}));
vi.mock("@/lib/rates/repository", async original => ({ ...await original<typeof import("@/lib/rates/repository")>(), loadUsdKhrRate: async () => fallbackSnapshot(), listRateHistory: history }));
vi.mock("@/lib/auth", () => ({ getUser: async () => null, isDemoMode: () => true }));
vi.mock("@/lib/display-currency", () => ({ readDisplayCurrency: async () => "USD" }));
vi.mock("@/lib/appearance", () => ({ readAppearance: async () => "system" }));
vi.mock("@/app/actions/appearance", () => ({ setAppearance: setAppearanceMock }));
vi.mock("@/lib/telegram/env", () => ({ botUsername: () => null, isTelegramConfigured: () => false }));
vi.mock("@/components/currency-toggle", () => ({ CurrencyToggle: () => <span>USD / KHR</span> }));
import SettingsPage from "./page";

test("renders appearance switch, telegram promo and exchange rate without loading rate history", async () => {
  render(await SettingsPage());
  expect(screen.getByText("Exchange rate")).toBeInTheDocument();
  expect(screen.getByText("Appearance")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Light" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByRole("button", { name: "System" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByText("Your money, in a message.")).toBeInTheDocument();
  expect(screen.queryByText("Recent exchange rates")).not.toBeInTheDocument();
  expect(history).not.toHaveBeenCalled();
});
