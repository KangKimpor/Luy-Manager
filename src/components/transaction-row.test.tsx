import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { TransactionRow } from "./transaction-row";
import { DEMO_TRANSACTIONS } from "@/lib/demo-data";
vi.mock("@/components/app-link", () => ({ AppLink: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));

test("activity links the whole row to edit and keeps exact native riel", () => {
  const transaction = { ...DEMO_TRANSACTIONS[0], amount: -999355, currency: "KHR" as const, notes: "Fuel" };
  render(<ul><TransactionRow transaction={transaction} transactions={[transaction]} categories={{}} accounts={{}} merchant="Station" activity /></ul>);
  const link = screen.getByRole("link", { name: "Edit Fuel" });
  expect(link).toHaveAttribute("href", `/transactions/${transaction.id}/edit`);
  expect(link).toHaveTextContent("Station");
  expect(link.querySelector("data")).toHaveAttribute("value", "-999355 KHR");
  expect(link.querySelector("data")).toHaveTextContent("-9,993.55៛");
  expect(link.querySelector("data")).toHaveClass("text-ink");
  expect(link.querySelector("data")).not.toHaveClass("text-outflow");
});
test("income renders in inflow green with a plus sign", () => {
  const transaction = { ...DEMO_TRANSACTIONS[0], type: "income" as const, amount: 50000, currency: "USD" as const, notes: "Salary" };
  render(<ul><TransactionRow transaction={transaction} transactions={[transaction]} categories={{}} accounts={{}} activity /></ul>);
  const data = screen.getByRole("link", { name: "Edit Salary" }).querySelector("data");
  expect(data).toHaveTextContent("+$500.00");
  expect(data).toHaveClass("text-inflow");
});
test("a deleted transfer is neutral with no sign, has no edit link, and offers restoration", () => {
  const transaction = { ...DEMO_TRANSACTIONS[0], type: "transfer" as const, transferGroupId: "pair" };
  render(<ul><TransactionRow transaction={transaction} transactions={[transaction]} categories={{}} accounts={{}} activity deleted /></ul>);
  expect(screen.getByText("Transfer")).toBeInTheDocument();
  expect(screen.queryByRole("link")).toBeNull();
  expect(screen.getByRole("button", { name: "Restore this transaction" })).toBeInTheDocument();
  const data = document.querySelector("data");
  expect(data).toHaveClass("text-ink-muted");
  expect(data).not.toHaveClass("text-outflow");
  expect(data?.textContent).not.toMatch(/^[+-]/);
});
