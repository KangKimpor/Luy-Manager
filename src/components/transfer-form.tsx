"use client";

import { ArrowRight, ArrowRightLeft, Check, TriangleAlert } from "lucide-react";
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
  parseAmount,
} from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Moving money between accounts, including across currencies.
 *
 * PRD Section 8 lists Transfer as a transaction type and PRD Section 9 gives the
 * shape users ask for it in: "Transfer $100 ABA to Wing". Because most Cambodian
 * banks hold separate USD and KHR accounts rather than one multi-currency account,
 * a transfer between two of a person's own accounts is routinely also a currency
 * exchange, which is the everyday way someone turns dollars into riel or back.
 *
 * Two things this form takes seriously:
 *
 *   - The amount leaving is in the source account's currency and the amount
 *     arriving is in the destination's. They are different numbers, and both are
 *     shown, because "$100" alone tells you nothing about what will appear in the
 *     Wing balance.
 *   - The converted figure is a proposal, not a fact. Banks and money changers
 *     apply their own rate, so the amount received is editable and the entered
 *     figure wins. The rate implied by the two amounts is then displayed, so the
 *     user can see what they were actually charged.
 */

interface TransferFormProps {
  accounts: readonly AccountBalance[];
  /** The rate in force, from the daily sync. Falls back to the cold-start rate. */
  rate?: ExchangeRate;
  /** Demo mode cannot persist, so the form says so rather than failing on submit. */
  readOnly?: boolean;
}

export function TransferForm({
  accounts,
  rate = DEFAULT_RATE,
  readOnly = false,
}: TransferFormProps) {
  const [fromId, setFromId] = useState(accounts[0]?.accountId ?? "");
  const [toId, setToId] = useState(
    // Default to the first account in a different currency, since exchanging is
    // the common case and it makes the conversion preview visible immediately.
    accounts.find((a) => a.currency !== accounts[0]?.currency)?.accountId ??
      accounts[1]?.accountId ??
      "",
  );
  const [raw, setRaw] = useState("");
  const [receivedRaw, setReceivedRaw] = useState("");
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const from = accounts.find((a) => a.accountId === fromId);
  const to = accounts.find((a) => a.accountId === toId);

  const sentCurrency: CurrencyCode = from?.currency ?? "USD";
  const amount = useMemo(
    () => parseKeypadAmount(raw, sentCurrency),
    [raw, sentCurrency],
  );

  /**
   * The plan, or the reason there isn't one.
   *
   * `planTransfer` throws on anything the database would refuse: same account
   * both sides, an amount in the wrong currency, a zero transfer. Catching here
   * turns those into a message instead of a crashed render, and means the
   * invariants live in the domain layer rather than being restated in the UI.
   */
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
  const canSave = plan !== null && error === null && !readOnly;

  function press(key: KeypadKey) {
    setSaved(null);
    setRaw((current) => pressAmountKey(current, key, sentCurrency));
  }

  function selectFrom(account: AccountBalance) {
    setSaved(null);
    // Choosing the same account for both sides is the one state the domain layer
    // refuses outright, so swap rather than let it happen.
    if (account.accountId === toId) setToId(fromId);
    setFromId(account.accountId);
    // The entry is denominated in the source account's currency, so a switch to
    // riel has to drop any fractional part already typed.
    setRaw((current) => truncateForCurrency(current, account.currency));
    setReceivedRaw("");
  }

  function selectTo(account: AccountBalance) {
    setSaved(null);
    if (account.accountId === fromId) setFromId(toId);
    setToId(account.accountId);
    setReceivedRaw("");
  }

  function swap() {
    setSaved(null);
    setFromId(toId);
    setToId(fromId);
    setRaw("");
    setReceivedRaw("");
  }

  function useSuggestedCashAmount() {
    if (!plan?.cashStepSuggestion) return;
    // Recorded as a user-entered figure, not applied silently: rounding a ledger
    // amount changes its value, so it has to be a choice the user made.
    setReceivedRaw(formatMoney(plan.cashStepSuggestion, { showSymbol: false }));
  }

  async function handleSave() {
    if (!plan || readOnly) return;

    setPending(true);
    setSaveError(null);

    // The action re-plans server-side from the accounts it reads itself, then
    // inserts both legs in a single statement: migration 0004 defers its balance
    // check to COMMIT precisely so the pair lands together, and a half-written
    // transfer would debit one account and credit nothing.
    const result = await createTransfer({
      fromAccountId: plan.from.accountId,
      toAccountId: plan.to.accountId,
      amount: raw.trim(),
      receivedAmount: receivedRaw.trim() === "" ? undefined : receivedRaw.trim(),
      notes: note.trim() === "" ? null : note.trim(),
    });

    setPending(false);

    if (!result.ok) {
      setSaveError(result.error);
      return;
    }

    setSaved(describeTransfer(plan));
    setRaw("");
    setReceivedRaw("");
    setNote("");
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

  return (
    <div className="space-y-3">
      <AmountDisplay
        amount={amount}
        tone="neutral"
        label="Amount to transfer"
        trailing={
          from ? (
            <div className="flex items-center gap-1.5">
              <span className="text-ink-faint text-xs">from</span>
              <CurrencyBadge currency={from.currency} />
            </div>
          ) : null
        }
      />

      {/* What arrives on the other side. The whole point of the cross-currency
          case, so it sits directly under the amount rather than below the keypad. */}
      {plan?.isCrossCurrency ? (
        <Card>
          <CardBody className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-ink-muted text-xs font-semibold tracking-wide uppercase">
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
                className="text-ink-muted mb-1.5 block text-xs font-semibold tracking-wide uppercase"
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
                className="border-border-subtle bg-surface rounded-card text-ink placeholder:text-ink-faint tabular min-h-11 w-full border px-3 text-sm"
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

      <AmountKeypad currency={sentCurrency} onPress={press} />

      {/* Accounts. Two pickers plus a swap, because reversing a transfer is a
          common correction and re-picking both sides invites choosing the same
          account twice. */}
      <fieldset>
        <legend className="text-ink-muted mb-2 text-xs font-semibold tracking-wide uppercase">
          From
        </legend>
        <AccountPicker
          accounts={accounts}
          selectedId={fromId}
          otherId={toId}
          onSelect={selectFrom}
        />
      </fieldset>

      <div className="flex justify-center">
        <button
          type="button"
          onClick={swap}
          aria-label="Swap the two accounts"
          className="bg-surface-muted text-ink-muted hover:text-ink rounded-pill flex min-h-9 items-center gap-1.5 px-3 text-xs font-semibold transition-colors"
        >
          <ArrowRightLeft size={14} aria-hidden="true" />
          Swap
        </button>
      </div>

      <fieldset>
        <legend className="text-ink-muted mb-2 text-xs font-semibold tracking-wide uppercase">
          To
        </legend>
        <AccountPicker
          accounts={accounts}
          selectedId={toId}
          otherId={fromId}
          onSelect={selectTo}
        />
      </fieldset>

      {/* Resulting balances. A transfer is the one entry where the user is usually
          thinking about what is left behind, not just what moved. */}
      {plan ? (
        <Card>
          <CardBody>
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

      <div>
        <label
          htmlFor="transfer-note"
          className="text-ink-muted mb-2 block text-xs font-semibold tracking-wide uppercase"
        >
          Note <span className="normal-case">(optional)</span>
        </label>
        <input
          id="transfer-note"
          type="text"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Top up Wing"
          className="border-border-subtle bg-surface rounded-card text-ink placeholder:text-ink-faint min-h-11 w-full border px-3 text-sm"
        />
      </div>

      {error ? (
        <p role="alert" className="text-outflow text-sm font-medium">
          {error}
        </p>
      ) : null}

      {saveError ? (
        <p role="alert" className="text-outflow flex items-start gap-1.5 text-sm">
          <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          {saveError}
        </p>
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

      <Button size="full" disabled={!canSave || pending} onClick={handleSave}>
        <Check size={18} aria-hidden="true" />
        {pending
          ? "Saving…"
          : plan?.isCrossCurrency
            ? "Exchange and transfer"
            : "Transfer"}
      </Button>

      {readOnly ? (
        <p className="text-ink-faint text-center text-xs">
          The demo runs on sample data, so nothing is saved. Connect Supabase to
          record real transfers.
        </p>
      ) : null}

      {saved ? (
        <p role="status" className="text-inflow text-center text-sm font-medium">
          Transferred {saved}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The rate implied by the two legs, phrased the way rates are quoted locally:
 * riel per dollar, whichever direction the money is moving.
 */
function formatRate(plan: TransferPlan): string {
  if (plan.appliedRate === null) return "1:1";

  const khrPerUsd =
    plan.sent.currency === "USD" ? plan.appliedRate : 1 / plan.appliedRate;

  // Formatted rather than rounded: a rate is not a money amount, and letting the
  // formatter drop the fraction avoids a rounding call on a value that only ever
  // reaches the screen. Whole riel per dollar is how the rate is quoted locally.
  return `${khrPerUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}៛ per $1`;
}

function AccountPicker({
  accounts,
  selectedId,
  otherId,
  onSelect,
}: {
  accounts: readonly AccountBalance[];
  selectedId: string;
  otherId: string;
  onSelect: (account: AccountBalance) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {accounts.map((account) => {
        const isSelected = account.accountId === selectedId;
        const isOtherSide = account.accountId === otherId;

        return (
          <button
            key={account.accountId}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onSelect(account)}
            className={cn(
              "rounded-pill flex min-h-9 items-center gap-1.5 border px-3 text-xs font-medium transition-colors",
              isSelected
                ? "border-brand bg-brand-soft text-brand"
                : "border-border-subtle bg-surface text-ink-muted",
              // Marked, not disabled: tapping it swaps the two sides, which is
              // more useful than refusing the tap.
              isOtherSide && !isSelected && "opacity-40",
            )}
          >
            {account.name}
            <CurrencyBadge currency={account.currency} />
          </button>
        );
      })}
    </div>
  );
}
