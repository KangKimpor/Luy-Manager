"use client";

import { Check, Layers, SlidersHorizontal, TriangleAlert, Wallet } from "@/components/app-icon";
import { useEffect, useMemo, useState } from "react";

import {
  AmountDisplay,
  AmountKeypad,
  type KeypadKey,
  parseKeypadAmount,
  pressAmountKey,
  truncateForCurrency,
} from "@/components/amount-keypad";
import { HorizontalChoiceRow } from "@/components/entry-choice-picker";
import { MoneyAmount } from "@/components/money-amount";
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
import {
  categoryDefinition,
  categoryGroup,
  categoryIconKey,
  categoryKeywords,
  categoryLabel,
  resolveCategory,
} from "@/lib/domain/categories";
import { amountToRawString, type EntryHabit } from "@/lib/domain/entry-habits";
import { TransactionDateField } from "@/components/transaction-date-field";
import { useEntryDate } from "@/components/use-entry-date";
import { calendarDate, isCalendarDate, transactionDate } from "@/lib/calendar";
import { createTransaction } from "@/app/actions/transactions";
import type { AccountBalance, Category, TransactionType } from "@/lib/domain/types";
import {
  convert,
  CURRENCIES,
  type CurrencyCode,
  DEFAULT_RATE,
  type ExchangeRate,
  formatMoney,
  money,
  type Money,
} from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Fast one-screen transaction entry.
 *
 * Every primary entry control (type, amount + currency + paste, account chips,
 * category chips, note + date + more options, keypad, save) fits inside one
 * phone viewport without scrolling. Searchable pickers open in native <dialog>
 * bottom sheets, and split/mixed-payment editors live behind the More options
 * toggle.
 */

interface QuickAddFormProps {
  accounts: readonly AccountBalance[];
  categories: readonly Category[];
  habits?: readonly EntryHabit[];
  /** Server-resolved habit from `/add?habit=...`, prefilling amount, account, category and note. */
  initialHabit?: EntryHabit | null;
  type: TransactionType;
  /** The rate in force, for showing what a mixed-currency payment comes to. */
  rate?: ExchangeRate;
  /** Demo mode cannot persist, so the form says so instead of failing on submit. */
  readOnly?: boolean;
  timezone?: string;
  initialDate?: string;
  /** Optional controlled note so switching entry type keeps what the user typed. */
  note?: string | null;
  onNoteChange?: (note: string | null) => void;
  onExpandedChange?: (expanded: boolean) => void;
}

export function QuickAddForm({
  accounts,
  categories,
  habits = [],
  initialHabit = null,
  type,
  rate: initialRate = DEFAULT_RATE,
  readOnly = false,
  timezone = "Asia/Phnom_Penh",
  initialDate = calendarDate(new Date(), timezone),
  note: controlledNote,
  onNoteChange,
  onExpandedChange,
}: QuickAddFormProps) {
  const { date, selectDate, rate, ratePending, dateError } = useEntryDate(initialDate, initialRate, readOnly);
  const prefilledAccount = initialHabit
    ? accounts.find((account) => account.currency === initialHabit.amount.currency)
    : undefined;
  const matchedHabit = initialHabit && initialHabit.type === type && prefilledAccount ? initialHabit : null;

  const [prevType, setPrevType] = useState<TransactionType>(type);
  const [raw, setRaw] = useState(() => (matchedHabit ? amountToRawString(matchedHabit.amount) : ""));
  const [accountId, setAccountId] = useState(
    () => prefilledAccount?.accountId ?? accounts[0]?.accountId ?? "",
  );
  const [currency, setCurrency] = useState<CurrencyCode>(
    () => matchedHabit?.amount.currency ?? accounts[0]?.currency ?? "USD",
  );
  const [categoryId, setCategoryId] = useState<string | null | undefined>(
    () => matchedHabit?.categoryId ?? undefined,
  );
  const [internalNote, setInternalNote] = useState<string | null>(() => matchedHabit?.note ?? null);
  const [saved, setSaved] = useState<Money | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [moreOpen, setMoreOpen] = useState(false);
  const [tenders, setTenders] = useState<TenderDraft[] | null>(null);
  const [splits, setSplits] = useState<SplitDraft[] | null>(null);

  if (prevType !== type) {
    setPrevType(type);
    setSaved(null);
    setError(null);
    setCategoryId(undefined);
    setTenders(null);
    setSplits(null);
    setMoreOpen(false);
  }

  const note = controlledNote !== undefined ? controlledNote : internalNote;
  function updateNote(next: string | null) {
    if (controlledNote === undefined) setInternalNote(next);
    onNoteChange?.(next);
  }

  const relevantCategories = useMemo(
    () => categories.filter((category) => category.appliesTo.includes(type)),
    [categories, type],
  );

  // Habit-suggested categories appear first, followed by remaining categories of the active type.
  const orderedCategories = useMemo(() => {
    const habitRanks = new Map<string, number>();
    let rank = 0;
    for (const h of habits) {
      if (h.type === type && h.categoryId && !habitRanks.has(h.categoryId)) {
        habitRanks.set(h.categoryId, rank);
        rank += 1;
      }
    }
    return [...relevantCategories].sort((a, b) => {
      const ha = habitRanks.get(a.id);
      const hb = habitRanks.get(b.id);
      if (ha !== undefined || hb !== undefined) {
        return (ha ?? Number.MAX_SAFE_INTEGER) - (hb ?? Number.MAX_SAFE_INTEGER);
      }
      const pa = categoryDefinition(a)?.[4] ?? 1000 + a.sortOrder;
      const pb = categoryDefinition(b)?.[4] ?? 1000 + b.sortOrder;
      return pa - pb || a.name.localeCompare(b.name);
    });
  }, [habits, relevantCategories, type]);

  const keypadAmount = useMemo(() => parseKeypadAmount(raw, currency), [raw, currency]);
  const mixedAmount = tenders ? tenderTotal(tenders, currency, rate) : null;
  const amount = mixedAmount ?? keypadAmount;
  const otherCurrency: CurrencyCode = currency === "USD" ? "KHR" : "USD";
  const converted = useMemo(
    () => (amount.minor > 0 ? convert(amount, otherCurrency, rate) : null),
    [amount, otherCurrency, rate],
  );

  const habit = !tenders && !splits ? habits.find((h) => h.type === type && h.amount.currency === currency && h.amount.minor === amount.minor) : undefined;
  const resolvedNote = note ?? habit?.note ?? "";
  const suggestedCategoryId = note === null && habit ? habit.categoryId : resolveCategory(relevantCategories, resolvedNote)?.id;
  const resolvedCategoryId = categoryId === undefined
    ? relevantCategories.find((category) => category.id === suggestedCategoryId)?.id ?? null
    : relevantCategories.some((category) => category.id === categoryId) ? categoryId : null;

  const hasAdvancedState = tenders !== null || splits !== null || Boolean(dateError);
  const isExpanded = moreOpen || hasAdvancedState;

  useEffect(() => {
    onExpandedChange?.(isExpanded);
  }, [isExpanded, onExpandedChange]);

  const currencyAccounts = useMemo(
    () => accounts.filter((account) => account.currency === currency),
    [accounts, currency],
  );

  const accountChoiceOf = (account: AccountBalance) => ({
    id: account.accountId,
    label: account.name,
    detail: account.currency,
    balance: money(account.currentBalance, account.currency),
    group: account.currency,
    keywords: `${account.institution ?? ""} ${account.type.replaceAll("_", " ")}`,
  });

  const allAccountChoices = useMemo(
    () => accounts.map(accountChoiceOf),
    [accounts],
  );
  const currencyAccountChoices = useMemo(
    () => currencyAccounts.map(accountChoiceOf),
    [currencyAccounts],
  );
  const categoryChoices = useMemo(
    () =>
      orderedCategories.map((category) => ({
        id: category.id,
        label: categoryLabel(category),
        group: categoryGroup(category),
        icon: categoryIconKey(category),
        keywords: categoryKeywords(category),
      })),
    [orderedCategories],
  );

  const canSave = !readOnly && amount.minor > 0 && accountId !== "" && isCalendarDate(date) && !ratePending && !dateError;

  function press(key: KeypadKey) {
    setSaved(null);
    setError(null);
    setRaw((current) => pressAmountKey(current, key, currency));
  }

  function selectAccount(next: AccountBalance) {
    setSaved(null);
    setError(null);
    setAccountId(next.accountId);
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
        type: type as "expense" | "income" | "refund",
        amount: raw.trim() === "" ? "0" : raw.trim(),
        currency,
        categoryId: resolvedCategoryId,
        occurredAt: transactionDate(date, timezone).toISOString(),
        notes: resolvedNote.trim() === "" ? null : resolvedNote.trim(),
        tenders: tenders ? parseTenders(tenders) : undefined,
        splits: splits ? parseSplits(splits) : undefined,
      });

      if (!result.ok) {
        setError(result.error);
        if (/split|tender|currenc/i.test(result.error) && (splits || tenders)) {
          setMoreOpen(true);
        }
        return;
      }

      setSaved(amount);
      setRaw("");
      updateNote(null);
      void selectDate(calendarDate(new Date(), timezone));
      setCategoryId(undefined);
      setTenders(null);
      setSplits(null);
      setMoreOpen(false);
    } catch {
      setError("Could not confirm the save. Check Activity before trying again.");
    } finally {
      setPending(false);
    }
  }

  const saveLabel = pending
    ? "Saving..."
    : amount.minor === 0
      ? "Enter an amount"
      : `Save ${type === "expense" ? "expense" : type}, ${formatMoney(amount)}`;

  const statusNode = saved ? (
    <span role="status" aria-label="Save confirmation" className="text-inflow font-medium">
      Saved <MoneyAmount amount={saved} />
    </span>
  ) : ratePending ? (
    <span role="status">Updating the rate for this date...</span>
  ) : readOnly ? (
    <span className="text-ink-faint">Sample data, read-only.</span>
  ) : null;

  return (
    <div className="add-form-col" aria-busy={pending}>
      <fieldset disabled={pending} className="add-form-fieldset disabled:opacity-70">
        <AmountDisplay
          amount={amount}
          onAmountChange={tenders || pending ? undefined : (next) => { setRaw(next); setSaved(null); setError(null); }}
          tone={type === "expense" ? "outflow" : "inflow"}
          errorText={dateError ?? error}
          hint={converted ? <>~ <MoneyAmount amount={converted} /> at {rate.rate.toLocaleString("en-US", { maximumFractionDigits: 0 })}&#x17DB;</> : null}
          statusNode={statusNode}
          trailing={
            <div className="segmented-control add-ccy-switch" role="group" aria-label="Currency">
              {CURRENCIES.map((code) => {
                const target = accounts.find((account) => account.currency === code);
                return (
                  <button
                    key={code}
                    type="button"
                    aria-pressed={currency === code}
                    disabled={!target}
                    onClick={() => target && selectAccount(target)}
                    className={cn(
                      "relative z-10 min-h-7 px-2.5 text-xs whitespace-nowrap transition-colors",
                      currency === code
                        ? "text-ink font-semibold"
                        : "text-ink-muted font-medium",
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

        <HorizontalChoiceRow
          label="Account"
          collection="accounts"
          leadingCaption={type === "income" ? "Into" : "From"}
          rowOptions={currencyAccountChoices}
          dialogOptions={allAccountChoices}
          selectedId={accountId}
          onSelect={(id) => {
            const picked = accounts.find((item) => item.accountId === id);
            if (picked) selectAccount(picked);
          }}
          triggerText="All"
          triggerLabel="All accounts"
          searchLabel="Search accounts"
        />

        {!splits ? (
          <HorizontalChoiceRow
            label="Category"
            collection="categories"
            rowOptions={categoryChoices}
            selectedId={resolvedCategoryId}
            allowClear
            clearLabel="Clear category"
            onSelect={(id) => {
              setSaved(null);
              setCategoryId(id);
            }}
            triggerText="Search"
            triggerLabel="Search categories"
            searchLabel="Search categories"
          />
        ) : null}

        {!splits && categoryId === undefined && resolvedCategoryId ? (
          <p role="status" className="sr-only">
            {note === null && habit
              ? "Suggested from your usual entries. You can change the note or category."
              : "Suggested from your note. Choose another category or clear it."}
          </p>
        ) : null}

        <div className="flex shrink-0 items-center gap-2">
          <input
            id="note"
            type="text"
            aria-label="Note"
            maxLength={500}
            value={resolvedNote}
            onChange={(event) => {
              setSaved(null);
              updateNote(event.target.value);
            }}
            placeholder="Note (optional)"
            className="field-input h-11 min-w-0 flex-1 text-sm"
          />
          <TransactionDateField
            compact
            value={date}
            today={initialDate}
            onChange={(next) => {
              setSaved(null);
              void selectDate(next);
            }}
          />
          <button
            type="button"
            aria-label="More options"
            aria-expanded={isExpanded}
            onClick={() => setMoreOpen((open) => !open)}
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-full transition-colors",
              isExpanded || tenders !== null || splits !== null
                ? "bg-brand text-on-action"
                : "bg-fill text-ink-muted hover:text-ink",
            )}
          >
            <SlidersHorizontal size={18} aria-hidden="true" />
          </button>
        </div>

        {isExpanded ? (
          <div className="panel-enter space-y-3">
            <div className="rounded-card bg-surface border-card-edge space-y-3 border-[0.5px] p-4">
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
                        : [
                            { ...newTender(currency), amount: raw.trim() },
                            newTender(currency === "USD" ? "KHR" : "USD"),
                          ],
                    );
                  }}
                  className={cn(
                    "rounded-pill flex min-h-11 flex-1 items-center justify-center gap-1.5 px-4 text-xs font-medium transition-colors",
                    tenders !== null
                      ? "bg-brand text-on-action"
                      : "bg-fill text-ink-muted",
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
                    "rounded-pill flex min-h-11 flex-1 items-center justify-center gap-1.5 px-4 text-xs font-medium transition-colors",
                    splits !== null
                      ? "bg-brand text-on-action"
                      : "bg-fill text-ink-muted",
                  )}
                >
                  <Layers size={14} aria-hidden="true" />
                  Split it
                </button>
              </div>
            </div>

            {tenders ? (
              <TenderEditor
                tenders={tenders}
                targetCurrency={currency}
                rate={rate}
                onChange={(next) => {
                  setSaved(null);
                  setError(null);
                  setTenders(next.length === 0 ? null : next);
                }}
              />
            ) : null}

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

            {error ? (
              <p role="alert" className="feedback-enter bg-outflow-soft text-outflow flex items-start gap-2 rounded-2xl p-4 text-sm">
                <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
                {error}
              </p>
            ) : null}

            {readOnly ? (
              <p className="text-ink-faint text-center text-xs">
                Sample data. Saving is available when your account is connected.
              </p>
            ) : null}
          </div>
        ) : null}

        {!tenders ? <AmountKeypad currency={currency} raw={raw} onPress={press} /> : null}
      </fieldset>

      <Button
        loading={pending}
        size="full"
        disabled={!canSave || pending}
        onClick={handleSave}
        aria-busy={pending}
        className="add-save-btn shrink-0"
      >
        {!pending && amount.minor > 0 ? <Check size={18} aria-hidden="true" /> : null}
        {saveLabel}
      </Button>
    </div>
  );
}
