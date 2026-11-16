"use client";

import { ArrowRight, ArrowRightLeft, Check, SlidersHorizontal, TriangleAlert } from "@/components/app-icon";
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
import { TransactionDateField } from "@/components/transaction-date-field";
import { useEntryDate } from "@/components/use-entry-date";
import { calendarDate, isCalendarDate, transactionDate } from "@/lib/calendar";
import { CurrencyBadge, MoneyAmount } from "@/components/money-amount";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import {
  describeTransfer,
  planTransfer,
  transferIssues,
  type TransferPlan,
} from "@/lib/domain/transfers";
import { createTransfer } from "@/app/actions/transactions";
import type { AccountBalance } from "@/lib/domain/types";
import {
  type CurrencyCode,
  DEFAULT_RATE,
  type ExchangeRate,
  formatMoney,
  money,
  parseAmount,
} from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Moving money between accounts, including across currencies.
 *
 * Uses the same 7-item one-screen phone layout as QuickAddForm: From and To
 * horizontal chip rows replace Account and Category, while Swap, received-amount
 * override, resulting balances and warnings sit inside More options.
 */

interface TransferFormProps {
  accounts: readonly AccountBalance[];
  /** The rate in force, from the daily sync. Falls back to the cold-start rate. */
  rate?: ExchangeRate;
  /** Demo mode cannot persist, so the form says so rather than failing on submit. */
  readOnly?: boolean;
  timezone?: string;
  initialDate?: string;
  note?: string;
  onNoteChange?: (note: string) => void;
  onExpandedChange?: (expanded: boolean) => void;
}

export function TransferForm({
  accounts,
  rate: initialRate = DEFAULT_RATE,
  readOnly = false,
  timezone = "Asia/Phnom_Penh",
  initialDate = calendarDate(new Date(), timezone),
  note: controlledNote,
  onNoteChange,
  onExpandedChange,
}: TransferFormProps) {
  const { date, selectDate, rate, ratePending, dateError } = useEntryDate(initialDate, initialRate, readOnly);
  const [fromId, setFromId] = useState(accounts[0]?.accountId ?? "");
  const [toId, setToId] = useState(
    accounts.find((a) => a.currency !== accounts[0]?.currency)?.accountId ??
      accounts[1]?.accountId ??
      "",
  );
  const [raw, setRaw] = useState("");
  const [receivedRaw, setReceivedRaw] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  const note = controlledNote !== undefined ? controlledNote : internalNote;
  function updateNote(next: string) {
    if (controlledNote === undefined) setInternalNote(next);
    onNoteChange?.(next);
  }

  const from = accounts.find((a) => a.accountId === fromId);
  const to = accounts.find((a) => a.accountId === toId);

  const sentCurrency: CurrencyCode = from?.currency ?? "USD";
  const amount = useMemo(
    () => parseKeypadAmount(raw, sentCurrency),
    [raw, sentCurrency],
  );

  const { plan, error } = useMemo((): {
    plan: TransferPlan | null;
    error: string | null;
  } => {
    if (!from || !to || amount.minor === 0) return { plan: null, error: null };

    let received;
    if (receivedRaw.trim() !== "" && from.currency !== to.currency) {
      try {
        received = parseAmount(receivedRaw, to.currency);
      } catch {
        return { plan: null, error: "That received amount is not a number." };
      }
    }

    try {
      return {
        plan: planTransfer(
          {
            from,
            to,
            amount,
            receivedAmount: received,
            notes: note.trim() === "" ? null : note.trim(),
          },
          rate,
        ),
        error: null,
      };
    } catch (cause) {
      return { plan: null, error: cause instanceof Error ? cause.message : String(cause) };
    }
  }, [from, to, amount, receivedRaw, note, rate]);

  const issues = useMemo(() => (plan ? transferIssues(plan) : []), [plan]);
  const canSave = plan !== null && error === null && !readOnly && isCalendarDate(date) && !ratePending && !dateError;

  const isExpanded = moreOpen || receivedRaw.trim() !== "" || Boolean(dateError) || Boolean(error);
  useEffect(() => {
    onExpandedChange?.(isExpanded);
  }, [isExpanded, onExpandedChange]);

  const accountChoices = useMemo(
    () =>
      accounts.map((account) => ({
        id: account.accountId,
        label: account.name,
        detail: account.currency,
        balance: money(account.currentBalance, account.currency),
        group: account.currency,
        keywords: `${account.institution ?? ""} ${account.type.replaceAll("_", " ")}`,
      })),
    [accounts],
  );
  const disabledForFrom = useMemo(() => (toId ? new Set([toId]) : undefined), [toId]);
  const disabledForTo = useMemo(() => (fromId ? new Set([fromId]) : undefined), [fromId]);

  function press(key: KeypadKey) {
    setSaved(null);
    setSaveError(null);
    setRaw((current) => pressAmountKey(current, key, sentCurrency));
  }

  function selectFrom(account: AccountBalance) {
    setSaved(null);
    setSaveError(null);
    if (account.accountId === toId) setToId(fromId);
    setFromId(account.accountId);
    setRaw((current) => truncateForCurrency(current, account.currency));
    setReceivedRaw("");
  }

  function selectTo(account: AccountBalance) {
    setSaved(null);
    setSaveError(null);
    if (account.accountId === fromId) setFromId(toId);
    setToId(account.accountId);
    setReceivedRaw("");
  }

  function swap() {
    setSaved(null);
    setSaveError(null);
    setFromId(toId);
    setToId(fromId);
    setRaw("");
    setReceivedRaw("");
  }

  function useSuggestedCashAmount() {
    if (!plan?.cashStepSuggestion) return;
    setReceivedRaw(formatMoney(plan.cashStepSuggestion, { showSymbol: false }));
  }

  async function handleSave() {
    if (!plan || readOnly || pending) return;

    setPending(true);
    setSaveError(null);

    try {
      const result = await createTransfer({
        fromAccountId: plan.from.accountId,
        toAccountId: plan.to.accountId,
        amount: raw.trim(),
        receivedAmount: receivedRaw.trim() === "" ? undefined : receivedRaw.trim(),
        notes: note.trim() === "" ? null : note.trim(),
        occurredAt: transactionDate(date, timezone).toISOString(),
      });

      if (!result.ok) {
        setSaveError(result.error);
        return;
      }

      setSaved(describeTransfer(plan));
      setRaw("");
      setReceivedRaw("");
      updateNote("");
      void selectDate(calendarDate(new Date(), timezone));
      setMoreOpen(false);
    } catch {
      setSaveError("Could not confirm the transfer. Check Activity before trying again.");
    } finally {
      setPending(false);
    }
  }

  if (accounts.length < 2) {
    return (
      <Card>
        <CardBody>
          <p className="text-ink-muted text-sm">
            A transfer needs two accounts. Add another to move money between them.
          </p>
        </CardBody>
      </Card>
    );
  }

  const saveLabel = pending
    ? "Saving..."
    : amount.minor === 0
      ? "Enter an amount"
      : `Move ${formatMoney(amount)}`;

  const receiveHint = plan?.isCrossCurrency ? (
    <>
      {plan.to.name} receives ~ <MoneyAmount amount={plan.received} /> at $1 = {formatKhrPerUsd(plan)}
    </>
  ) : null;

  const statusNode = saved ? (
    <span role="status" className="text-inflow font-medium">
      Transferred {saved}
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
          tone="neutral"
          label="Amount to transfer"
          hint={receiveHint}
          errorText={dateError ?? error ?? saveError}
          statusNode={statusNode}
          onAmountChange={pending ? undefined : (next) => { setRaw(next); setSaved(null); setSaveError(null); }}
          trailing={from ? <CurrencyBadge currency={from.currency} /> : null}
        />

        <HorizontalChoiceRow
          label="From"
          collection="accounts"
          leadingCaption="From"
          rowOptions={accountChoices}
          selectedId={fromId}
          disabledIds={disabledForFrom}
          onSelect={(id) => {
            const picked = accounts.find((item) => item.accountId === id);
            if (picked) selectFrom(picked);
          }}
          triggerText="All"
          triggerLabel="All from accounts"
          searchLabel="Search accounts"
        />

        <HorizontalChoiceRow
          label="To"
          collection="accounts"
          leadingCaption="To"
          rowOptions={accountChoices}
          selectedId={toId}
          disabledIds={disabledForTo}
          onSelect={(id) => {
            const picked = accounts.find((item) => item.accountId === id);
            if (picked) selectTo(picked);
          }}
          triggerText="All"
          triggerLabel="All to accounts"
          searchLabel="Search accounts"
        />

        <div className="flex shrink-0 items-center gap-2">
          <input
            id="transfer-note"
            type="text"
            aria-label="Note"
            maxLength={500}
            value={note}
            onChange={(event) => updateNote(event.target.value)}
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
              isExpanded
                ? "bg-brand text-on-action"
                : "bg-fill text-ink-muted hover:text-ink",
            )}
          >
            <SlidersHorizontal size={18} aria-hidden="true" />
          </button>
        </div>

        {isExpanded ? (
          <div className="panel-enter space-y-3">
            <div className="flex justify-center">
              <button
                type="button"
                onClick={swap}
                aria-label="Swap the two accounts"
                className="bg-fill text-brand hover:bg-surface-container rounded-pill flex min-h-11 items-center gap-1.5 px-4 text-xs font-semibold transition-colors"
              >
                <ArrowRightLeft size={14} aria-hidden="true" />
                Swap
              </button>
            </div>

            {plan?.isCrossCurrency ? (
              <Card>
                <CardBody className="space-y-3 pt-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-ink-muted text-sm font-medium">
                        Arrives in {plan.to.name}
                      </p>
                      <MoneyAmount
                        amount={plan.received}
                        className="text-xl font-bold"
                      />
                    </div>
                    <CurrencyBadge currency={plan.to.currency} />
                  </div>

                  <p className="text-ink-faint text-xs">
                    {plan.receivedBasis === "user-entered" ? (
                      <>
                        Your rate: {formatRate(plan)} · table says{" "}
                        {formatMoney(plan.quotedReceived)}
                      </>
                    ) : (
                      <>
                        At {formatRate(plan)}
                        {rate.source === "api" ? " (today's fetched rate)" : null}
                      </>
                    )}
                  </p>

                  <div>
                    <label
                      htmlFor="received"
                      className="text-ink-muted mb-1.5 block text-sm font-medium"
                    >
                      Amount received{" "}
                      <span className="normal-case">(optional, if your bank gave a different rate)</span>
                    </label>
                    <input
                      id="received"
                      type="text"
                      inputMode="decimal"
                      value={receivedRaw}
                      onChange={(event) => {
                        setSaved(null);
                        setReceivedRaw(event.target.value);
                      }}
                      placeholder={formatMoney(plan.quotedReceived, { showSymbol: false })}
                      className="field-input tabular text-sm"
                    />
                  </div>

                  {plan.cashStepSuggestion ? (
                    <button
                      type="button"
                      onClick={useSuggestedCashAmount}
                      className="text-brand text-left text-xs font-medium underline"
                    >
                      Round to {formatMoney(plan.cashStepSuggestion)}: the smallest note
                      in circulation is 100៛
                    </button>
                  ) : null}
                </CardBody>
              </Card>
            ) : null}

            {plan ? (
              <Card>
                <CardBody className="pt-4">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="text-ink-faint truncate text-xs">{plan.from.name}</p>
                      <MoneyAmount
                        amount={plan.fromBalanceAfter}
                        colorBySign={plan.fromBalanceAfter.minor < 0}
                        className="font-semibold"
                      />
                    </div>
                    <ArrowRight size={14} className="text-ink-faint shrink-0" aria-hidden="true" />
                    <div className="min-w-0 flex-1 text-right">
                      <p className="text-ink-faint truncate text-xs">{plan.to.name}</p>
                      <MoneyAmount amount={plan.toBalanceAfter} className="font-semibold" />
                    </div>
                  </div>
                </CardBody>
              </Card>
            ) : null}

            {issues.map((issue) => (
              <p
                key={issue.code}
                role="status"
                className="text-outflow flex items-start gap-1.5 text-xs font-medium"
              >
                <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                {issue.message}
              </p>
            ))}

            {readOnly ? (
              <p className="text-ink-faint text-center text-xs">
                Sample data. Saving is available when your account is connected.
              </p>
            ) : null}
          </div>
        ) : null}

        <AmountKeypad currency={sentCurrency} raw={raw} onPress={press} />
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

function formatKhrPerUsd(plan: TransferPlan): string {
  if (plan.appliedRate === null) return "1:1";
  const khrPerUsd =
    plan.sent.currency === "USD" ? plan.appliedRate : 1 / plan.appliedRate;
  return `${khrPerUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}៛`;
}

/**
 * The rate implied by the two legs, phrased the way rates are quoted locally:
 * riel per dollar, whichever direction the money is moving.
 */
function formatRate(plan: TransferPlan): string {
  if (plan.appliedRate === null) return "1:1";
  return `${formatKhrPerUsd(plan)} per $1`;
}
