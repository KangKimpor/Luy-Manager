import { render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { DEMO_ACCOUNTS, DEMO_RATE } from "@/lib/demo-data";

vi.mock("@/components/app-link", () => ({ AppLink: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
vi.mock("@/components/account-row-actions", () => ({ AccountRowActions: ({ name }: { name: string }) => <button>{`Close ${name}`}</button> }));
vi.mock("@/components/account-export", () => ({ AccountExport: () => null }));
vi.mock("@/components/currency-toggle", () => ({ CurrencyToggle: () => <span>USD / KHR</span> }));
vi.mock("@/lib/auth", () => ({ isDemoMode: () => false }));
vi.mock("@/lib/display-currency", () => ({ readDisplayCurrency: async () => "USD", otherCurrency: () => "KHR" }));
vi.mock("@/lib/rates/repository", () => ({ loadUsdKhrRate: async () => ({ rate: DEMO_RATE }) }));
vi.mock("@/lib/data/accounts", () => ({ listAccountBalances: async () => DEMO_ACCOUNTS }));
import AccountsPage from "./page";

test("every account opens its own activity and keeps edit and close outside the link", async () => {
  render(await AccountsPage());
  const links = screen.getAllByRole("link").filter(link => link.getAttribute("href")?.startsWith("/transactions?account="));
  expect(links.map(link => link.getAttribute("href")).sort())
    .toEqual(DEMO_ACCOUNTS.map(account => `/transactions?account=${account.accountId}`).sort());
  for (const link of links) expect(within(link).queryByRole("button")).toBeNull();
  expect(screen.getAllByRole("button", { name: /^Close / })).toHaveLength(DEMO_ACCOUNTS.length);
});
