"use client";

import { Check, RotateCcw, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { clearManualRate, setManualRate } from "@/app/actions/rates";

/**
 * Recording the rate your own bank or money changer gave you.
 *
 * Stored as a personal override for a specific day, which the rate reader prefers
 * over the published figure. Only aggregates and future conversions change: any
 * transaction already recorded keeps the rate stored on it, which is the whole point
 * of persisting `exchange_rate` alongside every converted amount.
 */
export function ManualRateForm({ currentRate }: { currentRate: number }) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);

  const [rate, setRate] = useState("");
  const [asOf, setAsOf] = useState(today);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSaved(false);

    const result = await setManualRate({ rate: rate.trim(), asOf });
    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setSaved(true);
    setRate("");
    router.refresh();
  }

  async function clear() {
    setPending(true);
    setError(null);

    const result = await clearManualRate(asOf);
    setPending(false);

    if (!result.ok) setError(result.error);
    else router.refresh();
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label
            htmlFor="manual-rate"
            className="text-ink-muted mb-2 block text-xs font-semibold tracking-wide uppercase"
          >
            Riel per $1
          </label>
          <input
            id="manual-rate"
            type="text"
            inputMode="decimal"
            value={rate}
            onChange={(event) => setRate(event.target.value)}
            placeholder={String(Math.round(currentRate))}
            className="border-border-subtle bg-surface rounded-card text-ink placeholder:text-ink-faint tabular min-h-11 w-full border px-3 text-sm"
          />
        </div>

        <div>
          <label
            htmlFor="manual-rate-date"
            className="text-ink-muted mb-2 block text-xs font-semibold tracking-wide uppercase"
          >
            For
          </label>
          <input
            id="manual-rate-date"
            type="date"
            value={asOf}
            max={today}
            onChange={(event) => setAsOf(event.target.value)}
            className="border-border-subtle bg-surface rounded-card text-ink min-h-11 border px-3 text-sm"
          />
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-outflow flex items-start gap-1.5 text-sm">
          <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      {saved ? (
        <p role="status" className="text-inflow text-sm font-medium">
          Saved. Totals now convert at your rate for that day.
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" size="full" disabled={pending || rate.trim() === ""}>
          <Check size={16} aria-hidden="true" />
          {pending ? "Saving…" : "Use my rate"}
        </Button>

        <button
          type="button"
          onClick={clear}
          disabled={pending}
          title="Go back to the published rate for this date"
          className="border-border-subtle bg-surface text-ink-muted hover:text-ink rounded-card flex min-h-11 shrink-0 items-center gap-1.5 border px-3 text-xs font-semibold disabled:opacity-40"
        >
          <RotateCcw size={14} aria-hidden="true" />
          Reset
        </button>
      </div>

      <p className="text-ink-faint text-xs">
        Transactions you have already recorded keep the rate they were saved with, so
        past figures do not move.
      </p>
    </form>
  );
}
