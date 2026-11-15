"use client";

import { Delete } from "@/components/app-icon";
import { useRef, useState, type ReactNode } from "react";

import { type CurrencyCode, formatMoney, parseAmount, zero, type Money } from "@/lib/money";
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
 * state, because they are currency rules (bank USD and KHR both retain two
 * places), and rules about money belong somewhere they can be tested.
 */

export const USD_KEYPAD_KEYS = [
  "1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del",
] as const;

export const KHR_KEYPAD_KEYS = [
  "1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "000", "del",
] as const;

export const KEYPAD_KEYS = KHR_KEYPAD_KEYS;

export type KeypadKey = (typeof KHR_KEYPAD_KEYS)[number];

const TOP_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
const USD_BOTTOM_KEYS = [".", "0", "del"] as const;
const KHR_BOTTOM_KEYS = [".", "0", "000", "del"] as const;

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

  if (key === "000") {
    if (raw.includes(".")) return raw;
    if (raw === "" || raw === "0") return "0";
    let next = raw;
    for (let i = 0; i < 3; i += 1) {
      const candidate = pressAmountKey(next, "0", currency);
      if (candidate === next) return raw;
      next = candidate;
    }
    return next;
  }

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
    parseAmount(candidate, currency);
    return candidate;
  } catch {
    // An oversized amount used to throw during render and replace the whole form.
    return raw;
  }
}

/**
 * Re-key an entry for a different currency.
 *
 * USD and bank KHR keep their fractional digits. A currency with no fractional
 * precision would truncate a draft, never round unpressed digits into it.
 */
export function truncateForCurrency(raw: string, currency: CurrencyCode): string {
  if (CURRENCY_META[currency].decimals > 0) return raw;
  return raw.split(".")[0];
}

/**
 * Read the entry as money.
 *
 * Parse the original decimal string so a bank amount never passes through float
 * arithmetic. A half-typed decimal keeps its whole part until the next digit.
 */
export function parseKeypadAmount(raw: string, currency: CurrencyCode): Money {
  if (raw === "") return zero(currency);
  try {
    return parseAmount(raw.endsWith(".") ? `${raw}0` : raw, currency);
  } catch {
    return zero(currency);
  }
}

/** Clipboard text must fit the keypad exactly, without rounding or currency conversion. */
export function pastedAmount(input: string, currency: CurrencyCode): string {
  const otherCurrency = currency === "USD" ? /KHR|៛/i : /USD|\$/i;
  if (otherCurrency.test(input)) throw new Error(`Choose a ${currency === "USD" ? "KHR" : "USD"} account first.`);
  const raw = input.trim().replace(currency === "USD" ? /^(?:USD\s*|\$\s*)|\s*USD$/gi : /^(?:KHR\s*)|\s*(?:KHR|៛)$/gi, "").trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(raw)) {
    throw new Error("Paste a positive amount with up to two decimal places.");
  }
  const normalized = raw.replaceAll(",", "").replace(/^0+(?=\d)/, "");
  parseAmount(normalized, currency);
  return normalized;
}

const TONE_CLASS = {
  outflow: "text-ink",
  inflow: "text-inflow",
  neutral: "text-ink",
} as const;

export function AmountDisplay({
  amount,
  tone = "neutral",
  label = "Amount entered",
  hint,
  trailing,
  onAmountChange,
}: {
  amount: Money;
  tone?: keyof typeof TONE_CLASS;
  label?: string;
  hint?: ReactNode;
  trailing?: ReactNode;
  onAmountChange?: (raw: string) => void;
}) {
  const [pasteError, setPasteError] = useState<string | null>(null);
  const pasteButton = useRef<HTMLButtonElement>(null);

  function paste(text: string) {
    try {
      const raw = pastedAmount(text, amount.currency);
      onAmountChange?.(raw);
      setPasteError(null);
    } catch (error) {
      setPasteError(error instanceof Error ? error.message : "Could not read that amount.");
    }
  }

  return (
    <div className="amount-stage py-2">
      <div className="flex w-full items-center justify-center gap-3">
        <output
          aria-live="polite"
          aria-label={label}
          tabIndex={onAmountChange ? 0 : undefined}
          onPaste={onAmountChange ? (event) => { event.preventDefault(); paste(event.clipboardData.getData("text")); } : undefined}
          className={cn(
            "amount-display tabular min-w-0 text-center",
            amount.minor === 0 ? "is-empty" : TONE_CLASS[tone],
          )}
        >
          <span key={`${amount.currency}:${amount.minor}`} className="amount-tick inline-block max-w-full">{formatMoney(amount)}</span>
        </output>
        {trailing ? <div className="shrink-0">{trailing}</div> : null}
      </div>

      <div className="amount-converted text-center">
        {hint}
      </div>

      {onAmountChange ? (
        <button
          ref={pasteButton}
          data-currency={amount.currency}
          type="button"
          className="text-brand relative mt-1.5 rounded-full px-3 py-1 text-xs font-medium before:absolute before:-inset-y-2 before:inset-x-0 hover:bg-brand-soft"
          onClick={async () => {
            try {
              const text = await navigator.clipboard.readText();
              if (pasteButton.current?.dataset.currency === amount.currency && !pasteButton.current.matches(":disabled")) paste(text);
            } catch {
              setPasteError("Clipboard access is unavailable. Focus the amount and use your device's Paste command.");
            }
          }}
        >
          Paste amount
        </button>
      ) : null}

      {onAmountChange && pasteError ? <p role="alert" className="text-outflow mt-2 text-center text-xs">{pasteError}</p> : null}
    </div>
  );
}

export function AmountKeypad({
  currency,
  raw = "",
  onPress,
}: {
  currency: CurrencyCode;
  raw?: string;
  onPress: (key: KeypadKey) => void;
}) {
  const decimalDisabled = CURRENCY_META[currency].decimals === 0;
  const tripleZeroDisabled = raw.includes(".");
  const bottomKeys = currency === "KHR" ? KHR_BOTTOM_KEYS : USD_BOTTOM_KEYS;

  function renderKey(key: KeypadKey) {
    const disabled =
      (key === "." && decimalDisabled) ||
      (key === "000" && tripleZeroDisabled);
    const isBack = key === "del";

    return (
      <button
        key={key}
        type="button"
        onClick={() => onPress(key)}
        aria-label={isBack ? "Delete last digit" : key}
        disabled={disabled}
        className={cn(
          "key-btn",
          isBack && "is-back text-ink-muted hover:text-ink",
          key === "000" && "text-xl",
          disabled && "opacity-30",
        )}
      >
        {isBack ? <Delete size={22} aria-hidden="true" /> : key}
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2" role="group" aria-label="Amount keypad">
      <div className="grid grid-cols-3 gap-2">
        {TOP_KEYS.map((key) => renderKey(key))}
      </div>
      <div className={cn("grid gap-2", currency === "KHR" ? "grid-cols-4" : "grid-cols-3")}>
        {bottomKeys.map((key) => renderKey(key))}
      </div>
    </div>
  );
}
