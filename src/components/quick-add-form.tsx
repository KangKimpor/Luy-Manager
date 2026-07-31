"use client";

import { Check } from "lucide-react";
import { useMemo, useState } from "react";

import {
  AmountDisplay,
  AmountKeypad,
  type KeypadKey,
  parseKeypadAmount,
  pressAmountKey,
  truncateForCurrency,
} from "@/components/amount-keypad";
import { CurrencyBadge } from "@/components/money-amount";
import { Button } from "@/components/ui/button";
import { buildTransaction } from "@/lib/domain/transactions";
import type { AccountBalance, Category, TransactionType } from "@/lib/domain/types";
import { CURRENCIES, type CurrencyCode } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Fast transaction entry.
 *
 * PRD Section 1 sets a five-second budget for adding a transaction, which rules
 * out a conventional form. The design that follows from that:
 *
 *   - A custom keypad rather than a text input. It removes the OS keyboard's
 *     open/close animation, guarantees the same layout on every device, and
 *     cannot produce a non-numeric value that needs validating.
 *   - Currency toggled with one tap, defaulting to the selected account's own
 *     currency, because that is what the user is about to spend.
 *   - Category and account are optional. Forcing a category on entry is what
 *     makes people stop logging cash purchases; an uncategorised row is far more
 *     useful than a missing one.
 *
 * Submission is stubbed until Supabase is wired: it builds the exact row that
 * will be inserted and surfaces it, so the shape is verifiable now.
 */

interface QuickAddFormProps {
  accounts: readonly AccountBalance[];
  categories: readonly Category[];
  /**
   * Owned by the parent, which also offers Transfer as a third mode. Keeping the
   * choice in one segmented control avoids two nested toggles competing to say
   * what kind of entry this is.
   */
  type: TransactionType;
}

export function QuickAddForm({ accounts, categories, type }: QuickAddFormProps) {
  const [raw, setRaw] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.accountId ?? "");
  const [currency, setCurrency] = useState<CurrencyCode>(accounts[0]?.currency ?? "USD");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState<string | null>(null);

  const relevantCategories = useMemo(
    () => categories.filter((category) => category.appliesTo.includes(type)),
    [categories, type],
  );

  const amount = useMemo(() => parseKeypadAmount(raw, currency), [raw, currency]);

  const canSave = amount.minor > 0 && accountId !== "";

  function press(key: KeypadKey) {
    setSaved(null);
    setRaw((current) => pressAmountKey(current, key, currency));
  }

  function selectAccount(next: AccountBalance) {
    setAccountId(next.accountId);
    // Follow the account's currency: spending from a KHR wallet means riel.
    setCurrency(next.currency);
    setRaw((current) => truncateForCurrency(current, next.currency));
  }

  function handleSave() {
    if (!canSave) return;

    const row = buildTransaction(
      {
        accountId,
        type,
        amount,
        categoryId,
        notes: note.trim() === "" ? null : note.trim(),
      },
      "USD",
    );

    // Placeholder for the Supabase insert. Building the row here proves the
    // sign convention and conversion fields are correct before persistence lands.
    setSaved(`${row.type} ${row.amount} ${row.currency}`);
    setRaw("");
    setNote("");
    setCategoryId(null);
  }

  return (
    <div className="space-y-3">
      <AmountDisplay
        amount={amount}
        tone={type === "expense" ? "outflow" : "inflow"}
        trailing={
          <div className="flex gap-1" role="group" aria-label="Currency">
            {CURRENCIES.map((code) => {
              const target = accounts.find((account) => account.currency === code);
              return (
                <button
                  key={code}
                  type="button"
                  aria-pressed={currency === code}
                  // Switching currency switches account. An account is
                  // single-currency, so setting the currency alone would build
                  // a row the database rejects. Disabled when no account holds
                  // this currency, rather than allowing an unsavable state.
                  disabled={!target}
                  onClick={() => target && selectAccount(target)}
                  className={cn(
                    "rounded-pill min-h-9 px-3 text-xs font-bold transition-colors",
                    currency === code
                      ? "bg-brand text-white"
                      : "bg-surface-muted text-ink-muted",
                    !target && "opacity-30",
                  )}
                >
                  {code}
                </button>
              );
            })}
          </div>
        }
      />

      <AmountKeypad currency={currency} onPress={press} />

      {/* Account. */}
      <fieldset>
        <legend className="text-ink-muted mb-2 text-xs font-semibold tracking-wide uppercase">
          Account
        </legend>
        <div className="flex flex-wrap gap-2">
          {accounts.map((account) => (
            <button
              key={account.accountId}
              type="button"
              aria-pressed={accountId === account.accountId}
              onClick={() => selectAccount(account)}
              className={cn(
                "rounded-pill flex min-h-9 items-center gap-1.5 border px-3 text-xs font-medium transition-colors",
                accountId === account.accountId
                  ? "border-brand bg-brand-soft text-brand"
                  : "border-border-subtle bg-surface text-ink-muted",
              )}
            >
              {account.name}
              <CurrencyBadge currency={account.currency} />
            </button>
          ))}
        </div>
      </fieldset>

      {/* Category. */}
      <fieldset>
        <legend className="text-ink-muted mb-2 text-xs font-semibold tracking-wide uppercase">
          Category <span className="normal-case">(optional)</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {relevantCategories.map((category) => (
            <button
              key={category.id}
              type="button"
              aria-pressed={categoryId === category.id}
              onClick={() => setCategoryId(categoryId === category.id ? null : category.id)}
              className={cn(
                "rounded-pill min-h-9 border px-3 text-xs font-medium transition-colors",
                categoryId === category.id
                  ? "border-brand bg-brand-soft text-brand"
                  : "border-border-subtle bg-surface text-ink-muted",
              )}
            >
              {category.name}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Note. */}
      <div>
        <label htmlFor="note" className="text-ink-muted mb-2 block text-xs font-semibold tracking-wide uppercase">
          Note <span className="normal-case">(optional)</span>
        </label>
        <input
          id="note"
          type="text"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Coffee at Brown"
          className="border-border-subtle bg-surface rounded-card text-ink placeholder:text-ink-faint min-h-11 w-full border px-3 text-sm"
        />
      </div>

      <Button size="full" disabled={!canSave} onClick={handleSave}>
        <Check size={18} aria-hidden="true" />
        Save {type === "expense" ? "expense" : "income"}
      </Button>

      {saved ? (
        <p role="status" className="text-inflow text-center text-sm font-medium">
          Built row: {saved} — persistence lands with the Supabase wiring.
        </p>
      ) : null}
    </div>
  );
}
