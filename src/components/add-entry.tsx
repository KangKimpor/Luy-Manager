"use client";

import { useState } from "react";

import { QuickAddForm } from "@/components/quick-add-form";
import { TransferForm } from "@/components/transfer-form";
import type { AccountBalance, Category } from "@/lib/domain/types";
import { DEFAULT_RATE, type ExchangeRate } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Chooses what kind of entry is being made.
 *
 * Expense, Income and Transfer sit in one segmented control because they are the
 * same decision, made once. Transfer is a genuinely different form (two accounts
 * and a conversion instead of one account and a category), so it gets its own
 * component rather than a pile of conditionals inside the transaction form. What
 * they share, the keypad and amount rules, is shared as `amount-keypad`.
 */

const MODES = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer" },
] as const;

export type EntryMode = (typeof MODES)[number]["value"];

export function AddEntry({
  accounts,
  categories,
  rate = DEFAULT_RATE,
  readOnly = false,
  initialMode = "expense",
}: {
  accounts: readonly AccountBalance[];
  categories: readonly Category[];
  rate?: ExchangeRate;
  /** Demo mode: the forms render but cannot persist. */
  readOnly?: boolean;
  initialMode?: EntryMode;
}) {
  const [mode, setMode] = useState<EntryMode>(initialMode);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div
        className="bg-surface-container rounded-2xl flex gap-1 p-1.5"
        role="group"
        aria-label="Entry type"
      >
        {MODES.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={mode === option.value}
            onClick={() => setMode(option.value)}
            className={cn(
              "rounded-xl min-h-11 flex-1 text-sm font-semibold transition-[background-color,color,box-shadow] duration-200",
              mode === option.value ? "bg-brand text-surface shadow-card" : "text-ink-muted",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div key={mode} className="form-enter">
      {mode === "transfer" ? (
        <TransferForm accounts={accounts} rate={rate} readOnly={readOnly} />
      ) : (
        // Keyed by mode so switching between expense and income resets the form.
        // Categories differ per type, and a category carried across would no
        // longer apply to the entry being made.
        <QuickAddForm
          key={mode}
          type={mode}
          accounts={accounts}
          categories={categories}
          rate={rate}
          readOnly={readOnly}
        />
      )}
      </div>
    </div>
  );
}
