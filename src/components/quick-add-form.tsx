"use client";

import { Check, ChevronDown, Layers, LoaderCircle, TriangleAlert, Wallet } from "lucide-react";
import { useMemo, useState } from "react";

import {
  AmountDisplay,
  AmountKeypad,
  type KeypadKey,
  parseKeypadAmount,
  pressAmountKey,
  truncateForCurrency,
} from "@/components/amount-keypad";
import { CurrencyBadge, MoneyAmount } from "@/components/money-amount";
import {
  newSplit,
  parseSplits,
  type SplitDraft,
  SplitEditor,
} from "@/components/split-editor";
import {
  newTender,
  parseTenders,
  type TenderDraft,
  TenderEditor,
  tenderTotal,
} from "@/components/tender-editor";
import { Button } from "@/components/ui/button";
import { createTransaction } from "@/app/actions/transactions";
import type { AccountBalance, Category, TransactionType } from "@/lib/domain/types";
import {
  CURRENCIES,
  type CurrencyCode,
  DEFAULT_RATE,
  type ExchangeRate,
  type Money,
} from "@/lib/money";
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
 * Two optional modes sit behind toggles, off by default so they cost nothing when
 * not wanted: paying in two currencies at once, and splitting one receipt across
 * categories. Both exist in the schema and the money layer already.
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
  /** The rate in force, for showing what a mixed-currency payment comes to. */
  rate?: ExchangeRate;
  /** Demo mode cannot persist, so the form says so instead of failing on submit. */
  readOnly?: boolean;
}

export function QuickAddForm({
  accounts,
  categories,
  type,
  rate = DEFAULT_RATE,
  readOnly = false,
}: QuickAddFormProps) {
  const [raw, setRaw] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.accountId ?? "");
  const [currency, setCurrency] = useState<CurrencyCode>(accounts[0]?.currency ?? "USD");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState<Money | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [tenders, setTenders] = useState<TenderDraft[] | null>(null);
  const [splits, setSplits] = useState<SplitDraft[] | null>(null);

  const relevantCategories = useMemo(
    () => categories.filter((category) => category.appliesTo.includes(type)),
    [categories, type],
  );

  const keypadAmount = useMemo(() => parseKeypadAmount(raw, currency), [raw, currency]);

  // With tenders open the total is derived from them, so the keypad steps aside
  // rather than offering a second figure that could disagree.
  const mixedAmount = tenders ? tenderTotal(tenders, currency, rate) : null;
  const amount = mixedAmount ?? keypadAmount;

  const canSave = !readOnly && amount.minor > 0 && accountId !== "";

  function press(key: KeypadKey) {
    setSaved(null);
    setError(null);
    setRaw((current) => pressAmountKey(current, key, currency));
  }

  function selectAccount(next: AccountBalance) {
    setSaved(null);
    setError(null);
    setAccountId(next.accountId);
    // Follow the account's currency: spending from a KHR wallet means riel.
    setCurrency(next.currency);
    setRaw((current) => truncateForCurrency(current, next.currency));
  }

  async function handleSave() {
    if (!canSave || pending) return;

    setPending(true);
    setError(null);

    try {
      const result = await createTransaction({
        accountId,
        // The parent control only offers these three; a transfer has its own form.
        type: type as "expense" | "income" | "refund",
        // Exactly what was typed, parsed server-side by the same money layer rather
        // than round-tripped through a number here. Ignored when tenders are present,
        // because the total is derived from them.
        amount: raw.trim() === "" ? "0" : raw.trim(),
        currency,
        categoryId,
        notes: note.trim() === "" ? null : note.trim(),
        tenders: tenders ? parseTenders(tenders) : undefined,
        splits: splits ? parseSplits(splits) : undefined,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setSaved(amount);
      setRaw("");
      setNote("");
      setCategoryId(null);
      setTenders(null);
      setSplits(null);
    } catch {
      setError("Could not confirm the save. Check Activity before trying again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-5" aria-busy={pending}>
      <fieldset disabled={pending} className="space-y-5 disabled:opacity-70">
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
                    "rounded-pill min-h-11 px-3 text-xs font-bold transition-colors",
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

      {/* The keypad is hidden while tenders are open: with two currencies being
          entered, a third figure on the keypad would be a total that can disagree
          with them. */}
      {tenders ? (
        <TenderEditor
          tenders={tenders}
          targetCurrency={currency}
          rate={rate}
          onChange={(next) => {
            setSaved(null);
            setError(null);
            // Closing the last row returns to plain keypad entry.
            setTenders(next.length === 0 ? null : next);
          }}
        />
      ) : (
        <AmountKeypad currency={currency} onPress={press} />
      )}

      {/* Account. */}
      <fieldset>
        <legend className="text-ink-muted mb-2 text-sm font-medium">
          Account
        </legend>
        <div className="scroll-row flex gap-2 pb-2">
          {accounts.map((account) => (
            <button
              key={account.accountId}
              type="button"
              aria-pressed={accountId === account.accountId}
              onClick={() => selectAccount(account)}
              className={cn(
                "rounded-xl flex min-h-11 shrink-0 items-center gap-1.5 border px-3 text-sm font-medium transition-colors",
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

      {/* Category. Hidden while splitting, since each split carries its own. */}
      <fieldset className={cn(splits && "hidden")}>
        <legend className="text-ink-muted mb-2 text-sm font-medium">
          Category <span className="normal-case">(optional)</span>
        </legend>
        <div className="scroll-row flex gap-2 pb-2">
          {relevantCategories.map((category) => (
            <button
              key={category.id}
              type="button"
              aria-pressed={categoryId === category.id}
              onClick={() => { setSaved(null); setCategoryId(categoryId === category.id ? null : category.id); }}
              className={cn(
                "rounded-xl min-h-11 shrink-0 border px-3 text-sm font-medium transition-colors",
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

      <details className="border-surface-variant rounded-2xl border bg-surface p-4">
      <summary className="text-ink-muted flex min-h-11 items-center justify-between text-sm font-medium">More options<ChevronDown size={17} aria-hidden="true" /></summary>
      <div className="mt-4 space-y-4">
      <div>
        <label htmlFor="note" className="text-ink-muted mb-2 block text-sm font-medium">Note</label>
        <input id="note" type="text" value={note} onChange={(event) => { setSaved(null); setNote(event.target.value); }} placeholder="What was it for?" className="border-border-subtle bg-surface rounded-xl text-ink placeholder:text-ink-faint min-h-11 w-full border px-3" />
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={tenders !== null}
          onClick={() => {
            setSaved(null);
            setError(null);
            setTenders(
              tenders
                ? null
                : // Seed with the account's currency plus the other one, since a
                  // mixed payment is by definition two currencies.
                  [
                    { ...newTender(currency), amount: raw.trim() },
                    newTender(currency === "USD" ? "KHR" : "USD"),
                  ],
            );
          }}
          className={cn(
            "rounded-pill flex min-h-11 flex-1 items-center justify-center gap-1.5 border text-xs font-medium transition-colors",
            tenders !== null
              ? "border-brand bg-brand-soft text-brand"
              : "border-border-subtle bg-surface text-ink-muted",
          )}
        >
          <Wallet size={14} aria-hidden="true" />
          Two currencies
        </button>

        <button
          type="button"
          aria-pressed={splits !== null}
          onClick={() => {
            setSaved(null);
            setError(null);
            setSplits(splits ? null : [newSplit(), newSplit()]);
          }}
          className={cn(
            "rounded-pill flex min-h-11 flex-1 items-center justify-center gap-1.5 border text-xs font-medium transition-colors",
            splits !== null
              ? "border-brand bg-brand-soft text-brand"
              : "border-border-subtle bg-surface text-ink-muted",
          )}
        >
          <Layers size={14} aria-hidden="true" />
          Split it
        </button>
      </div>

      </div>
      </details>

      {splits ? (
        <SplitEditor
          splits={splits}
          parentAmount={amount}
          categories={relevantCategories}
          onChange={(next) => {
            setSaved(null);
            setError(null);
            setSplits(next.length === 0 ? null : next);
          }}
        />
      ) : null}

      </fieldset>

      {error ? (
        <p role="alert" className="feedback-enter bg-outflow-soft text-outflow flex items-start gap-2 rounded-2xl p-4 text-sm">
          <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      <Button size="full" disabled={!canSave || pending} onClick={handleSave} aria-busy={pending}>
        {pending ? <LoaderCircle size={18} className="animate-spin" aria-hidden="true" /> : <Check size={18} aria-hidden="true" />}
        {pending ? "Saving..." : `Save ${type === "expense" ? "expense" : type}`}
      </Button>

      {readOnly ? (
        <p className="text-ink-faint text-center text-xs">
          Sample data. Saving is available when your account is connected.
        </p>
      ) : null}

      {saved ? (
        <p role="status" aria-label="Save confirmation" className="feedback-enter bg-inflow-soft text-inflow flex items-center justify-center gap-2 rounded-2xl p-4 text-sm font-medium">
          <Check size={18} aria-hidden="true" />Saved <MoneyAmount amount={saved} />
        </p>
      ) : null}
    </div>
  );
}
