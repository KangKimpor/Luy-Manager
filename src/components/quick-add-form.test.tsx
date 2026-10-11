import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QuickAddForm } from "./quick-add-form";
import { DEMO_ACCOUNTS, DEMO_CATEGORIES } from "@/lib/demo-data";
import { DEFAULT_RATE } from "@/lib/money";
import { calendarDate } from "@/lib/calendar";

const createTransaction = vi.hoisted(() => vi.fn());
const readEntryRate = vi.hoisted(() => vi.fn());
vi.mock("@/app/actions/transactions", () => ({ createTransaction }));
vi.mock("@/app/actions/entry-options", () => ({ readEntryRate }));

beforeEach(() => { createTransaction.mockReset(); readEntryRate.mockReset().mockResolvedValue({ ok: true, data: DEFAULT_RATE }); });

function renderForm() {
  return render(<QuickAddForm accounts={DEMO_ACCOUNTS} categories={DEMO_CATEGORIES} type="expense" />);
}

describe("transaction save feedback", () => {
  it("saves a chosen date and visible note without opening More options, then returns to today", async () => {
    createTransaction.mockResolvedValue({ ok: true, data: { id: "saved" } });
    const user = userEvent.setup();
    render(<QuickAddForm accounts={DEMO_ACCOUNTS} categories={DEMO_CATEGORIES} type="expense" initialDate="2026-10-11" />);
    expect(screen.getByLabelText("Note").closest("details")).toBeNull();
    await user.type(screen.getByLabelText("Note"), "Dinner with family");
    await user.click(screen.getByRole("button", { name: "Yesterday" }));
    await user.click(screen.getByRole("button", { name: "5" }));
    await user.click(screen.getByRole("button", { name: "Save expense" }));
    expect(createTransaction).toHaveBeenCalledWith(expect.objectContaining({ notes: "Dinner with family", occurredAt: "2026-10-10T05:00:00.000Z" }));
    expect(screen.getByLabelText("Note")).toHaveValue("");
    expect(screen.getByLabelText("Date")).toHaveValue(calendarDate(new Date()));
  });

  it("refuses a missing date without submitting or losing the note", async () => {
    const user = userEvent.setup(); renderForm();
    await user.click(screen.getByRole("button", { name: "5" }));
    await user.type(screen.getByLabelText("Note"), "Keep me");
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "" } });
    expect(screen.getByRole("button", { name: "Save expense" })).toBeDisabled();
    expect(screen.getByLabelText("Note")).toHaveValue("Keep me");
    expect(createTransaction).not.toHaveBeenCalled();
  });

  it("searches a distant KHR wallet and a category instead of scrolling through either list", async () => {
    createTransaction.mockResolvedValue({ ok: true, data: { id: "saved" } });
    const user = userEvent.setup(); renderForm();
    await user.click(screen.getByRole("button", { name: "All accounts" }));
    await user.type(screen.getByRole("searchbox", { name: "Search accounts" }), "TrueMoney");
    await user.click(screen.getByRole("button", { name: "TrueMoney" }));
    expect(screen.getByRole("button", { name: "." })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "All categories" }));
    await user.type(screen.getByRole("searchbox", { name: "Search categories" }), "Dental");
    await user.click(screen.getByRole("button", { name: "Dental" }));
    for (const digit of "6000") await user.click(screen.getByRole("button", { name: digit }));
    await user.click(screen.getByRole("button", { name: "Save expense" }));
    expect(createTransaction).toHaveBeenCalledWith(expect.objectContaining({ accountId: "acc-truemoney", currency: "KHR", amount: "6000", categoryId: "cat-dental" }));
  });

  it("searches categories independently for each split and keeps the chosen IDs when saving", async () => {
    createTransaction.mockResolvedValue({ ok: true, data: { id: "saved" } });
    const user = userEvent.setup(); renderForm();
    await user.click(screen.getByRole("button", { name: "5" }));
    await user.click(screen.getByText("More options"));
    await user.click(screen.getByRole("button", { name: "Split it" }));
    await user.type(screen.getByLabelText("Split 1 amount"), "2");
    await user.type(screen.getByLabelText("Split 2 amount"), "3");
    for (const [index, name] of ["Dental", "Groceries"].entries()) {
      const picker = within(screen.getByRole("group", { name: `Split ${index + 1} category` }));
      await user.click(picker.getByRole("button", { name: "All categories" }));
      await user.type(picker.getByRole("searchbox", { name: "Search categories" }), name);
      await user.click(picker.getByRole("button", { name }));
    }
    await user.click(screen.getByRole("button", { name: "Save expense" }));
    expect(createTransaction).toHaveBeenCalledWith(expect.objectContaining({
      splits: [{ categoryId: "cat-dental", amount: "2", notes: null }, { categoryId: "cat-groceries", amount: "3", notes: null }],
    }));
  });
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
