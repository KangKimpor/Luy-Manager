# Currency reference data

Load this when you need exact decimal places for a currency, or when working on
a Cambodian USD/KHR product.

## Minor unit exponents

The authority is [ISO 4217](https://www.iso.org/iso-4217-currency-codes.html).
Do not guess; a wrong exponent is a 10x or 100x error in stored balances.

### Zero decimals (no subunit in practice)

`BIF` `CLP` `DJF` `GNF` `ISK` `JPY` `KMF` `KRW` `PYG` `RWF` `UGX` `UYI` `VND`
`VUV` `XAF` `XOF` `XPF`

**`KHR` (Cambodian riel) is the case this skill was written around.** The riel
has a nominal 1/100 subunit (the sen) that has not circulated for decades.
Treat KHR as zero-decimal.

### Three decimals

`BHD` `IQD` `JOD` `KWD` `LYD` `OMR` `TND`

These break code that hardcodes either 0 or 2. If your product might reach the
Gulf, make the exponent data-driven from the start.

### Two decimals

Everything else in common use, including `USD` `EUR` `GBP` `THB` `PHP` `MYR`
`SGD` `CNY` `IDR`.

Note `IDR` is formally two-decimal but sen are not used in practice. If your
domain is retail Indonesia, zero-decimal display may be more honest — but keep
storage at the ISO exponent so the data stays portable.

## Cash step: what physically circulates

Distinct from decimal places. A currency can be two-decimal while its smallest
circulating coin is much larger, which matters when quoting a cash total.

| Currency | Minor unit | Smallest circulating | Cash step (minor units) |
| --- | --- | --- | --- |
| USD (in Cambodia) | cent | see note below | 1 for card, 100 for cash |
| KHR | riel | 100៛ note | 100 |
| JPY | yen | ¥1 coin | 1 |
| CHF | rappen | 5 rappen | 5 |

Round to the cash step **only for presentation of a cash figure**. Never round
the stored ledger amount — that is a real value change, and it must be recorded
as its own rounding adjustment line if it happens.

## Cambodia: USD and KHR together

Practical facts that shape the domain model:

- **Both currencies are everyday legal tender.** Prices are commonly quoted in
  USD; change frequently comes back in KHR. This is not an edge case, it is the
  default.
- **The riel is managed in a narrow band** around 4,000–4,100 to the dollar.
  A static fallback near 4,100 is a safe cold-start value, but must be
  overridable — money changers and banks each apply their own.
- **US coins do not circulate.** Sub-dollar change is given in riel. A
  merchant settling $3.60 typically takes $3 and 2,400៛ or similar.
- **One payment, two currencies is routine.** Model it as a single transaction
  with multiple tender rows, not as two transactions. Splitting it double-counts
  the purchase in category totals.
- **Common rounding convention:** amounts are commonly rounded to the nearest
  100៛, since that is the smallest note in general circulation.

### Institutions worth having as presets

Banks: ABA, ACLEDA, Canadia, Wing Bank, Chip Mong, Sathapana, Phillip Bank.
E-wallets: Wing, TrueMoney, Pi Pay, eMoney.

Most banks hold **separate USD and KHR accounts** rather than one
multi-currency account. Model an account as single-currency and let a user
create two — it matches how the bank apps present it.

## Rate sources

Options, roughly in order of authority for KHR:

1. **National Bank of Cambodia** publishes an official daily rate. Most
   authoritative, but not a convenient API.
2. **Commercial APIs** (exchangerate.host, openexchangerates, Fixer). Easy, but
   verify KHR coverage — some omit it or update it infrequently.
3. **Manual entry.** For a personal-finance product this is often the most
   accurate, because the rate that matters is the one the user's own bank or
   money changer applied.

Whichever you choose: persist every rate with its `as_of` date and a `source`
marker, and always keep manual entry available as an override. Never let a
failed fetch silently fall back to a stale rate without recording that it did.
