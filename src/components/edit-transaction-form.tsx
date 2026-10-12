"use client";

import { Check, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AccountPicker } from "@/components/account-picker";
import { CategoryPicker } from "@/components/category-picker";
import { calendarDate, isCalendarDate, transactionDate } from "@/lib/calendar";
import { CurrencyBadge } from "@/components/money-amount";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { updateTransaction } from "@/app/actions/transactions";
import type { AccountBalance, Category, Transaction, TransactionType } from "@/lib/domain/types";
import { CURRENCY_META, type CurrencyCode } from "@/lib/money";
import { cn } from "@/lib/utils";
import { withActionFeedback } from "@/lib/action-feedback";

/**
 * Amending a transaction.
 *
 * A plain form rather than the keypad: editing is a considered correction, not the
 * five-second capture the keypad exists for, and the fields being visible at once
 * is what makes it obvious what will change.
 *
 * The account may be changed, but only to one holding the same currency. An account
 * is single-currency and the amount is denominated in it, so moving a transaction
 * between currencies would silently reinterpret the figure: 12,000 riel becoming
 * $120.
 */

const EDITABLE_TYPES: TransactionType[] = ["expense", "income", "refund", "adjustment"];

/** Stored minor units as an editable major-unit string. */
function toInput(minor: number, currency: CurrencyCode): string {
  const { decimals } = CURRENCY_META[currency];
  return (Math.abs(minor) / 10 ** decimals).toFixed(decimals);
}

export function EditTransactionForm({
  transaction,
  accounts,
  categories,
  timezone = "Asia/Phnom_Penh",
}: {
  transaction: Transaction;
  accounts: readonly AccountBalance[];
  categories: readonly Category[];
  timezone?: string;
}) {
  const router = useRouter();

  const [type, setType] = useState<TransactionType>(transaction.type);
  const [accountId, setAccountId] = useState(transaction.accountId);
  const [amount, setAmount] = useState(
    toInput(transaction.amount, transaction.currency),
  );
  const [categoryId, setCategoryId] = useState<string | null>(transaction.categoryId);
  const [notes, setNotes] = useState(transaction.notes ?? "");
  const initialDate = calendarDate(new Date(transaction.occurredAt), timezone);
  const [date, setDate] = useState(initialDate);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only accounts in the same currency, for the reason above.
  const sameCurrency = accounts.filter(
    (account) => account.currency === transaction.currency,
  );
  const relevantCategories = categories.filter((category) =>
    category.appliesTo.includes(type),
  );

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);

    let instant: string;
    try {
      if (!isCalendarDate(date)) throw new Error("Choose a valid date.");
      instant = date === initialDate ? transaction.occurredAt : transactionDate(date, timezone).toISOString();
    } catch (cause) { setPending(false); setError(cause instanceof Error ? cause.message : "Choose a valid date."); return; }

    const result = await withActionFeedback(() => updateTransaction({
      id: transaction.id,
      accountId,
      type: type as "expense" | "income" | "refund" | "adjustment",
      amount: amount.trim(),
      currency: transaction.currency,
      categoryId,
      notes: notes.trim() === "" ? null : notes.trim(),
      occurredAt: instant,
    }), "Could not confirm the save. Check Activity before trying again.");

    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    router.push("/transactions");
  }

  return (
    <form onSubmit={handleSubmit} className="page-enter space-y-5" aria-busy={pending}>
      <Card>
        <CardBody className="space-y-3 pt-4">
          <fieldset>
            <legend className="text-ink-muted mb-2 text-sm font-medium">
              Type
            </legend>
            <div className="flex flex-wrap gap-2">
              {EDITABLE_TYPES.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={type === option}
                  onClick={() => {
                    setType(option);
                    setCategoryId(null);
                  }}
                  className={cn(
                    "rounded-pill min-h-9 border px-3 text-xs font-medium capitalize transition-colors",
                    type === option
                      ? "border-brand bg-brand-soft text-brand"
                      : "border-border-subtle bg-surface text-ink-muted",
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          </fieldset>

          <div>
            <label
              htmlFor="edit-amount"
              className="text-ink-muted mb-2 block text-sm font-medium"
            >
              Amount
            </label>
            <div className="flex items-center gap-2">
              <input
                id="edit-amount"
                type="text"
                inputMode="decimal"
                required
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="border-border-subtle bg-surface rounded-card text-ink tabular min-h-11 flex-1 border px-3 text-sm"
              />
              <CurrencyBadge currency={transaction.currency} />
            </div>
            <p className="text-ink-faint mt-1.5 text-xs">
              Enter the magnitude; the sign follows the type.
            </p>
          </div>

          <AccountPicker accounts={sameCurrency} selectedId={accountId} onSelect={(account) => setAccountId(account.accountId)} />
          <CategoryPicker categories={relevantCategories} selectedId={categoryId} onSelect={setCategoryId} />

          <div>
            <label
              htmlFor="edit-when"
              className="text-ink-muted mb-2 block text-sm font-medium"
            >
              Date
            </label>
            <input
              id="edit-when"
              type="date"
              required
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="border-border-subtle bg-surface rounded-card text-ink min-h-11 w-full border px-3 text-sm"
            />
          </div>

          <div>
            <label
              htmlFor="edit-notes"
              className="text-ink-muted mb-2 block text-sm font-medium"
            >
              Note
            </label>
            <input
              id="edit-notes"
              type="text"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="border-border-subtle bg-surface rounded-card text-ink min-h-11 w-full border px-3 text-sm"
            />
          </div>
        </CardBody>
      </Card>

      {error ? (
        <p role="alert" className="feedback-enter text-outflow flex items-start gap-1.5 text-sm">
          <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      <Button loading={pending} size="full" type="submit" disabled={pending}>
        {!pending ? <Check size={18} aria-hidden="true" /> : null}
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
