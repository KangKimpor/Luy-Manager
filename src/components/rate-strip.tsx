import { ArrowLeftRight, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { formatMoney, fromMajor } from "@/lib/money";
import { describeFreshness, type RateSnapshot } from "@/lib/rates/repository";
import { cn } from "@/lib/utils";

/**
 * The USD/KHR rate behind every converted total on the screen below it.
 *
 * This is deliberately prominent rather than tucked into settings. Every
 * cross-currency figure in the app is only as good as this number, and a stale
 * rate looks *exactly* like a fresh one once it has been multiplied into a total.
 * `references/currency-data.md` states the rule directly: never serve a stale rate
 * without saying so.
 *
 * So the strip has two faces. Normally it is a quiet line of text. Once the rate
 * is older than STALE_AFTER_DAYS, or no rate was ever published, it turns amber
 * and says what that means for the numbers, with a route to fixing it.
 *
 * The fix links to settings rather than offering a "refresh" button, because
 * fetching the published rate is a service-role job on a schedule and a user
 * cannot trigger it. What they *can* do is enter the rate their own bank or money
 * changer gave them, which is often the more accurate figure anyway.
 */
export function RateStrip({
  snapshot,
  children,
}: {
  snapshot: RateSnapshot;
  /** The display-currency toggle, passed in so this stays a server component. */
  children?: ReactNode;
}) {
  const needsAttention = snapshot.freshness === "stale" || snapshot.freshness === "fallback";
  const perDollar = formatMoney(fromMajor(snapshot.rate.rate, "KHR"));

  return (
    <div
      className={cn(
        "rounded-card border px-3 py-2",
        needsAttention
          ? "border-warning/30 bg-warning-soft"
          : "border-surface-variant bg-surface-container-low",
      )}
    >
      {/*
        The warning copy is two sentences, and squeezing it beside the toggle wraps
        it to three ragged lines. When there is something to say, the message gets
        the full width and the toggle drops beneath it.
      */}
      <div
        className={cn(
          "flex gap-2",
          needsAttention ? "flex-col" : "items-center justify-between gap-3",
        )}
      >
        <div className="flex min-w-0 items-start gap-2">
        {needsAttention ? (
          <TriangleAlert size={16} className="text-warning mt-0.5 shrink-0" aria-hidden="true" />
        ) : (
          <ArrowLeftRight
            size={16}
            className="text-ink-faint mt-0.5 shrink-0"
            aria-hidden="true"
          />
        )}

        <div className="min-w-0">
          {needsAttention ? (
            <>
              <p className="text-body-md text-warning font-semibold">
                {snapshot.freshness === "fallback"
                  ? "No published rate yet"
                  : `Rate is ${snapshot.ageDays} days old`}
              </p>
              <p className="text-body-md text-ink-muted">
                Converted totals may be inaccurate.{" "}
                <Link href="/settings" className="font-semibold underline">
                  Set your own rate
                </Link>
              </p>
            </>
          ) : (
            <p className="text-body-md text-ink-muted truncate">
              <span className="text-ink font-semibold tabular">$1 = {perDollar}</span>
              <span className="text-ink-faint"> · {describeFreshness(snapshot)}</span>
            </p>
          )}
        </div>
        </div>

        {children ? (
          <div className={cn("shrink-0", needsAttention && "self-end")}>{children}</div>
        ) : null}
      </div>
    </div>
  );
}
