import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QuickAddForm } from "./quick-add-form";
import { DEMO_ACCOUNTS, DEMO_CATEGORIES } from "@/lib/demo-data";

const createTransaction = vi.hoisted(() => vi.fn());
vi.mock("@/app/actions/transactions", () => ({ createTransaction }));

beforeEach(() => { createTransaction.mockReset(); });

function renderForm() {
  return render(<QuickAddForm accounts={DEMO_ACCOUNTS} categories={DEMO_CATEGORIES} type="expense" />);
}

describe("transaction save feedback", () => {
  it("confirms the saved amount after clearing the keypad", async () => {
    createTransaction.mockResolvedValue({ ok: true, data: { id: "saved" } });
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "5" }));
    await user.click(screen.getByRole("button", { name: "Save expense" }));
    expect(screen.getByRole("status", { name: "Save confirmation" })).toHaveTextContent("Saved $5.00");
    expect(screen.getByLabelText("Amount entered")).toHaveTextContent("$0.00");
  });

  it("keeps input on failure and allows a retry", async () => {
    createTransaction.mockResolvedValueOnce({ ok: false, error: "Please try again." }).mockResolvedValueOnce({ ok: true, data: { id: "saved" } });
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "5" }));
    await user.click(screen.getByRole("button", { name: "Save expense" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Please try again.");
    expect(screen.getByLabelText("Amount entered")).toHaveTextContent("$5.00");
    await user.click(screen.getByRole("button", { name: "Save expense" }));
    expect(createTransaction).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("status", { name: "Save confirmation" })).toHaveTextContent("Saved $5.00");
  });

  it("releases the saving state if the request throws", async () => {
    createTransaction.mockRejectedValue(new Error("network"));
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "5" }));
    await user.click(screen.getByRole("button", { name: "Save expense" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Check Activity");
    expect(screen.getByRole("button", { name: "Save expense" })).toBeEnabled();
    expect(screen.getByLabelText("Amount entered")).toHaveTextContent("$5.00");
  });

  it("disables editing and duplicate submissions until the save finishes", async () => {
    let finish!: (value: { ok: true; data: { id: string } }) => void;
    createTransaction.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "5" }));
    await user.click(screen.getByRole("button", { name: "Save expense" }));
    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "1" })).toBeDisabled();
    expect(createTransaction).toHaveBeenCalledTimes(1);
    await act(async () => finish({ ok: true, data: { id: "saved" } }));
    expect(screen.getByRole("status", { name: "Save confirmation" })).toHaveTextContent("Saved $5.00");
  });

  it("switches the account with KHR and saves whole riel", async () => {
    createTransaction.mockResolvedValue({ ok: true, data: { id: "saved" } });
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "KHR" }));
    expect(screen.getByRole("button", { name: "." })).toBeDisabled();
    for (const digit of "12000") await user.click(screen.getByRole("button", { name: digit }));
    await user.click(screen.getByRole("button", { name: "Save expense" }));
    expect(createTransaction).toHaveBeenCalledWith(expect.objectContaining({ currency: "KHR", amount: "12000", accountId: DEMO_ACCOUNTS.find(account => account.currency === "KHR")!.accountId }));
    expect(screen.getByRole("status", { name: "Save confirmation" })).toHaveTextContent("12,000៛");
  });
});
