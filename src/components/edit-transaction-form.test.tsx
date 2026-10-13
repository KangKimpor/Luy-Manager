import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";

import { EditTransactionForm } from "./edit-transaction-form";
import { DEMO_ACCOUNTS, DEMO_CATEGORIES, DEMO_TRANSACTIONS } from "@/lib/demo-data";
import type { Transaction } from "@/lib/domain/types";

const updateTransaction = vi.hoisted(() => vi.fn());
vi.mock("@/app/actions/transactions", () => ({ updateTransaction }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
beforeEach(() => updateTransaction.mockReset().mockResolvedValue({ ok: true, data: { id: "saved" } }));

const transaction: Transaction = { ...DEMO_TRANSACTIONS[0], type: "expense", accountId: "acc-aba-usd", categoryId: "cat-coffee", notes: null, currency: "USD", amount: -500, occurredAt: "2026-10-10T19:15:32.000Z" };

test("editing a bank riel expense preserves both fractional digits", async () => {
  render(<EditTransactionForm transaction={{ ...transaction, accountId: "acc-aba-khr", currency: "KHR", amount: -999355 }} accounts={DEMO_ACCOUNTS} categories={DEMO_CATEGORIES} />);
  expect(screen.getByLabelText("Amount")).toHaveValue("9993.55");
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await vi.waitFor(() => expect(updateTransaction).toHaveBeenCalledWith(expect.objectContaining({ amount: "9993.55" })));
});

test("editing asks for just a date in the profile zone and preserves an unchanged day", async () => {
  const user = userEvent.setup();
  render(<EditTransactionForm transaction={transaction} accounts={DEMO_ACCOUNTS} categories={DEMO_CATEGORIES} />);
  const date = screen.getByLabelText("Date");
  expect(date).toHaveAttribute("type", "date");
  expect(date).toHaveValue("2026-10-11");
  expect(screen.queryByLabelText("Date and time")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect(updateTransaction).toHaveBeenCalledWith(expect.objectContaining({ occurredAt: transaction.occurredAt }));
});

test("changing the day saves that day without requesting a time", async () => {
  const user = userEvent.setup();
  render(<EditTransactionForm transaction={transaction} accounts={DEMO_ACCOUNTS} categories={DEMO_CATEGORIES} />);
  fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-10-08" } });
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect(updateTransaction).toHaveBeenCalledWith(expect.objectContaining({ occurredAt: "2026-10-08T05:00:00.000Z" }));
});
