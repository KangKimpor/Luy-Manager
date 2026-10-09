import { render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { TransactionHistory } from "./transaction-history";
import { DEMO_TRANSACTIONS } from "@/lib/demo-data";

vi.mock("@/components/transaction-row", () => ({ TransactionRow: ({ transaction }: { transaction: { id: string } }) => <li>{transaction.id}</li> }));

it("groups by Cambodia calendar dates across the UTC midnight boundary", () => {
  const transactions = [
    { ...DEMO_TRANSACTIONS[0], id: "first", occurredAt: "2026-10-09T18:00:00Z" },
    { ...DEMO_TRANSACTIONS[0], id: "second", occurredAt: "2026-10-09T17:00:00Z" },
    { ...DEMO_TRANSACTIONS[0], id: "third", occurredAt: "2026-10-09T16:59:00Z" },
  ];
  render(<TransactionHistory transactions={transactions} categories={{}} accounts={{}} editable={false} />);
  expect(within(screen.getByRole("region", { name: "10 October 2026" })).getAllByRole("listitem")).toHaveLength(2);
  expect(within(screen.getByRole("region", { name: "9 October 2026" })).getByText("third")).toBeInTheDocument();
});
