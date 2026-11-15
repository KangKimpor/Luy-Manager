import { absolute, type CurrencyCode, formatMoney, type Money } from "@/lib/money";
import { cn } from "@/lib/utils";

interface MoneyAmountProps {
  amount: Money;
  /**
   * Colour the figure by direction. Off by default: a balance is not inherently
   * good or bad, but a net change can be.
   */
  colorBySign?: boolean;
  /** Force a leading + on positive values, for transaction lists. */
  showPlus?: boolean;
  /** Render the magnitude without a leading - or + (e.g. transfers). */
  showSign?: boolean;
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
  showSign = true,
  className,
  locale,
}: MoneyAmountProps) {
  const renderedAmount = showSign ? amount : absolute(amount);
  const formatted = formatMoney(renderedAmount, { locale });
  const isInflow = amount.minor > 0;
  const isOutflow = amount.minor < 0;

  return (
    <data
      value={`${amount.minor} ${amount.currency}`}
      className={cn(
        "font-num tabular",
        colorBySign && isInflow && "text-inflow",
        colorBySign && isOutflow && "text-outflow",
        className,
      )}
    >
      {showSign && showPlus && isInflow ? `+${formatted}` : formatted}
    </data>
  );
}

/** A plain coloured caption marking which currency an account or amount is held in. */
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
        // Dedicated currency accents as quiet text rather than a pill.
        "ccy-label",
        currency === "USD" ? "ccy-label-usd" : "ccy-label-khr",
        className,
      )}
    >
      {currency}
    </span>
  );
}
