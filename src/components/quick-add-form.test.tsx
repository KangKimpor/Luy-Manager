import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QuickAddForm } from "./quick-add-form";
import { DEMO_ACCOUNTS, DEMO_CATEGORIES } from "@/lib/demo-data";
import { DEFAULT_RATE } from "@/lib/money";
import { calendarDate } from "@/lib/calendar";
import { learnEntryHabits } from "@/lib/domain/entry-habits";
import { DEMO_TRANSACTIONS } from "@/lib/demo-data";

const createTransaction = vi.hoisted(() => vi.fn());
const readEntryRate = vi.hoisted(() => vi.fn());
vi.mock("@/app/actions/transactions", () => ({ createTransaction }));
vi.mock("@/app/actions/entry-options", () => ({ readEntryRate }));

beforeEach(() => { createTransaction.mockReset(); readEntryRate.mockReset().mockResolvedValue({ ok: true, data: DEFAULT_RATE }); });

function renderForm() {
  return render(<QuickAddForm accounts={DEMO_ACCOUNTS} categories={DEMO_CATEGORIES} type="expense" />);
}

describe("transaction save feedback", () => {
  it("orders account row, category row, note-date row, keypad and pinned save button", () => {
    renderForm();
    const accountsRow = screen.getByRole("group", { name: "Account" });
    const categoriesRow = screen.getByRole("group", { name: "Category" });
    const noteInput = screen.getByLabelText("Note");
    const dateButton = screen.getByRole("button", { name: "Date: Today" });
    const keypad = screen.getByRole("group", { name: "Amount keypad" });
    const saveButton = screen.getByRole("button", { name: "Enter an amount" });

    expect(accountsRow.compareDocumentPosition(categoriesRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(categoriesRow.compareDocumentPosition(noteInput) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(noteInput.compareDocumentPosition(dateButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(dateButton.compareDocumentPosition(keypad) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(keypad.compareDocumentPosition(saveButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // USD mode shows only USD accounts inline plus the "All accounts" trigger.
    expect(within(accountsRow).getAllByRole("button")).toHaveLength(6);
    expect(within(accountsRow).getByRole("button", { name: "ABA USD" })).toBeVisible();
    expect(within(accountsRow).getByRole("button", { name: "All accounts" })).toBeVisible();
    expect(within(accountsRow).queryByRole("button", { name: "ABA KHR" })).toBeNull();
    expect(screen.queryByRole("button", { name: "More options" })).toBeNull();
    expect(saveButton).toBeDisabled();
  });

  it("shows the six most used categories plus an All categories button", async () => {
    const user = userEvent.setup();
    render(
      <QuickAddForm
        accounts={DEMO_ACCOUNTS}
        categories={DEMO_CATEGORIES}
        type="expense"
        categoryUsage={{ "cat-health": 40, "cat-drinks": 30 }}
      />,
    );

    const categoriesRow = screen.getByRole("group", { name: "Category" });
    const chips = within(categoriesRow).getAllByRole("button");
    expect(chips).toHaveLength(7);
    expect(chips[0]).toHaveAccessibleName("Health");
    expect(chips[1]).toHaveAccessibleName("Drinks");
    expect(within(categoriesRow).getByRole("button", { name: "All categories" })).toBeInTheDocument();

    await user.click(within(categoriesRow).getByRole("button", { name: "All categories" }));
    const dialog = screen.getByRole("dialog", { name: "Category" });
    expect(within(dialog).getByRole("button", { name: "Housing" })).toBeInTheDocument();
  });

  it("fills Drinks and Coffee for the learned KHR amount and keeps user edits", async () => {
    const user = userEvent.setup();
    createTransaction.mockResolvedValue({ ok: false, error: "Keep the draft" });
    const coffee = { ...DEMO_TRANSACTIONS[0], type: "expense" as const, currency: "KHR" as const,
      amount: -600000, categoryId: "cat-drinks", notes: "Coffee" };
    render(<QuickAddForm accounts={DEMO_ACCOUNTS} categories={DEMO_CATEGORIES} type="expense"
      habits={learnEntryHabits([coffee, coffee, coffee], DEMO_CATEGORIES)} />);
    await user.click(screen.getByRole("button", { name: "KHR" }));
    for (const digit of "6000") await user.click(screen.getByRole("button", { name: digit }));
    expect(screen.getByLabelText("Note")).toHaveValue("Coffee");
    expect(screen.getByText("Suggested from your usual entries. You can change the note or category.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Save expense, 6,000/ }));
    expect(createTransaction.mock.lastCall?.[0]).toMatchObject({ accountId: "acc-aba-khr", amount: "6000", currency: "KHR", categoryId: "cat-drinks", notes: "Coffee" });
    await user.clear(screen.getByLabelText("Note"));
    await user.type(screen.getByLabelText("Note"), "Lunch");
    const categoriesRow = screen.getByRole("group", { name: "Category" });
    expect(within(categoriesRow).getByRole("button", { name: "Food" })).toHaveAttribute("aria-pressed", "true");
    await user.click(within(categoriesRow).getByRole("button", { name: "Food" }));
    expect(within(categoriesRow).getByRole("button", { name: "Food" })).toHaveAttribute("aria-pressed", "false");
    await user.click(screen.getByRole("button", { name: "USD" }));
    expect(screen.getByLabelText("Note")).toHaveValue("Lunch");
    await user.click(screen.getByRole("button", { name: "Save expense, $6,000.00" }));
    expect(createTransaction.mock.lastCall?.[0]).toMatchObject({ currency: "USD", notes: "Lunch", categoryId: null });
  });

  it("removes an untouched habit suggestion when the amount or currency changes", async () => {
    const user = userEvent.setup();
    render(<QuickAddForm accounts={DEMO_ACCOUNTS} categories={DEMO_CATEGORIES} type="expense"
      habits={[{ type: "expense", amount: { minor: 600000, currency: "KHR" }, categoryId: "cat-drinks", note: "Coffee" }]} />);
    await user.click(screen.getByRole("button", { name: "KHR" }));
    for (const digit of "6000") await user.click(screen.getByRole("button", { name: digit }));
    expect(screen.getByLabelText("Note")).toHaveValue("Coffee");
    await user.click(screen.getByRole("button", { name: "USD" }));
    expect(screen.getByLabelText("Note")).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "KHR" }));
    expect(screen.getByLabelText("Note")).toHaveValue("Coffee");
    await user.click(screen.getByRole("button", { name: "1" }));
    expect(screen.getByLabelText("Note")).toHaveValue("");
  });

  it("prefills amount, matching account, category and note from initialHabit", async () => {
    const user = userEvent.setup();
    createTransaction.mockResolvedValue({ ok: true, data: { id: "saved" } });
    render(
      <QuickAddForm
        accounts={DEMO_ACCOUNTS}
        categories={DEMO_CATEGORIES}
        type="expense"
        initialHabit={{
          type: "expense",
          amount: { minor: 600000, currency: "KHR" },
          categoryId: "cat-drinks",
          note: "Coffee",
        }}
      />,
    );
    expect(screen.getByLabelText("Amount entered")).toHaveTextContent("6,000៛");
    expect(screen.getByLabelText("Note")).toHaveValue("Coffee");
    expect(screen.getByRole("button", { name: "Drinks" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: /^Save expense, 6,000/ }));
    expect(createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "acc-aba-khr",
        currency: "KHR",
        amount: "6000",
        categoryId: "cat-drinks",
        notes: "Coffee",
      }),
    );
  });

  it("pastes and saves an exact bank amount, preserving the draft on invalid paste", async () => {
    const user = userEvent.setup(); renderForm();
    createTransaction.mockResolvedValue({ ok: false, error: "Keep the draft" });
    const clipboard = vi.spyOn(navigator.clipboard, "readText").mockResolvedValue("$1,234.56");
    await user.click(screen.getByRole("button", { name: "Paste amount" }));
    expect(screen.getByLabelText("Amount entered")).toHaveTextContent("$1,234.56");
    clipboard.mockResolvedValue("1.234");
    await user.click(screen.getByRole("button", { name: "Paste amount" }));
    expect(screen.getByRole("alert")).toHaveTextContent("up to two decimal places");
    await user.click(screen.getByRole("button", { name: "Save expense, $1,234.56" }));
    expect(createTransaction.mock.lastCall?.[0]).toMatchObject({ amount: "1234.56", currency: "USD" });
    clipboard.mockRestore();
  });

  it("supports native paste and keeps the draft when clipboard permission is denied", async () => {
    const user = userEvent.setup(); renderForm();
    const clipboard = vi.spyOn(navigator.clipboard, "readText").mockRejectedValue(new Error("Denied"));
    await user.click(screen.getByRole("button", { name: "5" }));
    await user.click(screen.getByRole("button", { name: "Paste amount" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Clipboard access is unavailable");
    expect(screen.getByLabelText("Amount entered")).toHaveTextContent("$5.00");
    fireEvent.paste(screen.getByLabelText("Amount entered"), { clipboardData: { getData: () => "25.50" } });
    expect(screen.getByLabelText("Amount entered")).toHaveTextContent("$25.50");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    clipboard.mockRestore();
  });

  it("suggests from the note and preserves an explicit clear when the note changes", async () => {
    createTransaction.mockResolvedValue({ ok: false, error: "Keep the draft" });
    const user = userEvent.setup(); renderForm();
    await user.type(screen.getByLabelText("Note"), "Brown coffee");
    expect(screen.getByText("Suggested from your note. Choose another category or clear it.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "5" }));
    await user.click(screen.getByRole("button", { name: "Save expense, $5.00" }));
    expect(createTransaction.mock.lastCall?.[0]).toMatchObject({ categoryId: "cat-drinks" });
    await user.click(within(screen.getByRole("group", { name: "Category" })).getByRole("button", { name: "Drinks" }));
    await user.clear(screen.getByLabelText("Note"));
    await user.type(screen.getByLabelText("Note"), "Rent");
    await user.click(screen.getByRole("button", { name: "Save expense, $5.00" }));
    expect(createTransaction.mock.lastCall?.[0]).toMatchObject({ categoryId: null });
  });

  it("keeps a manually selected category when the note suggests another", async () => {
    createTransaction.mockResolvedValue({ ok: true, data: { id: "saved" } });
    const user = userEvent.setup(); renderForm();
    await user.click(screen.getByRole("button", { name: "Groceries" }));
    await user.type(screen.getByLabelText("Note"), "Coffee");
    await user.click(screen.getByRole("button", { name: "5" }));
    await user.click(screen.getByRole("button", { name: "Save expense, $5.00" }));
    expect(createTransaction.mock.lastCall?.[0]).toMatchObject({ categoryId: "cat-groceries" });
  });

  it("saves a chosen date and visible note without opening a picker, then returns to today", async () => {
    createTransaction.mockResolvedValue({ ok: true, data: { id: "saved" } });
    const user = userEvent.setup();
    render(<QuickAddForm accounts={DEMO_ACCOUNTS} categories={DEMO_CATEGORIES} type="expense" initialDate="2026-10-11" />);
    expect(screen.getByLabelText("Note").closest("details")).toBeNull();
    await user.type(screen.getByLabelText("Note"), "Dinner with family");
    await user.click(screen.getByRole("button", { name: "Date: Today" }));
    await user.click(screen.getByRole("button", { name: "Yesterday" }));
    expect(screen.getByRole("button", { name: "Date: Yesterday" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "5" }));
    await user.click(screen.getByRole("button", { name: "Save expense, $5.00" }));
    expect(createTransaction).toHaveBeenCalledWith(expect.objectContaining({ notes: "Dinner with family", occurredAt: "2026-10-10T05:00:00.000Z" }));
    expect(screen.getByLabelText("Note")).toHaveValue("");
    await user.click(screen.getByRole("button", { name: /^Date:/ }));
    expect(screen.getByLabelText("Date")).toHaveValue(calendarDate(new Date()));
  });

  it("refuses a missing date without submitting or losing the note", async () => {
    const user = userEvent.setup(); renderForm();
    await user.click(screen.getByRole("button", { name: "5" }));
    await user.type(screen.getByLabelText("Note"), "Keep me");
    await user.click(screen.getByRole("button", { name: "Date: Today" }));
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "" } });
    expect(screen.getByRole("button", { name: "Save expense, $5.00" })).toBeDisabled();
    expect(screen.getByLabelText("Note")).toHaveValue("Keep me");
    expect(createTransaction).not.toHaveBeenCalled();
  });

  it("searches a distant KHR wallet and a category in dialog sheets and returns focus when dismissed", async () => {
    createTransaction.mockResolvedValue({ ok: true, data: { id: "saved" } });
    const user = userEvent.setup(); renderForm();
    const allAccountsTrigger = screen.getByRole("button", { name: "All accounts" });
    await user.click(allAccountsTrigger);
    const accountDialog = screen.getByRole("dialog", { name: "Account" });
    await user.type(within(accountDialog).getByRole("searchbox", { name: "Search accounts" }), "TrueMoney");
    await user.click(within(accountDialog).getByRole("button", { name: "TrueMoney" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "." })).toBeEnabled();

    const searchCategoriesTrigger = screen.getByRole("button", { name: "All categories" });
    await user.click(searchCategoriesTrigger);
    const categoryDialog = screen.getByRole("dialog", { name: "Category" });
    expect(categoryDialog).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(searchCategoriesTrigger).toHaveFocus();

    await user.click(searchCategoriesTrigger);
    const reopenedDialog = screen.getByRole("dialog", { name: "Category" });
    await user.type(within(reopenedDialog).getByRole("searchbox", { name: "Search categories" }), "Health");
    await user.click(within(reopenedDialog).getByRole("button", { name: "Health" }));
    for (const digit of "6000") await user.click(screen.getByRole("button", { name: digit }));
    await user.click(screen.getByRole("button", { name: /^Save expense, 6,000/ }));
    expect(createTransaction).toHaveBeenCalledWith(expect.objectContaining({ accountId: "acc-truemoney", currency: "KHR", amount: "6000", categoryId: "cat-health" }));
  });

  it("confirms the saved amount after clearing the keypad", async () => {
    createTransaction.mockResolvedValue({ ok: true, data: { id: "saved" } });
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "5" }));
    await user.click(screen.getByRole("button", { name: "Save expense, $5.00" }));
    expect(screen.getByRole("status", { name: "Save confirmation" })).toHaveTextContent("Saved $5.00");
    expect(screen.getByLabelText("Amount entered")).toHaveTextContent("$0.00");
  });

  it("keeps input on failure and allows a retry", async () => {
    createTransaction.mockResolvedValueOnce({ ok: false, error: "Please try again." }).mockResolvedValueOnce({ ok: true, data: { id: "saved" } });
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "5" }));
    await user.click(screen.getByRole("button", { name: "Save expense, $5.00" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Please try again.");
    expect(screen.getByLabelText("Amount entered")).toHaveTextContent("$5.00");
    await user.click(screen.getByRole("button", { name: "Save expense, $5.00" }));
    expect(createTransaction).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("status", { name: "Save confirmation" })).toHaveTextContent("Saved $5.00");
  });

  it("releases the saving state if the request throws", async () => {
    createTransaction.mockRejectedValue(new Error("network"));
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "5" }));
    await user.click(screen.getByRole("button", { name: "Save expense, $5.00" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Check Activity");
    expect(screen.getByRole("button", { name: "Save expense, $5.00" })).toBeEnabled();
    expect(screen.getByLabelText("Amount entered")).toHaveTextContent("$5.00");
  });

  it("disables editing and duplicate submissions until the save finishes", async () => {
    let finish!: (value: { ok: true; data: { id: string } }) => void;
    createTransaction.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "5" }));
    await user.click(screen.getByRole("button", { name: "Save expense, $5.00" }));
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
    expect(screen.getByRole("button", { name: "." })).toBeEnabled();
    for (const digit of "12000") await user.click(screen.getByRole("button", { name: digit }));
    await user.click(screen.getByRole("button", { name: /^Save expense, 12,000/ }));
    expect(createTransaction).toHaveBeenCalledWith(expect.objectContaining({ currency: "KHR", amount: "12000", accountId: DEMO_ACCOUNTS.find(account => account.currency === "KHR")!.accountId }));
    expect(screen.getByRole("status", { name: "Save confirmation" })).toHaveTextContent("12,000៛");
  });

  it("offers the 000 key for KHR and disables it after a decimal point", async () => {
    createTransaction.mockResolvedValue({ ok: true, data: { id: "saved" } });
    const user = userEvent.setup();
    renderForm();
    expect(screen.queryByRole("button", { name: "000" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "KHR" }));
    const tripleZero = screen.getByRole("button", { name: "000" });
    expect(tripleZero).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "5" }));
    await user.click(tripleZero);
    expect(screen.getByLabelText("Amount entered")).toHaveTextContent("5,000៛");
    await user.click(screen.getByRole("button", { name: "." }));
    expect(screen.getByRole("button", { name: "000" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /^Save expense, 5,000/ }));
    expect(createTransaction).toHaveBeenCalledWith(expect.objectContaining({ currency: "KHR", amount: "5000." }));
  });
});
