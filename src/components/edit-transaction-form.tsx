"use client";

import { Check, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { CurrencyBadge } from "@/components/money-amount";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { updateTransaction } from "@/app/actions/transactions";
import type { AccountBalance, Category, Transaction, TransactionType } from "@/lib/domain/types";
import { CURRENCY_META, type CurrencyCode } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Amending a transaction.
 *
 * A plain form rather than the keypad: editing is a considered correction, not the
 * five-second capture the keypad exists for, and the fields being visible at once
 * is what makes it obvious what will change.
 *
 * The account may be changed, but only to one holding the same currency. An account
 * is single-currency and the amount is denominated in it, so moving a transaction
 * between currencies would silently reinterpret the figure — 12,000 riel becoming
 * $120.
 */

const EDITABLE_TYPES: TransactionType[] = ["expense", "income", "refund", "adjustment"];

/** Stored minor units as an editable major-unit string. */
function toInput(minor: number, currency: CurrencyCode): string {
  const { decimals } = CURRENCY_META[currency];
  return (Math.abs(minor) / 10 ** decimals).toFixed(decimals);
}

/** A datetime-local value from an ISO timestamp, in local time. */
function toLocalDateTime(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export function EditTransactionForm({
  transaction,
  accounts,
  categories,
}: {
  transaction: Transaction;
  accounts: readonly AccountBalance[];
  categories: readonly Category[];
}) {
  const router = useRouter();

  const [type, setType] = useState<TransactionType>(transaction.type);
  const [accountId, setAccountId] = useState(transaction.accountId);
  const [amount, setAmount] = useState(
    toInput(transaction.amount, transaction.currency),
  );
  const [categoryId, setCategoryId] = useState<string | null>(transaction.categoryId);
  const [notes, setNotes] = useState(transaction.notes ?? "");
  const [occurredAt, setOccurredAt] = useState(toLocalDateTime(transaction.occurredAt));
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
    setPending(true);
    setError(null);

    const result = await updateTransaction({
      id: transaction.id,
      accountId,
      type: type as "expense" | "income" | "refund" | "adjustment",
      amount: amount.trim(),
      currency: transaction.currency,
      categoryId,
      notes: notes.trim() === "" ? null : notes.trim(),
      // datetime-local has no zone, so it is read as local time and converted here.
      occurredAt: new Date(occurredAt).toISOString(),
    });

    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    router.push("/transactions");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Card>
        <CardBody className="space-y-3 pt-4">
          <fieldset>
            <legend className="text-ink-muted mb-2 text-xs font-semibold tracking-wide uppercase">
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
              className="text-ink-muted mb-2 block text-xs font-semibold tracking-wide uppercase"
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

          <div>
            <label
              htmlFor="edit-account"
              className="text-ink-muted mb-2 block text-xs font-semibold tracking-wide uppercase"
            >
              Account
            </label>
            <select
              id="edit-account"
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              className="border-border-subtle bg-surface rounded-card text-ink min-h-11 w-full border px-3 text-sm"
            >
              {sameCurrency.map((account) => (
                <option key={account.accountId} value={account.accountId}>
                  {account.name}
                </option>
              ))}
            </select>
            <p className="text-ink-faint mt-1.5 text-xs">
              Only {transaction.currency} accounts, since the amount is recorded in{" "}
              {transaction.currency}.
            </p>
          </div>

          <div>
            <label
              htmlFor="edit-category"
              className="text-ink-muted mb-2 block text-xs font-semibold tracking-wide uppercase"
            >
              Category
            </label>
            <select
              id="edit-category"
              value={categoryId ?? ""}
              onChange={(event) => setCategoryId(event.target.value || null)}
              className="border-border-subtle bg-surface rounded-card text-ink min-h-11 w-full border px-3 text-sm"
            >
              <option value="">Uncategorised</option>
              {relevantCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="edit-when"
              className="text-ink-muted mb-2 block text-xs font-semibold tracking-wide uppercase"
            >
              When
            </label>
            <input
              id="edit-when"
              type="datetime-local"
              value={occurredAt}
              onChange={(event) => setOccurredAt(event.target.value)}
              className="border-border-subtle bg-surface rounded-card text-ink min-h-11 w-full border px-3 text-sm"
            />
          </div>

          <div>
            <label
              htmlFor="edit-notes"
              className="text-ink-muted mb-2 block text-xs font-semibold tracking-wide uppercase"
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
        <p role="alert" className="text-outflow flex items-start gap-1.5 text-sm">
          <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      <Button size="full" type="submit" disabled={pending}>
        <Check size={18} aria-hidden="true" />
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
