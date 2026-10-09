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
  brand: "#087f78",
  brandContainer: "#0b9488",

  /** Income. Matches --color-inflow. */
  inflow: "#187448",
  /** Expense. Matches --color-outflow. */
  outflow: "#bb493c",

  /** Axis labels and other de-emphasised marks. Matches --color-ink-faint. */
  inkFaint: "#687d80",
  /** Hairlines and tooltip borders. Matches --color-surface-variant. */
  border: "#dfe8e4",
  /** Tooltip and card backgrounds. Matches --color-surface. */
  surface: "#ffffff",
} as const;

export const APP_COLORS = {
  brand: CHART_COLORS.brand,
  background: "#f4f7f5",
} as const;
