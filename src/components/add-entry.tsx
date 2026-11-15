"use client";

import { useState } from "react";

import { QuickAddForm } from "@/components/quick-add-form";
import { TransferForm } from "@/components/transfer-form";
import type { AccountBalance, Category } from "@/lib/domain/types";
import type { EntryHabit } from "@/lib/domain/entry-habits";
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
  habits,
  rate = DEFAULT_RATE,
  readOnly = false,
  initialMode = "expense",
  initialHabit = null,
  timezone,
  initialDate,
}: {
  accounts: readonly AccountBalance[];
  habits?: readonly EntryHabit[];
  categories: readonly Category[];
  rate?: ExchangeRate;
  /** Demo mode: the forms render but cannot persist. */
  readOnly?: boolean;
  initialMode?: EntryMode;
  initialHabit?: EntryHabit | null;
  timezone?: string;
  initialDate?: string;
}) {
  const [mode, setMode] = useState<EntryMode>(initialMode);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div
        className="segmented-control segmented-control-three segmented-control-full"
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
              "relative z-10 min-h-8 text-[13px] leading-[18px] tracking-[-0.006em] whitespace-nowrap before:absolute before:-inset-y-1.5 before:inset-x-0",
              mode === option.value ? "text-ink font-semibold" : "text-ink-muted font-medium",
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
          habits={habits}
          initialHabit={initialHabit?.type === mode ? initialHabit : null}
          rate={rate}
          readOnly={readOnly}
        />
      )}
      </div>
    </div>
  );
}
