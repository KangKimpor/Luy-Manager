"use client";

import { Plus, X } from "lucide-react";

import { CurrencyBadge, MoneyAmount } from "@/components/money-amount";
import { Card, CardBody } from "@/components/ui/card";
import {
  CURRENCIES,
  type CurrencyCode,
  type ExchangeRate,
  mixedTotal,
  parseAmount,
} from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * One payment settled in two currencies (PRD Section 7).
 *
 * This is the everyday Cambodian case, not an edge case: prices are quoted in
 * dollars, US coins do not circulate, so sub-dollar change comes back in riel. A
 * merchant settling $3.60 typically takes $3 and 2,400៛. Recording that as two
 * transactions would double-count the purchase in category totals, which is
 * precisely why `transaction_tenders` exists.
 *
 * The total is *derived* from the tenders rather than entered alongside them. Two
 * figures that can disagree would need reconciling after rounding, and the
 * reconciliation is where the bug would live. Here the total is the sum of what was
 * handed over, by construction.
 */

export interface TenderDraft {
  id: string;
  amount: string;
  currency: CurrencyCode;
}

export function newTender(currency: CurrencyCode): TenderDraft {
  return { id: crypto.randomUUID(), amount: "", currency };
}

/** Parse the drafts that are filled in, ignoring blanks still being typed. */
export function parseTenders(
  tenders: readonly TenderDraft[],
): Array<{ amount: string; currency: CurrencyCode }> {
  return tenders
    .filter((tender) => tender.amount.trim() !== "")
    .map((tender) => ({ amount: tender.amount.trim(), currency: tender.currency }));
}

/**
 * The combined value in one currency, or null when nothing usable is entered yet.
 *
 * Returns null rather than zero so the caller can distinguish "not ready" from
 * "genuinely nothing", and never shows a misleading $0.00 mid-entry.
 */
export function tenderTotal(
  tenders: readonly TenderDraft[],
  target: CurrencyCode,
  rate: ExchangeRate,
) {
  const parsed = parseTenders(tenders);
  if (parsed.length === 0) return null;

  try {
    const amounts = parsed.map((tender) => parseAmount(tender.amount, tender.currency));
    if (amounts.some((amount) => amount.minor <= 0)) return null;
    return mixedTotal({ tenders: amounts }, target, rate);
  } catch {
    // Half-typed input is normal here, so an unparseable value is not an error
    // worth surfacing: it just means there is no total yet.
    return null;
  }
}

export function TenderEditor({
  tenders,
  targetCurrency,
  rate,
  onChange,
}: {
  tenders: readonly TenderDraft[];
  /** The account's currency: what the derived total will be denominated in. */
  targetCurrency: CurrencyCode;
  rate: ExchangeRate;
  onChange: (next: TenderDraft[]) => void;
}) {
  const total = tenderTotal(tenders, targetCurrency, rate);

  function update(id: string, patch: Partial<TenderDraft>) {
    onChange(tenders.map((tender) => (tender.id === id ? { ...tender, ...patch } : tender)));
  }

  function remove(id: string) {
    onChange(tenders.filter((tender) => tender.id !== id));
  }

  function add() {
    // Default the new row to the currency the existing ones are not in, since the
    // whole point of a second tender is that it is a different currency.
    const used = new Set(tenders.map((tender) => tender.currency));
    const next = CURRENCIES.find((code) => !used.has(code)) ?? targetCurrency;
    onChange([...tenders, newTender(next)]);
  }

  return (
    <Card>
      <CardBody className="space-y-3 pt-4">
        <div>
          <p className="text-ink-muted text-xs font-semibold tracking-wide uppercase">
            Paid with
          </p>
          <p className="text-ink-faint mt-0.5 text-xs">
            Two currencies for one purchase: $3 and 2,400៛ for a $3.60 bill.
          </p>
        </div>

        <ul className="space-y-2">
          {tenders.map((tender) => (
            <li key={tender.id} className="flex items-center gap-2">
              <input
                type="text"
                inputMode="decimal"
                value={tender.amount}
                onChange={(event) => update(tender.id, { amount: event.target.value })}
                placeholder={tender.currency === "KHR" ? "2400" : "3.00"}
                aria-label={`Amount in ${tender.currency}`}
                className="border-border-subtle bg-surface rounded-card text-ink placeholder:text-ink-faint tabular min-h-11 flex-1 border px-3 text-sm"
              />

              <div className="flex gap-1" role="group" aria-label="Tender currency">
                {CURRENCIES.map((code) => (
                  <button
                    key={code}
                    type="button"
                    aria-pressed={tender.currency === code}
                    onClick={() => {
                      // Riel has no subunit, so a fractional entry cannot survive
                      // the switch.
                      const amount =
                        code === "KHR" ? tender.amount.split(".")[0] : tender.amount;
                      update(tender.id, { currency: code, amount });
                    }}
                    className={cn(
                      "rounded-pill min-h-9 px-2.5 text-xs font-bold transition-colors",
                      tender.currency === code
                        ? "bg-brand text-white"
                        : "bg-surface-muted text-ink-muted",
                    )}
                  >
                    {code}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => remove(tender.id)}
                aria-label="Remove this tender"
                className="text-ink-faint hover:text-outflow flex size-8 shrink-0 items-center justify-center"
              >
                <X size={15} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>

        {tenders.length < CURRENCIES.length ? (
          <button
            type="button"
            onClick={add}
            className="text-brand flex items-center gap-1 text-xs font-semibold"
          >
            <Plus size={14} aria-hidden="true" />
            Add another currency
          </button>
        ) : null}

        <div className="border-border-subtle/70 flex items-baseline justify-between border-t pt-2.5">
          <span className="text-ink-muted text-xs font-semibold tracking-wide uppercase">
            Total
          </span>
          {total ? (
            <span className="flex items-center gap-1.5">
              <MoneyAmount amount={total} className="text-base font-bold" />
              <CurrencyBadge currency={targetCurrency} />
            </span>
          ) : (
            <span className="text-ink-faint text-sm">-</span>
          )}
        </div>

        {total && total.minor > 0 ? (
          <p className="text-ink-faint text-xs">
            Recorded as one purchase of{" "}
            <MoneyAmount amount={total} /> against the account, with the
            denominations kept alongside it.
          </p>
        ) : null}

        {/* Guards against a tender list that parses to nothing usable. */}
        {!total && parseTenders(tenders).length > 0 ? (
          <p role="alert" className="text-outflow text-xs">
            Every tender needs an amount above zero.
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}
