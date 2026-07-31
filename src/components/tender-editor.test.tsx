import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { newTender, parseTenders, TenderEditor, tenderTotal } from "./tender-editor";
import { exchangeRate } from "@/lib/money";

/**
 * PRD Section 7's headline example: one purchase paid with $3 and 20,000៛.
 *
 * The property that matters is that the total is *derived* from the tenders rather
 * than entered separately, so it cannot disagree with what was handed over. These
 * tests pin that, and pin the scale gap — the arithmetic most likely to be wrong by
 * a factor of 100.
 */

const rate = exchangeRate(4100, "USD", "KHR", new Date("2026-07-01"));

describe("tenderTotal", () => {
  it("combines dollars and riel into the account's currency", () => {
    const total = tenderTotal(
      [
        { id: "1", amount: "3", currency: "USD" },
        { id: "2", amount: "20000", currency: "KHR" },
      ],
      "USD",
      rate,
    );

    // $3 plus 20,000៛ (=$4.88 at 4,100) is $7.88 — 788 cents.
    expect(total?.minor).toBe(788);
    expect(total?.currency).toBe("USD");
  });

  it("combines the same tenders into riel without a 100x error", () => {
    const total = tenderTotal(
      [
        { id: "1", amount: "3", currency: "USD" },
        { id: "2", amount: "20000", currency: "KHR" },
      ],
      "KHR",
      rate,
    );

    // 12,300៛ + 20,000៛ = 32,300៛. Not 3,230,000: riel has no subunit.
    expect(total?.minor).toBe(32_300);
  });

  it("ignores rows still being typed", () => {
    const total = tenderTotal(
      [
        { id: "1", amount: "3", currency: "USD" },
        { id: "2", amount: "", currency: "KHR" },
      ],
      "USD",
      rate,
    );

    expect(total?.minor).toBe(300);
  });

  it("returns null rather than zero when nothing is entered", () => {
    // Null so the caller can tell "not ready" from "genuinely nothing", and never
    // shows a misleading $0.00 mid-entry.
    expect(tenderTotal([newTender("USD")], "USD", rate)).toBeNull();
  });

  it("returns null when a tender is zero or negative", () => {
    expect(
      tenderTotal([{ id: "1", amount: "0", currency: "USD" }], "USD", rate),
    ).toBeNull();
  });

  it("returns null for unparseable input rather than throwing", () => {
    expect(
      tenderTotal([{ id: "1", amount: "abc", currency: "USD" }], "USD", rate),
    ).toBeNull();
  });
});

describe("parseTenders", () => {
  it("drops blank rows and trims the rest", () => {
    const parsed = parseTenders([
      { id: "1", amount: " 3 ", currency: "USD" },
      { id: "2", amount: "   ", currency: "KHR" },
    ]);

    expect(parsed).toEqual([{ amount: "3", currency: "USD" }]);
  });
});

describe("TenderEditor", () => {
  const twoTenders = [
    { id: "1", amount: "3", currency: "USD" as const },
    { id: "2", amount: "20000", currency: "KHR" as const },
  ];

  it("shows the derived total, not an editable one", () => {
    render(
      <TenderEditor
        tenders={twoTenders}
        targetCurrency="USD"
        rate={rate}
        onChange={vi.fn()}
      />,
    );

    // Appears twice by design: once as the total, once in the explanation beneath.
    expect(screen.getAllByText("$7.88").length).toBeGreaterThan(0);

    // There is no input for the total: it is a consequence of the tenders, not a
    // field that could disagree with them.
    const inputs = screen.getAllByRole("textbox");
    expect(inputs).toHaveLength(twoTenders.length);
  });

  it("explains that it is recorded as one purchase", () => {
    render(
      <TenderEditor
        tenders={twoTenders}
        targetCurrency="USD"
        rate={rate}
        onChange={vi.fn()}
      />,
    );

    // Two transactions would double-count the purchase in category totals.
    expect(screen.getByText(/Recorded as one purchase/i)).toBeInTheDocument();
  });

  it("reports a change when an amount is edited", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      <TenderEditor
        tenders={[{ id: "1", amount: "", currency: "USD" }]}
        targetCurrency="USD"
        rate={rate}
        onChange={onChange}
      />,
    );

    await user.type(screen.getByLabelText("Amount in USD"), "5");

    expect(onChange).toHaveBeenCalledWith([
      { id: "1", amount: "5", currency: "USD" },
    ]);
  });

  it("drops the fractional part when a row switches to riel", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      <TenderEditor
        tenders={[{ id: "1", amount: "3.50", currency: "USD" }]}
        targetCurrency="USD"
        rate={rate}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "KHR" }));

    // Riel has no subunit, so "3.50" cannot survive the switch.
    expect(onChange).toHaveBeenCalledWith([
      { id: "1", amount: "3", currency: "KHR" },
    ]);
  });

  it("shows a dash rather than a zero total before anything is entered", () => {
    render(
      <TenderEditor
        tenders={[newTender("USD")]}
        targetCurrency="USD"
        rate={rate}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("$0.00")).toBeNull();
  });

  it("warns when a filled tender is not a usable amount", () => {
    render(
      <TenderEditor
        tenders={[{ id: "1", amount: "0", currency: "USD" }]}
        targetCurrency="USD"
        rate={rate}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(/above zero/i);
  });
});
