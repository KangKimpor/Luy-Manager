/**
 * Currency definitions for the Cambodian market.
 *
 * PRD Section 7. Only USD and KHR are supported. Both are stored as integer
 * minor units to keep arithmetic exact; see `money.ts` for the rationale.
 */

export const CURRENCIES = ["USD", "KHR"] as const;

export type CurrencyCode = (typeof CURRENCIES)[number];

export interface CurrencyMeta {
  code: CurrencyCode;
  /** Symbol shown in the UI. */
  symbol: string;
  /** Whether the symbol precedes the number in the user's reading order. */
  symbolLeading: boolean;
  /**
   * Decimal places used for display and for the minor-unit scale.
   *
   * KHR is a zero-decimal currency: riel is not subdivided in practice, and the
   * smallest circulating note is 100 riel. Storing it with 2 decimals would
   * invent precision that does not exist and would make round-tripping through
   * exchange rates noisier than it needs to be.
   */
  decimals: number;
  /**
   * Smallest denomination that actually circulates, in minor units.
   *
   * Cambodian merchants cannot make change below 100 KHR, so converted riel
   * amounts are rounded to this step when presented as a cash figure.
   */
  cashStep: number;
}

export const CURRENCY_META: Record<CurrencyCode, CurrencyMeta> = {
  USD: {
    code: "USD",
    symbol: "$",
    symbolLeading: true,
    decimals: 2,
    cashStep: 1,
  },
  KHR: {
    code: "KHR",
    symbol: "៛",
    symbolLeading: false,
    decimals: 0,
    cashStep: 100,
  },
};

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === "string" && CURRENCIES.includes(value as CurrencyCode);
}

/** 10 ** decimals. The factor between major and minor units. */
export function minorUnitScale(currency: CurrencyCode): number {
  return 10 ** CURRENCY_META[currency].decimals;
}
