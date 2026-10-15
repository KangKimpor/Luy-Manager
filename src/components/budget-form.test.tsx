import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { BudgetForm } from "./budget-form";
import { DEMO_CATEGORIES } from "@/lib/demo-data";

const createBudget = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true, data: { id: "saved" } }));
vi.mock("@/app/actions/budgets", () => ({ createBudget }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

it("keeps category caps separate from the overall cap and excludes income choices", async () => {
  const user = userEvent.setup();
  render(<BudgetForm categories={DEMO_CATEGORIES} defaultCurrency="USD" />);
  expect(screen.getByText("Everything (one overall cap)")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "All categories" }));
  expect(screen.queryByRole("button", { name: "Salary" })).toBeNull();
  await user.type(screen.getByRole("searchbox", { name: "Search categories" }), "Health");
  await user.click(screen.getByRole("button", { name: "Health" }));
  fireEvent.change(screen.getByLabelText("Limit"), { target: { value: "150" } });
  await user.click(screen.getByRole("button", { name: "Add budget" }));
  expect(createBudget.mock.lastCall?.[0]).toMatchObject({ categoryId: "cat-health", amount: "150" });
  await user.click(screen.getByRole("button", { name: "Use an overall cap" }));
  await user.click(screen.getByRole("button", { name: "Add budget" }));
  expect(createBudget.mock.lastCall?.[0]).toMatchObject({ categoryId: null });
});
