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
 * same decision, made once. Note persists across mode switches and the active
 * form reports whether "More options" is expanded so the container can unlock
 * scrolling when advanced editors are open.
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
  const [note, setNote] = useState<string | null>(() => initialHabit?.note ?? null);
  const [expanded, setExpanded] = useState(false);

  function switchMode(nextMode: EntryMode) {
    if (nextMode === mode) return;
    setExpanded(false);
    setMode(nextMode);
  }

  return (
    <div className={cn("add-screen-shell mx-auto max-w-2xl", expanded && "is-expanded")}>
      <div
        className="segmented-control segmented-control-three segmented-control-full shrink-0"
        role="group"
        aria-label="Entry type"
      >
        {MODES.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={mode === option.value}
            onClick={() => switchMode(option.value)}
            className={cn(
              "relative z-10 min-h-8 text-[13px] leading-[18px] tracking-[-0.006em] whitespace-nowrap",
              mode === option.value ? "text-ink font-semibold" : "text-ink-muted font-medium",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {mode === "transfer" ? (
        <TransferForm
          accounts={accounts}
          rate={rate}
          readOnly={readOnly}
          timezone={timezone}
          initialDate={initialDate}
          note={note ?? ""}
          onNoteChange={(next) => setNote(next === "" ? null : next)}
          onExpandedChange={setExpanded}
        />
      ) : (
        <QuickAddForm
          timezone={timezone}
          initialDate={initialDate}
          type={mode}
          accounts={accounts}
          categories={categories}
          habits={habits}
          initialHabit={initialHabit?.type === mode ? initialHabit : null}
          rate={rate}
          readOnly={readOnly}
          note={note}
          onNoteChange={setNote}
          onExpandedChange={setExpanded}
        />
      )}
    </div>
  );
}
