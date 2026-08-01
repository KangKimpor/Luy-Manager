import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TransferForm } from "./transfer-form";
import type { AccountBalance } from "@/lib/domain/types";
import { exchangeRate } from "@/lib/money";

/**
 * The transfer form is the most logic-dense component in the app: it plans a
 * cross-currency transfer, previews what will arrive, lets the user override it, and
 * reports the rate they actually got. All of that was covered only at the domain
 * layer, so these tests are about the wiring: that the right figures reach the
 * screen and the right arguments reach the server action.
 */

const createTransfer = vi.hoisted(() => vi.fn());

vi.mock("@/app/actions/transactions", () => ({ createTransfer }));

// The form navigates on nothing, but it lives under a router in the real app.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const rate = exchangeRate(4100, "USD", "KHR", new Date("2026-07-01"));

function account(overrides: Partial<AccountBalance>): AccountBalance {
  return {
    accountId: "a1",
    userId: "u1",
    name: "Account",
    institution: null,
    type: "bank",
    currency: "USD",
    icon: null,
    color: null,
    isActive: true,
    includeInNetWorth: true,
    sortOrder: 0,
    countsTowardNetWorth: true,
    currentBalance: 100_000,
    transactionCount: 0,
    lastActivityAt: null,
    ...overrides,
  };
}

const usd = account({
  accountId: "usd-1",
  name: "ABA USD",
  currency: "USD",
  currentBalance: 184_250, // $1,842.50
});

const khr = account({
  accountId: "khr-1",
  name: "Wing",
  type: "ewallet",
  currency: "KHR",
  currentBalance: 385_000,
});

const cashUsd = account({
  accountId: "usd-2",
  name: "Cash USD",
  type: "cash",
  currency: "USD",
  currentBalance: 2_000, // $20
});

beforeEach(() => {
  createTransfer.mockReset();
  createTransfer.mockResolvedValue({ ok: true, data: { transferGroupId: "g1" } });
});

/** Type an amount on the custom keypad, which has no text input. */
async function typeAmount(user: ReturnType<typeof userEvent.setup>, digits: string) {
  for (const digit of digits) {
    await user.click(screen.getByRole("button", { name: digit }));
  }
}

describe("account selection", () => {
  it("offers a From and a To side", () => {
    render(<TransferForm accounts={[usd, khr, cashUsd]} rate={rate} />);

    expect(screen.getByText("From")).toBeInTheDocument();
    expect(screen.getByText("To")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /swap the two accounts/i })).toBeInTheDocument();
  });

  it("defaults the destination to an account in the other currency", async () => {
    const user = userEvent.setup();
    render(<TransferForm accounts={[usd, khr, cashUsd]} rate={rate} />);

    // Exchanging is the common case here, so the preview should be reachable
    // without first re-picking the destination.
    await typeAmount(user, "1");

    expect(screen.getByText("Arrives in Wing")).toBeInTheDocument();
  });

  it("needs two accounts before it will show a form", () => {
    render(<TransferForm accounts={[usd]} rate={rate} />);

    expect(screen.getByText(/transfer needs two accounts/i)).toBeDefined();
  });
});

describe("cross-currency preview", () => {
  it("converts across the minor-unit scale gap", async () => {
    const user = userEvent.setup();
    render(<TransferForm accounts={[usd, khr]} rate={rate} />);

    await typeAmount(user, "100");

    // $100 at 4,100 is 410,000៛, not 41,000,000. KHR has no subunit.
    expect(screen.getByText("410,000៛")).toBeDefined();
    expect(screen.getByText(/4,100៛ per \$1/)).toBeDefined();
  });

  it("shows the resulting balance on both sides", async () => {
    const user = userEvent.setup();
    render(<TransferForm accounts={[usd, khr]} rate={rate} />);

    await typeAmount(user, "100");

    // 184,250 - 10,000 = 174,250 cents; 385,000 + 410,000 = 795,000 riel.
    expect(screen.getByText("$1,742.50")).toBeDefined();
    expect(screen.getByText("795,000៛")).toBeDefined();
  });

  it("lets the user override what actually arrived and reports their real rate", async () => {
    const user = userEvent.setup();
    render(<TransferForm accounts={[usd, khr]} rate={rate} />);

    await typeAmount(user, "100");
    await user.type(screen.getByLabelText(/amount received/i), "400000");

    // The user's figure wins, and the rate shown is the one they actually got.
    expect(screen.getByText(/4,000៛ per \$1/)).toBeDefined();
    // The table's figure stays visible for comparison.
    expect(screen.getByText(/table says/i)).toBeDefined();
  });

  it("does not show a conversion panel for a same-currency transfer", async () => {
    const user = userEvent.setup();
    render(<TransferForm accounts={[usd, cashUsd]} rate={rate} />);

    // Both accounts are USD, so there is nothing to convert.
    await typeAmount(user, "50");

    expect(screen.queryByText(/arrives in/i)).toBeNull();
    expect(screen.queryByLabelText(/amount received/i)).toBeNull();
  });
});

describe("warnings", () => {
  it("warns when the source would go below zero", async () => {
    const user = userEvent.setup();
    render(<TransferForm accounts={[cashUsd, usd]} rate={rate} />);

    // Cash USD holds $20; moving $50 overdraws it.
    await typeAmount(user, "50");

    expect(screen.getByText(/would go below zero/i)).toBeDefined();
  });

  it("still allows the transfer, because the ledger has to record what happened", async () => {
    const user = userEvent.setup();
    render(<TransferForm accounts={[cashUsd, usd]} rate={rate} />);

    await typeAmount(user, "50");

    expect(screen.getByRole("button", { name: /transfer/i })).not.toBeDisabled();
  });

  it("flags a received amount far from the current rate", async () => {
    const user = userEvent.setup();
    render(<TransferForm accounts={[usd, khr]} rate={rate} />);

    await typeAmount(user, "100");
    // 41,000 instead of 410,000: a decimal slip when typing riel.
    await user.type(screen.getByLabelText(/amount received/i), "41000");

    expect(screen.getByText(/away from the current rate/i)).toBeDefined();
  });
});

describe("saving", () => {
  it("cannot save a zero amount", () => {
    render(<TransferForm accounts={[usd, khr]} rate={rate} />);

    expect(screen.getByRole("button", { name: /exchange and transfer|transfer/i })).toBeDisabled();
  });

  it("sends the accounts and the typed amount to the action", async () => {
    const user = userEvent.setup();
    render(<TransferForm accounts={[usd, khr]} rate={rate} />);

    await typeAmount(user, "100");
    await user.click(screen.getByRole("button", { name: /exchange and transfer/i }));

    expect(createTransfer).toHaveBeenCalledOnce();
    expect(createTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        fromAccountId: "usd-1",
        toAccountId: "khr-1",
        // Sent as typed, for the server's money layer to parse.
        amount: "100",
      }),
    );
  });

  it("passes an overridden received amount through", async () => {
    const user = userEvent.setup();
    render(<TransferForm accounts={[usd, khr]} rate={rate} />);

    await typeAmount(user, "100");
    await user.type(screen.getByLabelText(/amount received/i), "400000");
    await user.click(screen.getByRole("button", { name: /exchange and transfer/i }));

    expect(createTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ receivedAmount: "400000" }),
    );
  });

  it("surfaces a failure from the action instead of claiming success", async () => {
    createTransfer.mockResolvedValue({ ok: false, error: "Wing is closed." });

    const user = userEvent.setup();
    render(<TransferForm accounts={[usd, khr]} rate={rate} />);

    await typeAmount(user, "100");
    await user.click(screen.getByRole("button", { name: /exchange and transfer/i }));

    expect(await screen.findByText("Wing is closed.")).toBeDefined();
  });

  it("reports what moved after a successful save", async () => {
    const user = userEvent.setup();
    render(<TransferForm accounts={[usd, khr]} rate={rate} />);

    await typeAmount(user, "100");
    await user.click(screen.getByRole("button", { name: /exchange and transfer/i }));

    // Queried by its text, not by role: the amount display is an <output>, which
    // also carries an implicit role of "status", so the role alone is ambiguous.
    const confirmation = await screen.findByText(/^Transferred/);

    // Both figures, so the confirmation says what landed as well as what left.
    expect(confirmation).toHaveTextContent("$100.00");
    expect(confirmation).toHaveTextContent("410,000៛");
    expect(confirmation).toHaveTextContent("Wing");
  });

  it("does not call the action in read-only demo mode", async () => {
    const user = userEvent.setup();
    render(<TransferForm accounts={[usd, khr]} rate={rate} readOnly />);

    await typeAmount(user, "100");

    expect(screen.getByRole("button", { name: /exchange and transfer/i })).toBeDisabled();
    expect(createTransfer).not.toHaveBeenCalled();
  });
});
