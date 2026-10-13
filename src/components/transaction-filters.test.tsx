import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { TransactionFilters } from "./transaction-filters";
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

test("search and filters retain calendar selection for back navigation", () => {
  render(<TransactionFilters accounts={[]} categories={[]} month="2026-10" selected={{ view: "calendar", day: "2026-10-10", account: "aba" }} />);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Fuel" } });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  expect(push).toHaveBeenLastCalledWith("/transactions?view=calendar&month=2026-10&day=2026-10-10&account=aba&q=Fuel");
  fireEvent.change(screen.getByRole("combobox", { name: "Filter by category" }), { target: { value: "none" } });
  expect(push.mock.lastCall?.[0]).toContain("category=none");
});
