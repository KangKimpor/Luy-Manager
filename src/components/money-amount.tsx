import { type CurrencyCode, formatMoney, type Money } from "@/lib/money";
import { cn } from "@/lib/utils";

interface MoneyAmountProps {
  amount: Money;
  /**
   * Colour the figure by direction. Off by default: a balance is not inherently
   * good or bad, but a transaction row is.
   */
  colorBySign?: boolean;
  /** Force a leading + on positive values, for transaction lists. */
  showPlus?: boolean;
  className?: string;
  locale?: string;
}

/**
 * Renders an amount with its currency symbol in the right position.
 *
 * Wraps the value in a <data> element carrying the machine-readable minor units,
 * so the formatted string stays presentational and the underlying integer is
 * still available to assistive tech and tests.
 */
export function MoneyAmount({
  amount,
  colorBySign = false,
  showPlus = false,
  className,
  locale,
}: MoneyAmountProps) {
  const formatted = formatMoney(amount, { locale });
  const isInflow = amount.minor > 0;
  const isOutflow = amount.minor < 0;

  return (
    <data
      value={`${amount.minor} ${amount.currency}`}
      className={cn(
        "tabular",
        colorBySign && isInflow && "text-inflow",
        colorBySign && isOutflow && "text-outflow",
        className,
      )}
    >
      {showPlus && isInflow ? `+${formatted}` : formatted}
    </data>
  );
}

/** A small pill marking which currency an account or amount is held in. */
export function CurrencyBadge({
  currency,
  className,
}: {
  currency: CurrencyCode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "rounded-pill px-2 py-0.5 text-[0.625rem] font-bold tracking-wide",
        currency === "USD" ? "bg-inflow-soft text-usd" : "bg-outflow-soft text-khr",
        className,
      )}
    >
      {currency}
    </span>
  );
}
