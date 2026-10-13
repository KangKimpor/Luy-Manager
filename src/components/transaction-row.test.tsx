import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { TransactionRow } from "./transaction-row";
import { DEMO_TRANSACTIONS } from "@/lib/demo-data";
vi.mock("@/components/transaction-row-actions", () => ({ TransactionRowActions: ({ deleted }: { deleted: boolean }) => <button>{deleted ? "Restore" : "Delete"}</button> }));
vi.mock("@/components/app-link", () => ({ AppLink: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));

test("activity links the whole row to edit and keeps exact native riel", () => {
  const transaction = { ...DEMO_TRANSACTIONS[0], amount: -999355, currency: "KHR" as const, notes: "Fuel" };
  render(<ul><TransactionRow transaction={transaction} transactions={[transaction]} categories={{}} accounts={{}} merchant="Station" activity /></ul>);
  const link = screen.getByRole("link", { name: "Edit Fuel" });
  expect(link).toHaveAttribute("href", `/transactions/${transaction.id}/edit`);
  expect(link).toHaveTextContent("Station");
  expect(link.querySelector("data")).toHaveAttribute("value", "-999355 KHR");
  expect(link.querySelector("data")).toHaveTextContent("-9,993.55៛");
  expect(link.querySelector("data")).toHaveClass("text-outflow");
});
test("a deleted transfer is neutral, has no edit link, and offers restoration", () => {
  const transaction = { ...DEMO_TRANSACTIONS[0], type: "transfer" as const, transferGroupId: "pair" };
  render(<ul><TransactionRow transaction={transaction} transactions={[transaction]} categories={{}} accounts={{}} activity deleted /></ul>);
  expect(screen.getByText("Transfer")).toBeInTheDocument();
  expect(screen.queryByRole("link")).toBeNull();
  expect(screen.getByText("Restore")).toBeInTheDocument();
  expect(document.querySelector("data")).not.toHaveClass("text-outflow");
});
