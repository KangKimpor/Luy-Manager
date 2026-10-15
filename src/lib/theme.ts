/**
 * Design token values for consumers that cannot read CSS.
 *
 * Charts are the reason this exists. recharts and raw SVG take colours as
 * concrete strings, not `currentColor` or a Tailwind class, so the palette has to
 * appear somewhere in TypeScript. Left inline, those literals silently rot: the
 * palette moved to a Material-derived set and three components carried on drawing
 * with the previous green, red and grey, which is exactly the kind of drift that
 * nobody notices because each chart still looks fine on its own.
 *
 * Keep in step with the `@theme` block in src/app/globals.css. That file stays the
 * source of truth for anything styled with a class; this is the escape hatch for
 * the handful of places that need a literal.
 */
export const CHART_COLORS = {
  brand: "var(--color-brand)",
  brandContainer: "var(--color-brand-container)",

  /** Income. Matches --color-inflow. */
  inflow: "var(--color-inflow)",
  /** Expense. Matches --color-outflow. */
  outflow: "var(--color-outflow)",

  /** Axis labels and other de-emphasised marks. Matches --color-ink-faint. */
  inkFaint: "var(--color-ink-faint)",
  /** Hairlines and tooltip borders. Matches --color-surface-variant. */
  border: "var(--color-surface-variant)",
  /** Tooltip and card backgrounds. Matches --color-surface. */
  surface: "var(--color-surface)",
  categories: ["var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)", "var(--color-chart-4)", "var(--color-chart-5)", "var(--color-chart-6)", "var(--color-chart-other)"],
} as const;

export const APP_COLORS = {
  brand: "#087f78",
  background: "#f4f7f5",
} as const;
