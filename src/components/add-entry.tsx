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
  timezone,
  initialDate,
}: {
  accounts: readonly AccountBalance[];
  categories: readonly Category[];
  rate?: ExchangeRate;
  /** Demo mode: the forms render but cannot persist. */
  readOnly?: boolean;
  initialMode?: EntryMode;
  timezone?: string;
  initialDate?: string;
}) {
  const [mode, setMode] = useState<EntryMode>(initialMode);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div
        className="segmented-control segmented-control-three segmented-control-brand bg-surface-container rounded-2xl"
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
              "rounded-xl min-h-11 text-sm font-semibold",
              mode === option.value ? "text-surface" : "text-ink-muted",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div key={mode} className="form-enter">
      {mode === "transfer" ? (
        <TransferForm accounts={accounts} rate={rate} readOnly={readOnly} timezone={timezone} initialDate={initialDate} />
      ) : (
        // Keyed by mode so switching between expense and income resets the form.
        // Categories differ per type, and a category carried across would no
        // longer apply to the entry being made.
        <QuickAddForm
          key={mode}
          timezone={timezone}
          initialDate={initialDate}
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
