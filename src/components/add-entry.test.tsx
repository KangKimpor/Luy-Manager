import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AddEntry } from "./add-entry";
import { DEMO_ACCOUNTS, DEMO_CATEGORIES } from "@/lib/demo-data";
import { DEFAULT_RATE } from "@/lib/money";

const createTransaction = vi.hoisted(() => vi.fn());
const createTransfer = vi.hoisted(() => vi.fn());
const readEntryRate = vi.hoisted(() => vi.fn());

vi.mock("@/app/actions/transactions", () => ({ createTransaction, createTransfer }));
vi.mock("@/app/actions/entry-options", () => ({ readEntryRate }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

beforeEach(() => {
  createTransaction.mockReset();
  createTransfer.mockReset();
  readEntryRate.mockReset().mockResolvedValue({ ok: true, data: DEFAULT_RATE });
});

describe("AddEntry", () => {
  it("preserves the note across Expense, Income and Transfer switches", async () => {
    const user = userEvent.setup();
    render(<AddEntry accounts={DEMO_ACCOUNTS} categories={DEMO_CATEGORIES} rate={DEFAULT_RATE} />);

    const noteInput = screen.getByLabelText("Note");
    await user.type(noteInput, "Shared note");
    await user.click(screen.getByRole("button", { name: "Income" }));
    expect(screen.getByLabelText("Note")).toHaveValue("Shared note");

    await user.click(screen.getByRole("button", { name: "Transfer" }));
    expect(screen.getByLabelText("Note")).toHaveValue("Shared note");

    await user.click(screen.getByRole("button", { name: "Expense" }));
    expect(screen.getByLabelText("Note")).toHaveValue("Shared note");
  });

  it("collapses the transfer advanced options when switching entry types", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AddEntry accounts={DEMO_ACCOUNTS} categories={DEMO_CATEGORIES} rate={DEFAULT_RATE} />,
    );
    const shell = container.querySelector(".add-screen-shell");
    expect(shell).not.toHaveClass("is-expanded");

    await user.click(screen.getByRole("button", { name: "Transfer" }));
    const moreButton = screen.getByRole("button", { name: "More options" });
    expect(moreButton).toHaveAttribute("aria-expanded", "false");
    await user.click(moreButton);
    expect(moreButton).toHaveAttribute("aria-expanded", "true");
    expect(shell).toHaveClass("is-expanded");

    await user.click(screen.getByRole("button", { name: "Expense" }));
    expect(shell).not.toHaveClass("is-expanded");
    expect(screen.queryByRole("button", { name: "More options" })).toBeNull();
  });

  it("closes the picker dialog when its backdrop is clicked", async () => {
    const user = userEvent.setup();
    render(<AddEntry accounts={DEMO_ACCOUNTS} categories={DEMO_CATEGORIES} rate={DEFAULT_RATE} />);

    const trigger = screen.getByRole("button", { name: "All accounts" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Account" });
    fireEvent.click(dialog);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
