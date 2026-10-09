"use client";

import { Delete } from "lucide-react";
import type { ReactNode } from "react";

import { Card, CardBody } from "@/components/ui/card";
import { type CurrencyCode, formatMoney, fromMajor, type Money } from "@/lib/money";
import { CURRENCY_META } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * The numeric keypad shared by transaction and transfer entry.
 *
 * PRD Section 1 sets a five-second budget for adding an entry, which is what rules
 * out the OS keyboard: no open/close animation, identical layout on every device,
 * and no way to produce a value that needs validating.
 *
 * The keying rules live in the pure functions below rather than in component
 * state, because they are currency rules (riel has no subunit, dollars stop at
 * two places), and rules about money belong somewhere they can be tested.
 */

export const KEYPAD_KEYS = [
  "1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del",
] as const;

export type KeypadKey = (typeof KEYPAD_KEYS)[number];

/**
 * Apply a keypress to the raw entry string.
 *
 * Works on the string the user is typing, not on a `Money`, because a partially
 * typed amount is not yet a quantity: "0." and "1." are legitimate intermediate
 * states that no integer representation can hold.
 */
export function pressAmountKey(
  raw: string,
  key: KeypadKey,
  currency: CurrencyCode,
): string {
  if (key === "del") return raw.slice(0, -1);

  const { decimals } = CURRENCY_META[currency];

  if (key === ".") {
    // A decimal point in a zero-decimal currency has nothing to separate.
    if (decimals === 0 || raw.includes(".")) return raw;
    return raw === "" ? "0." : `${raw}.`;
  }

  const [, typedDecimals] = raw.split(".");
  // Further digits would be silently rounded away on save, so refusing the
  // keypress is more honest than accepting input that will not survive.
  if (typedDecimals !== undefined && typedDecimals.length >= decimals) return raw;

  // Avoid a leading zero turning into "05".
  if (raw === "0") return key;
  const candidate = raw + key;
  try {
    fromMajor(Number(candidate), currency);
    return candidate;
  } catch {
    // An oversized amount used to throw during render and replace the whole form.
    return raw;
  }
}

/**
 * Re-key an entry for a different currency.
 *
 * Switching from a USD account to a KHR one mid-entry has to drop the fractional
 * part, since riel cannot express it. Truncates rather than rounds: the user is
 * still typing, and rounding a half-finished number up would put digits on screen
 * they never pressed.
 */
export function truncateForCurrency(raw: string, currency: CurrencyCode): string {
  if (CURRENCY_META[currency].decimals > 0) return raw;
  return raw.split(".")[0];
}

/**
 * Read the entry as money.
 *
 * `Number` rather than `parseFloat`, and straight into `fromMajor` so the value
 * becomes integer minor units immediately. An empty or half-typed entry reads as
 * zero, which the caller treats as "not yet savable".
 */
export function parseKeypadAmount(raw: string, currency: CurrencyCode): Money {
  const parsed = Number(raw);
  if (raw === "" || !Number.isFinite(parsed)) return fromMajor(0, currency);
  try {
    return fromMajor(parsed, currency);
  } catch {
    return fromMajor(0, currency);
  }
}

const TONE_CLASS = {
  outflow: "text-outflow",
  inflow: "text-inflow",
  neutral: "text-ink",
} as const;

export function AmountDisplay({
  amount,
  tone = "neutral",
  label = "Amount entered",
  trailing,
}: {
  amount: Money;
  tone?: keyof typeof TONE_CLASS;
  label?: string;
  trailing?: ReactNode;
}) {
  return (
    <Card className="border-0 bg-surface-container-low">
      <CardBody className="py-6">
        <p className="text-ink-faint mb-3 text-xs font-semibold uppercase tracking-wider">{label}</p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <output
            aria-live="polite"
            aria-label={label}
            className={cn("tabular break-all text-4xl font-semibold tracking-tight", TONE_CLASS[tone])}
          >
            {formatMoney(amount)}
          </output>
          {trailing}
        </div>
      </CardBody>
    </Card>
  );
}

export function AmountKeypad({
  currency,
  onPress,
}: {
  currency: CurrencyCode;
  onPress: (key: KeypadKey) => void;
}) {
  const decimalDisabled = CURRENCY_META[currency].decimals === 0;

  return (
    <div className="grid grid-cols-3 gap-2">
      {KEYPAD_KEYS.map((key) => {
        const disabled = key === "." && decimalDisabled;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onPress(key)}
            aria-label={key === "del" ? "Delete last digit" : key}
            disabled={disabled}
            className={cn(
              "bg-surface border-surface-variant hover:border-brand/30 rounded-2xl flex min-h-14 items-center justify-center border text-2xl font-medium transition-[background-color,transform,border-color] active:bg-brand-soft active:text-brand active:scale-90",
              disabled && "opacity-30",
            )}
          >
            {key === "del" ? <Delete size={20} aria-hidden="true" /> : key}
          </button>
        );
      })}
    </div>
  );
}
