# Money code review checklist

Work top to bottom. Ordered by how much damage each failure causes and how
quietly it does it.

## 1. Storage

- [ ] No `FLOAT`, `DOUBLE`, `REAL` or `MONEY` column holds an amount.
      `BIGINT` minor units, or `NUMERIC(19,4)` read through a decimal library.
- [ ] Every amount column has a currency column beside it, or the currency is
      fixed by an unambiguous parent row.
- [ ] Currency is a constrained type (enum, check constraint, FK) not free text.
      Free text admits `usd`, `USD `, `Usd`, and `$`.
- [ ] Amounts are documented as minor units at the column or type. Someone will
      otherwise assume dollars.
- [ ] Sign convention is stated and enforced by a check constraint.
- [ ] Any stored conversion keeps rate, converted amount, and target currency
      together, with a constraint making them all-or-nothing.

## 2. Arithmetic

- [ ] No `parseFloat` or `Number()` producing a value used in money maths.
- [ ] No `toFixed()` whose result is parsed back into a number.
- [ ] Addition and subtraction reject mismatched currencies rather than
      converting.
- [ ] Rounding is half away from zero, not bare `Math.round`.
- [ ] Multiplication by a rate or percentage rounds explicitly, not implicitly
      via a later cast.
- [ ] Integer overflow is considered. `Number.MAX_SAFE_INTEGER` minor units is
      about 90 trillion dollars — fine for consumer apps, not for some
      high-inflation currencies over long horizons.
- [ ] `-0` cannot escape the constructor.

## 3. Division and splits

- [ ] Splits are asserted to sum to the original, in a test.
- [ ] The remainder distribution rule is deliberate and documented, not an
      accident of floor division.
- [ ] Negative amounts (refunds) split with the sign preserved on every part.
- [ ] Percentage allocations use largest-remainder, not independent rounding of
      each share. Independent rounding does not sum to 100%.

## 4. Conversion

- [ ] Conversion crosses the minor-unit scale gap between source and target.
      **Test with a zero-decimal currency**, where the bug is a visible 100x.
- [ ] Rates accept either quote direction.
- [ ] The rate applied is persisted with the transaction.
- [ ] Historical lookup takes the most recent rate **on or before** the date.
- [ ] A missing rate is an error or an explicit recorded fallback, never a
      silent `1.0`.
- [ ] Round-tripping A to B to A is asserted to land within one minor unit.

## 5. Aggregation

- [ ] No `SUM()` spans multiple currencies without conversion.
- [ ] Transfers between own accounts are excluded from income and expense
      totals.
- [ ] Balances are derived from the ledger, or if cached, there is a
      reconciliation job and a test proving cache and ledger agree.
- [ ] Soft-deleted rows are excluded from every total. Check each index and
      view separately; this is easy to get right in one query and wrong in the
      next.
- [ ] Date bucketing uses the user's timezone, not UTC. In UTC+7, using
      `toISOString()` puts early-morning transactions on the previous day.

## 6. Display

- [ ] Decimal places come from currency metadata, never hardcoded to 2.
- [ ] Symbol position comes from metadata. `12,000៛` not `៛12,000`.
- [ ] Minus sits outside the symbol: `-$5.50`.
- [ ] Amounts are shown in the currency transacted, not silently converted.
- [ ] Tabular figures in any column of amounts.
- [ ] Zero renders as `$0.00`, never `-$0.00`.
- [ ] Input accepts the separators users actually type: `1,234.56`, `1 234`,
      `$5`, `12000៛`.

## 7. Input handling

- [ ] A decimal point is rejected or ignored for zero-decimal currencies.
- [ ] More decimals than the currency supports are rejected or explicitly
      rounded, not silently truncated.
- [ ] Empty, `-`, `.`, and non-numeric input produce a clear error.
- [ ] Very large input is bounded before it reaches the integer constructor.

## 8. Tests

- [ ] `0.1 + 0.2` asserted exact.
- [ ] A loop of many small additions asserted exact.
- [ ] Currency mismatch asserted to throw.
- [ ] Zero-decimal currency scale asserted.
- [ ] Negative rounding asserted symmetric.
- [ ] Split totals asserted for both even and weighted cases.
- [ ] Conversion scale gap asserted with a real figure.
- [ ] Historical rate stability asserted: add a newer rate, confirm an old
      converted value does not move.
- [ ] Empty collections asserted to produce zero, not `NaN` or `-0`.

## Fast grep pass

```bash
grep -rn "parseFloat\|toFixed\|Math.round" --include=*.ts --include=*.tsx src/
grep -rniE "(float|double|real)" --include=*.sql .
grep -rn "amount.*number\|price.*number" --include=*.ts src/
```

Or run the bundled script, which encodes all of the above:

```bash
node scripts/check-money-safety.mjs src/
```
