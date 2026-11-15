import { ChevronLeft, ChevronRight } from "@/components/app-icon";
import { AppLink as Link } from "@/components/app-link";

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
  compact = false,
}: {
  label: string;
  hint?: string;
  prevHref: string;
  nextHref: string;
  /** Sits inside a section heading instead of standing as its own card. */
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="month-head-left">
        <Link href={prevHref} aria-label={`Previous period, ${label}`} rel="prev" className="stepper-btn">
          <ChevronLeft size={18} aria-hidden="true" />
        </Link>
        <h2 key={label} className="selection-label sec-title">{label}</h2>
        <Link href={nextHref} aria-label={`Next period, ${label}`} rel="next" className="stepper-btn">
          <ChevronRight size={18} aria-hidden="true" />
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-card border-card-edge bg-surface shadow-card flex items-center justify-between border-[0.5px] p-1">
      <Link
        href={prevHref}
        aria-label={`Previous period, ${label}`}
        rel="prev"
        className="text-brand hover:bg-fill flex size-11 items-center justify-center rounded-full transition-colors"
      >
        <ChevronLeft size={20} aria-hidden="true" />
      </Link>

      <div key={label} className="selection-label flex min-w-0 flex-col items-center px-2">
        <span className="text-numeric-md text-ink truncate">{label}</span>
        {hint ? <span className="text-ink-muted text-xs">{hint}</span> : null}
      </div>

      <Link
        href={nextHref}
        aria-label={`Next period, ${label}`}
        rel="next"
        className="text-brand hover:bg-fill flex size-11 items-center justify-center rounded-full transition-colors"
      >
        <ChevronRight size={20} aria-hidden="true" />
      </Link>
    </div>
  );
}
