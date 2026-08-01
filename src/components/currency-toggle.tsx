"use client";

import { useOptimistic, useTransition } from "react";

import { setDisplayCurrency } from "@/app/actions/display-currency";
import { CURRENCIES, type CurrencyCode } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Switches the currency totals are reported in (PRD Section 7).
 *
 * Optimistic rather than awaited. The answer is already known locally (the user
 * picked one of two options), so waiting for the server round trip before moving
 * the selection would make a free choice feel like a submission. The server
 * re-render then arrives with the recomputed figures underneath.
 *
 * Per-account and per-transaction amounts deliberately do not follow this: those
 * stay in the currency actually held or actually spent, because that is the figure
 * a bank app or a receipt will show. Only aggregates are converted.
 */
export function CurrencyToggle({
  current,
  className,
}: {
  current: CurrencyCode;
  className?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(current);

  function choose(currency: CurrencyCode) {
    if (currency === optimistic) return;

    startTransition(async () => {
      setOptimistic(currency);
      await setDisplayCurrency(currency);
    });
  }

  return (
    <div
      role="group"
      aria-label="Show totals in"
      // Dimmed while in flight so a slow network reads as "working" rather than
      // as the toggle having been ignored.
      className={cn(
        "bg-surface-muted rounded-pill inline-flex gap-1 p-1 transition-opacity",
        isPending && "opacity-70",
        className,
      )}
    >
      {CURRENCIES.map((code) => (
        <button
          key={code}
          type="button"
          aria-pressed={optimistic === code}
          onClick={() => choose(code)}
          className={cn(
            "rounded-pill min-h-8 px-3 text-xs font-bold transition-colors",
            optimistic === code
              ? "bg-surface text-ink shadow-card"
              : "text-ink-muted hover:text-ink",
          )}
        >
          {code}
        </button>
      ))}
    </div>
  );
}
