import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { fallbackSnapshot } from "@/lib/rates/repository";

const { history } = vi.hoisted(() => ({ history: vi.fn() }));
vi.mock("@/lib/rates/repository", async original => ({ ...await original<typeof import("@/lib/rates/repository")>(), loadUsdKhrRate: async () => fallbackSnapshot(), listRateHistory: history }));
vi.mock("@/lib/auth", () => ({ getUser: async () => null, isDemoMode: () => true }));
vi.mock("@/lib/display-currency", () => ({ readDisplayCurrency: async () => "USD" }));
vi.mock("@/lib/telegram/env", () => ({ botUsername: () => null, isTelegramConfigured: () => false }));
vi.mock("@/components/currency-toggle", () => ({ CurrencyToggle: () => <span>USD / KHR</span> }));
import SettingsPage from "./page";

test("keeps exchange rate settings, has no appearance switch and loads no recent rate history", async () => {
  render(await SettingsPage());
  expect(screen.getByText("Exchange rate")).toBeInTheDocument();
  expect(screen.queryByText("Appearance")).not.toBeInTheDocument();
  expect(screen.queryByText("Recent exchange rates")).not.toBeInTheDocument();
  expect(history).not.toHaveBeenCalled();
});
