"use client";

import { Plus, X } from "lucide-react";

import { MoneyAmount } from "@/components/money-amount";
import { Card, CardBody } from "@/components/ui/card";
import type { Category } from "@/lib/domain/types";
import {
  absolute,
  type CurrencyCode,
  type Money,
  parseAmount,
  splitByWeights,
  subtract,
  sum,
} from "@/lib/money";

/**
 * Splitting one transaction across categories (PRD Section 8).
 *
 * A single supermarket receipt is often groceries plus household plus a bottle of
 * wine, and forcing it into one category makes every category total slightly wrong.
 *
 * The figures typed here are treated as *weights*, not final amounts. `$10.00`
 * split three ways as 3.33 / 3.33 / 3.33 loses a cent, and the lost cent has to go
 * somewhere explicit — so the entered values are redistributed with the money
 * layer's largest-remainder split, which sums back to the parent exactly. The
 * preview shows what will actually be stored, including the redistribution.
 */

export interface SplitDraft {
  id: string;
  categoryId: string | null;
  amount: string;
  notes: string;
}

export function newSplit(): SplitDraft {
  return { id: crypto.randomUUID(), categoryId: null, amount: "", notes: "" };
}

/** Only the rows with a usable amount; blanks are still being typed. */
export function parseSplits(
  splits: readonly SplitDraft[],
): Array<{ categoryId: string | null; amount: string; notes: string | null }> {
  return splits
    .filter((split) => split.amount.trim() !== "")
    .map((split) => ({
      categoryId: split.categoryId,
      amount: split.amount.trim(),
      notes: split.notes.trim() === "" ? null : split.notes.trim(),
    }));
}

/**
 * What will actually be stored, after redistribution.
 *
 * Mirrors exactly what the server action does, so the preview cannot promise a
 * breakdown the save would not produce.
 */
function previewParts(
  splits: readonly SplitDraft[],
  parentAmount: Money,
): Money[] | null {
  const parsed = parseSplits(splits);
  if (parsed.length === 0 || parentAmount.minor === 0) return null;

  try {
    const weights = parsed.map((split) =>
      Math.abs(parseAmount(split.amount, parentAmount.currency).minor),
    );
    if (weights.some((weight) => weight <= 0)) return null;

    return splitByWeights(absolute(parentAmount), weights);
  } catch {
    return null;
  }
}

export function SplitEditor({
  splits,
  parentAmount,
  categories,
  onChange,
}: {
  splits: readonly SplitDraft[];
  parentAmount: Money;
  categories: readonly Category[];
  onChange: (next: SplitDraft[]) => void;
}) {
  const parts = previewParts(splits, parentAmount);
  const currency: CurrencyCode = parentAmount.currency;

  /**
   * Whether each row's stored amount will differ from what was typed.
   *
   * Computed once here rather than inline in the list, so the row only says "saved
   * as" when redistribution actually changes that part.
   */
  const filled = parseSplits(splits);
  const redistributed = parts
    ? parts.map((part, index) => {
        try {
          const typed = absolute(parseAmount(filled[index]?.amount ?? "0", currency));
          return typed.minor !== part.minor;
        } catch {
          return false;
        }
      })
    : [];

  // The entered figures before redistribution, to tell the user when they do not
  // add up to the transaction and are about to be scaled.
  const enteredTotal = (() => {
    const parsed = parseSplits(splits);
    if (parsed.length === 0) return null;
    try {
      return sum(
        parsed.map((split) => absolute(parseAmount(split.amount, currency))),
        currency,
      );
    } catch {
      return null;
    }
  })();

  const drift =
    enteredTotal && parentAmount.minor !== 0
      ? subtract(enteredTotal, absolute(parentAmount))
      : null;

  function update(id: string, patch: Partial<SplitDraft>) {
    onChange(splits.map((split) => (split.id === id ? { ...split, ...patch } : split)));
  }

  return (
    <Card>
      <CardBody className="space-y-3 pt-4">
        <div>
          <p className="text-ink-muted text-xs font-semibold tracking-wide uppercase">
            Split across categories
          </p>
          <p className="text-ink-faint mt-0.5 text-xs">
            One receipt, several categories. The parts always add up to the total.
          </p>
        </div>

        <ul className="space-y-3">
          {splits.map((split, index) => (
            <li key={split.id} className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  value={split.amount}
                  onChange={(event) => update(split.id, { amount: event.target.value })}
                  placeholder={currency === "KHR" ? "12000" : "0.00"}
                  aria-label={`Split ${index + 1} amount`}
                  className="border-border-subtle bg-surface rounded-card text-ink placeholder:text-ink-faint tabular min-h-11 w-24 border px-3 text-sm"
                />

                <select
                  value={split.categoryId ?? ""}
                  onChange={(event) =>
                    update(split.id, {
                      categoryId: event.target.value === "" ? null : event.target.value,
                    })
                  }
                  aria-label={`Split ${index + 1} category`}
                  className="border-border-subtle bg-surface rounded-card text-ink min-h-11 flex-1 border px-2 text-sm"
                >
                  <option value="">Uncategorised</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => onChange(splits.filter((s) => s.id !== split.id))}
                  aria-label={`Remove split ${index + 1}`}
                  className="text-ink-faint hover:text-outflow flex size-8 shrink-0 items-center justify-center"
                >
                  <X size={15} aria-hidden="true" />
                </button>
              </div>

              {/* Only shown when redistribution actually changes this part. */}
              {parts && redistributed[index] ? (
                <p className="text-ink-faint pl-1 text-xs">
                  saved as <MoneyAmount amount={parts[index]} />
                </p>
              ) : null}
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => onChange([...splits, newSplit()])}
          className="text-brand flex items-center gap-1 text-xs font-semibold"
        >
          <Plus size={14} aria-hidden="true" />
          Add a split
        </button>

        {drift && drift.minor !== 0 ? (
          <p className="text-ink-faint border-border-subtle/70 border-t pt-2.5 text-xs">
            Your figures come to <MoneyAmount amount={enteredTotal!} />, which is{" "}
            <MoneyAmount amount={absolute(drift)} />{" "}
            {drift.minor > 0 ? "more" : "less"} than the transaction. They will be
            scaled to fit, so the parts still add up to{" "}
            <MoneyAmount amount={absolute(parentAmount)} />.
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}
