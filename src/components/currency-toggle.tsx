"use client";

import { useOptimistic, useState, useTransition } from "react";

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
  variant = "default",
  className,
}: {
  current: CurrencyCode;
  variant?: "default" | "hero";
  className?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(current);
  const [error, setError] = useState(false);

  function choose(currency: CurrencyCode) {
    if (currency === optimistic || isPending) return;

    startTransition(async () => {
      setOptimistic(currency);
      setError(false);
      try {
        await setDisplayCurrency(currency);
      } catch {
        setError(true);
      }
    });
  }

  const isHero = variant === "hero";

  return (
    <div className="inline-flex flex-col gap-1">
    <div
      role="group"
      aria-label="Show totals in"
      aria-busy={isPending}
      // Dimmed while in flight so a slow network reads as "working" rather than
      // as the toggle having been ignored.
      className={cn(
        isHero
          ? "hero-seg"
          : "segmented-control rounded-pill bg-fill h-9 items-center",
        "transition-opacity",
        isPending && "opacity-70",
        className,
      )}
    >
      {CURRENCIES.map((code) => (
        <button
          key={code}
          type="button"
          aria-pressed={optimistic === code}
          disabled={isPending}
          onClick={() => choose(code)}
          className={cn(
            isHero
              ? undefined
              : cn(
                  "rounded-pill relative z-10 min-w-[56px] px-3 text-[13px] leading-[18px] tracking-[-0.006em] before:absolute before:-inset-y-1.5 before:inset-x-0 before:rounded-pill",
                  optimistic === code
                    ? "text-ink font-semibold"
                    : "text-ink-muted hover:text-ink font-medium",
                ),
          )}
        >
          {code}
        </button>
      ))}
    </div>
    {error ? <p role="alert" className={cn("feedback-enter text-xs", isHero ? "text-on-hero" : "text-outflow")}>Could not change currency. Try again.</p> : null}
    </div>
  );
}
