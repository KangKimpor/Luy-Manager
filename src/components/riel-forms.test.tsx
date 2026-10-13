import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { AccountForm } from "./account-form";
import { BudgetForm } from "./budget-form";
import { DEMO_ACCOUNTS, DEMO_CATEGORIES } from "@/lib/demo-data";

vi.mock("@/app/actions/accounts", () => ({ createAccount: vi.fn(), updateAccount: vi.fn() }));
vi.mock("@/app/actions/budgets", () => ({ createBudget: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

test("an existing riel account opens with its exact bank balance", () => {
  render(<AccountForm account={{ ...DEMO_ACCOUNTS[0], id: DEMO_ACCOUNTS[0].accountId, currency: "KHR", openingBalance: 999355 }} />);
  expect(screen.getByLabelText(/Opening balance/)).toHaveValue("9993.55");
});

test("switching a budget to riel preserves the entered fraction", () => {
  render(<BudgetForm categories={DEMO_CATEGORIES} defaultCurrency="USD" />);
  fireEvent.change(screen.getByLabelText("Limit"), { target: { value: "9993.55" } });
  fireEvent.click(within(screen.getByRole("group", { name: "Budget currency" })).getByRole("button", { name: "KHR" }));
  expect(screen.getByLabelText("Limit")).toHaveValue("9993.55");
});
