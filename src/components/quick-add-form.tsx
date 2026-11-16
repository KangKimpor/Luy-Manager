"use client";

import { Check } from "@/components/app-icon";
import { useMemo, useState } from "react";

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
 * Every primary entry control (type, amount + currency, account chips,
 * frequent category chips, note + date, keypad, save) fits inside one
 * phone viewport without scrolling. Searchable pickers open in native
 * <dialog> bottom sheets.
 */

/** How many category chips stay visible before the All categories button. */
const FAVORITE_CATEGORY_LIMIT = 6;
const NO_CATEGORY_USAGE: Readonly<Record<string, number>> = {};

function categoryChoiceOf(category: Category) {
  return {
    id: category.id,
    label: categoryLabel(category),
    group: categoryGroup(category),
    icon: categoryIconKey(category),
    keywords: categoryKeywords(category),
  };
}

interface QuickAddFormProps {
  accounts: readonly AccountBalance[];
  categories: readonly Category[];
  habits?: readonly EntryHabit[];
  /** How often each category has been picked, so the visible row stays the frequent ones. */
  categoryUsage?: Readonly<Record<string, number>>;
  /** Server-resolved habit from `/add?habit=...`, prefilling amount, account, category and note. */
  initialHabit?: EntryHabit | null;
  type: TransactionType;
  /** The rate in force, for showing what the amount comes to in the other currency. */
  rate?: ExchangeRate;
  /** Demo mode cannot persist, so the form says so instead of failing on submit. */
  readOnly?: boolean;
  timezone?: string;
  initialDate?: string;
  /** Optional controlled note so switching entry type keeps what the user typed. */
  note?: string | null;
  onNoteChange?: (note: string | null) => void;
}

export function QuickAddForm({
  accounts,
  categories,
  habits = [],
  categoryUsage = NO_CATEGORY_USAGE,
  initialHabit = null,
  type,
  rate: initialRate = DEFAULT_RATE,
  readOnly = false,
  timezone = "Asia/Phnom_Penh",
  initialDate = calendarDate(new Date(), timezone),
  note: controlledNote,
  onNoteChange,
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

  if (prevType !== type) {
    setPrevType(type);
    setSaved(null);
    setError(null);
    setCategoryId(undefined);
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
  const amount = keypadAmount;
  const otherCurrency: CurrencyCode = currency === "USD" ? "KHR" : "USD";
  const converted = useMemo(
    () => (amount.minor > 0 ? convert(amount, otherCurrency, rate) : null),
    [amount, otherCurrency, rate],
  );

  const habit = habits.find((h) => h.type === type && h.amount.currency === currency && h.amount.minor === amount.minor);
  const resolvedNote = note ?? habit?.note ?? "";
  const suggestedCategoryId = note === null && habit ? habit.categoryId : resolveCategory(relevantCategories, resolvedNote)?.id;
  const resolvedCategoryId = categoryId === undefined
    ? relevantCategories.find((category) => category.id === suggestedCategoryId)?.id ?? null
    : relevantCategories.some((category) => category.id === categoryId) ? categoryId : null;

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
    () => orderedCategories.map(categoryChoiceOf),
    [orderedCategories],
  );

  /**
   * The visible chips are the categories this user actually picks, capped so
   * the row stays one swipe. Usage leads, then the curated quick order, and a
   * category picked from the full list stays visible so it can be cleared.
   */
  const favoriteCategoryChoices = useMemo(() => {
    const curatedRank = new Map(orderedCategories.map((category, index) => [category.id, index]));
    const ranked = [...relevantCategories].sort((a, b) =>
      (categoryUsage[b.id] ?? 0) - (categoryUsage[a.id] ?? 0)
      || (curatedRank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (curatedRank.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    );
    const favorites = ranked.slice(0, FAVORITE_CATEGORY_LIMIT);
    const selected = relevantCategories.find((category) => category.id === resolvedCategoryId);
    if (selected && !favorites.some((category) => category.id === selected.id)) {
      favorites.unshift(selected);
    }
    return favorites.map(categoryChoiceOf);
  }, [categoryUsage, orderedCategories, relevantCategories, resolvedCategoryId]);

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
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setSaved(amount);
      setRaw("");
      updateNote(null);
      void selectDate(calendarDate(new Date(), timezone));
      setCategoryId(undefined);
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
          onAmountChange={pending ? undefined : (next) => { setRaw(next); setSaved(null); setError(null); }}
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

        <HorizontalChoiceRow
          label="Category"
          collection="categories"
          rowOptions={favoriteCategoryChoices}
          dialogOptions={categoryChoices}
          selectedId={resolvedCategoryId}
          allowClear
          clearLabel="Clear category"
          onSelect={(id) => {
            setSaved(null);
            setCategoryId(id);
          }}
          triggerText="All"
          triggerLabel="All categories"
          searchLabel="Search categories"
        />

        {categoryId === undefined && resolvedCategoryId ? (
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
        </div>

        <AmountKeypad currency={currency} raw={raw} onPress={press} />
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
