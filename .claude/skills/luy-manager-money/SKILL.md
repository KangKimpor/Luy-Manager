---
name: luy-manager-money
description: Implements and reviews money handling in application code using integer minor units, correct rounding, exact splits, and historical exchange rates. Use when writing or reviewing code that stores, sums, converts, splits, or displays monetary amounts, when adding a second currency to an app, when handling zero-decimal currencies such as KHR or JPY, or when a ledger, invoice, or balance total does not reconcile.
---

# Multi-currency money handling

Money bugs do not announce themselves. They surface weeks later as a balance
that is three cents off, a report that changes when nobody edited it, or a
split invoice that bills $9.99 of a $10.00 charge. Every rule below exists
because the obvious alternative fails silently.

## The one rule that matters

**Store every amount as an integer count of minor units. Never a float.**

`0.1 + 0.2 !== 0.3` in IEEE-754. That error compounds per operation, and a
ledger that drifts cannot be reconciled.

```ts
// WRONG - drifts
let total = 0;
for (const item of items) total += item.price; // 0.1, 0.2, 0.3...

// RIGHT - exact
let totalMinor = 0;
for (const item of items) totalMinor += item.priceMinor; // 10, 20, 30...
```

Minor units: US cents for USD, whole riel for KHR, whole yen for JPY.
Convert to a decimal string **only at the display boundary**. Never parse it
back for arithmetic.

Database column: `BIGINT`. Not `FLOAT`, not `DOUBLE`, not `MONEY`.
`NUMERIC(19,4)` is defensible if the language lacks integer safety, but then
every read must go through a decimal library, never a native float.

## Pair every amount with its currency

A bare number is not an amount. `1000` is $10.00 or 1,000៛ depending on
context, and context gets lost.

```ts
interface Money {
  readonly minor: number;      // integer, signed
  readonly currency: CurrencyCode;
}
```

**Make mixing currencies throw, not convert.** An implicit conversion hides a
missing exchange rate until it reaches a customer.

```ts
function add(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new MoneyError(
      `Cannot add ${a.currency} and ${b.currency}. Convert to a common currency first.`,
    );
  }
  return money(a.minor + b.minor, a.currency);
}
```

## Not every currency has two decimals

Assuming two decimals everywhere is the second most common money bug. KHR,
JPY, KRW and VND have zero. Some have three.

Store decimals per currency and derive the scale:

```ts
const CURRENCY_META = {
  USD: { decimals: 2, cashStep: 1 },     // 1 cent
  KHR: { decimals: 0, cashStep: 100 },   // no subunit; 100៛ is smallest note
  JPY: { decimals: 0, cashStep: 1 },
};

const scale = (c: CurrencyCode) => 10 ** CURRENCY_META[c].decimals;
```

So 12,000៛ is `12000` minor units, not `1200000`. Getting this wrong inflates
riel balances by 100x — large enough to be caught, unlike most money bugs.

`cashStep` is separate from `decimals`: it is the smallest denomination that
physically circulates. Cambodian merchants cannot make change below 100៛, so a
converted riel figure presented as cash should round to that step. See
`references/currency-data.md`.

## Round half away from zero, not Math.round

`Math.round` is asymmetric on negatives: `Math.round(-2.5)` is `-2` but
`Math.round(2.5)` is `3`. In a system with refunds, that biases every rounded
refund in the house's favour. It is a real accounting defect.

```ts
// RIGHT - symmetric
const rounded = Math.sign(scaled) * Math.round(Math.abs(scaled));
```

Apply this in every place a fractional minor unit can appear: constructing
from a decimal, multiplying by a rate, multiplying by a percentage.

## Splits must sum to the original

$10.00 into 3 is not 3 × $3.33. That loses a cent, and the loss has to land
somewhere explicit.

Distribute the remainder one minor unit at a time:

```ts
function splitEvenly(m: Money, parts: number): Money[] {
  const sign = m.minor < 0 ? -1 : 1;
  const magnitude = Math.abs(m.minor);
  const base = Math.floor(magnitude / parts);
  const remainder = magnitude - base * parts;

  return Array.from({ length: parts }, (_, i) =>
    money(sign * (base + (i < remainder ? 1 : 0)), m.currency),
  );
}
// $10.00 / 3 -> [334, 333, 333], sums to exactly 1000
```

For weighted splits use largest-remainder: give leftover units to the parts
with the biggest fractional claim, not always to the first.

**Always assert the invariant in a test:** `sum(parts) === original`.

## Exchange rates

Store one canonical direction per pair. Storing both invites the two from
disagreeing about the same moment.

```ts
interface ExchangeRate {
  rate: number;            // how many `quote` per one `base`, in MAJOR units
  base: CurrencyCode;
  quote: CurrencyCode;
  asOf: Date;
}
```

Conversion must cross the minor-unit scale gap. This is the step people skip:

```ts
function convert(amount: Money, to: CurrencyCode, rate: ExchangeRate): Money {
  if (amount.currency === to) return amount;

  const multiplier = resolveMultiplier(amount.currency, to, rate);
  const target = (amount.minor / scale(amount.currency)) * multiplier * scale(to);

  return money(Math.sign(target) * Math.round(Math.abs(target)), to);
}
// $3.00 (300 minor) at 4100 KHR/USD -> 12300 minor = 12,300៛
// Multiplying 300 x 4100 directly gives 1,230,000. Wrong by 100x.
```

Accept a rate quoted in **either** direction so callers need not know how the
stored row happens to be oriented.

### Persist the rate you applied

A converted amount must record the rate used and the resulting base-currency
figure, alongside the native amount:

```
amount, currency, exchange_rate, base_amount, base_currency
```

Recomputing at read time means last month's report silently changes when
today's rate moves. Users notice, and it destroys trust in every other number.

Add a constraint so the conversion fields are all-or-nothing — a partial set is
not reproducible.

### Look rates up historically

Fetch the most recent rate **on or before** the transaction date, not the
newest one. A settled figure must stay settled.

## Signed amounts beat a direction flag

Store outflows negative and inflows positive. Then `SUM()` over any slice of
the ledger is immediately correct without inspecting a type column.

```ts
// Users type "5" for a $5 expense, not "-5". Apply the sign once, centrally.
function signedAmount(type: TxType, amount: Money): Money {
  if (type === "expense") return negate(absolute(amount));
  if (type === "income" || type === "refund") return absolute(amount);
  return amount; // transfers and adjustments carry the caller's sign
}
```

Enforce it in the database too:

```sql
constraint expense_is_negative check (type <> 'expense' or amount <= 0)
```

## Guard against negative zero

Negating or scaling zero yields `-0`, which passes most arithmetic unnoticed
and then leaks: it fails `Object.is(-0, 0)`, and a formatter testing the sign
bit renders `-$0.00`. Collapse it in the constructor:

```ts
return { minor: minor === 0 ? 0 : minor, currency };
```

This is a real bug found by a test asserting a zero liability, not a
hypothetical.

## Cross-currency transfers need two rows

One row cannot express "$100 left the USD account and 410,000៛ arrived in the
KHR account" — the two sides differ in amount and currency. Use two rows
sharing a `transfer_group_id`, one negative leg and one positive.

Let the caller supply the amount actually received. The rate a bank really
applied is rarely the rate in your table, and the user's figure is the truth.

## Exclude transfers from income and expense

Both legs net to roughly zero, so counting them inflates both totals with
money that never entered or left the user's control. Filter them out of cash
flow and category aggregates.

## Display

- Symbol position varies: `$5.25` but `12,000៛`. Store `symbolLeading` per
  currency.
- Put the minus outside the symbol: `-$5.50`, not `$-5.50`.
- Use `toLocaleString` with `minimumFractionDigits === maximumFractionDigits === decimals`
  so USD always shows two places and KHR none.
- Use tabular figures (`font-variant-numeric: tabular-nums`) in any column of
  amounts, so decimal points align.
- Show amounts in the currency actually transacted, not only the base
  currency. Someone who handed over 20,000៛ needs to recognise that figure;
  showing only $4.88 makes the row impossible to match against memory.

## Procedure

**Writing new money code**

1. Define `CurrencyCode` as a closed union or enum. Never accept free-text.
2. Build the `Money` type and a validating constructor that rejects
   non-integers, unsafe integers, unknown currencies, and collapses `-0`.
3. Add arithmetic that throws on currency mismatch.
4. Add conversion that crosses the scale gap and records the rate applied.
5. Write tests for the invariants below **before** building UI on top.
6. Run `scripts/check-money-safety.mjs` over the codebase.

**Reviewing existing money code**

Work through `references/review-checklist.md`. Start by grepping for
`parseFloat`, `toFixed`, `Number(`, and float columns in migrations.

## Tests to write every time

These catch the failures that matter. Omitting them means the bug ships.

```ts
// Float safety
add(fromMajor(0.1, "USD"), fromMajor(0.2, "USD")).minor === 30;

// 1000 additions of one cent stay exact
// Mixing currencies throws
expect(() => add(usd, khr)).toThrow();

// Zero-decimal scale
fromMajor(12000, "KHR").minor === 12000;

// Symmetric rounding
fromMajor(-2.005, "USD").minor === -201;

// Splits preserve the total
sum(splitEvenly(fromMajor(10, "USD"), 3)) === fromMajor(10, "USD");

// Scale gap on conversion
convert(fromMajor(3, "USD"), "KHR", rate4100).minor === 12300;

// Historical stability: a settled row does not move when a newer rate lands
// Negative zero
negate(zero("USD")).minor === 0; // not -0

// Round trip within one minor unit
```

## Reference files

- `references/currency-data.md` — zero-decimal and three-decimal currency
  lists, cash steps, KHR/USD specifics for Cambodia.
- `references/review-checklist.md` — line-by-line audit checklist.
- `scripts/check-money-safety.mjs` — flags float-money antipatterns.
  Run: `node scripts/check-money-safety.mjs <dir>`

## Anti-patterns

| Do not | Because |
| --- | --- |
| `parseFloat(amount)` | Reintroduces binary float error |
| `amount.toFixed(2)` then parse back | Round-trips through a lossy string |
| `FLOAT`/`DOUBLE` money columns | Same drift, now persisted |
| `Math.round(x)` on money | Asymmetric on negatives, biases refunds |
| Assume 2 decimals | Breaks KHR, JPY, KRW, VND |
| Convert on read | Historical reports change retroactively |
| Store both rate directions | They drift out of sync |
| `amount / n` for splits | Loses or invents minor units |
| Bare `number` for money | Currency gets lost; units ambiguous |
| Sum across currencies | Produces a meaningless number |
