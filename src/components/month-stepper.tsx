import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

/**
 * Period navigation for the dashboard and budgets.
 *
 * Links rather than buttons, because the month is a URL parameter: a particular
 * month is then shareable, survives a refresh, and the arithmetic stays on the
 * server. That also means this needs no client JavaScript at all.
 *
 * Replaces the pair of prev/next links that used to sit at the *bottom* of the
 * dashboard, below every card. Which month you are looking at is context for
 * reading the figures, so it belongs above them.
 */
export function MonthStepper({
  label,
  hint,
  prevHref,
  nextHref,
}: {
  label: string;
  hint?: string;
  prevHref: string;
  nextHref: string;
}) {
  return (
    <div className="rounded-card border-surface-variant bg-surface shadow-card flex items-center justify-between border p-1">
      <Link
        href={prevHref}
        aria-label={`Previous period, ${label}`}
        rel="prev"
        className="text-ink-muted hover:bg-surface-container flex size-10 items-center justify-center rounded-xl transition-colors"
      >
        <ChevronLeft size={20} aria-hidden="true" />
      </Link>

      <div className="flex min-w-0 flex-col items-center px-2">
        <span className="text-numeric-md text-ink truncate">{label}</span>
        {hint ? <span className="text-ink-muted text-xs">{hint}</span> : null}
      </div>

      <Link
        href={nextHref}
        aria-label={`Next period, ${label}`}
        rel="next"
        className="text-ink-muted hover:bg-surface-container flex size-10 items-center justify-center rounded-xl transition-colors"
      >
        <ChevronRight size={20} aria-hidden="true" />
      </Link>
    </div>
  );
}
