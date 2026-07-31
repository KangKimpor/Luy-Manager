# Riel — Cambodia Personal Finance

A personal finance app built for Cambodia, where USD and KHR are both everyday
currencies. Full product spec in
[`docs/Cambodia_Personal_Finance_App_PRD.md`](docs/Cambodia_Personal_Finance_App_PRD.md).

## Status

Phase 1 foundation. The app runs against demo data; Supabase is scaffolded but
not yet connected.

| Area | State |
| --- | --- |
| Currency engine (USD/KHR) | Done, 93 tests |
| Database schema + RLS | Written, not yet applied to a project |
| Mobile shell, dashboard, quick-add | Rendering from demo data |
| Auth | Not started |
| Telegram bot, budgets, reports | Phase 2 |

## Getting started

```bash
npm install
npm run dev
```

The app runs without any configuration, reading from `src/lib/demo-data.ts`.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm test` | Run tests once |
| `npm run test:watch` | Tests in watch mode |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |

## How money is handled

Every amount is an **integer in minor units** — US cents, whole riel — and never
a float. `0.1 + 0.2 !== 0.3` in IEEE-754, and a ledger that drifts by a cent per
operation cannot be reconciled. Conversion to a decimal string happens only at
the display boundary.

Consequences worth knowing before you touch `src/lib/money/`:

- **KHR is zero-decimal.** Riel is not subdivided in practice, so 12,000៛ is
  `12000` minor units, not `1200000`. USD has two decimals. Any conversion has to
  cross that scale gap.
- **Rounding is half away from zero**, not `Math.round`. `Math.round(-2.5)` is
  `-2`, which biases every rounded refund in the app's favour.
- **Mixing currencies throws.** `add(usd, khr)` is an error, not an implicit
  conversion, so a missing exchange rate surfaces immediately.
- **Splits preserve the total.** `$10.00 / 3` distributes the leftover cent
  rather than losing it.
- **Rates are historical.** A transaction stores the rate applied and the
  resulting base-currency amount, so last month's report does not change when
  today's rate moves.

## Layout

```
src/
  app/               Routes: dashboard, accounts, add, budgets, reports
  components/        UI, dashboard widgets, quick-add keypad
  lib/
    money/           Currency, Money arithmetic, exchange rates
    domain/          Accounts and transactions: types + aggregation
    supabase/        Browser and server clients
    demo-data.ts     Stand-in data until Supabase is connected
supabase/migrations/ Schema and seed SQL
docs/                PRD
```

## Connecting Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Copy `.env.example` to `.env.local` and fill in the URL and anon key.
3. Apply `supabase/migrations/0001_phase1_core.sql`, then `0002_seed_defaults.sql`.
4. Replace the `DEMO_*` imports in the page components with queries. The
   aggregation functions take plain rows, so nothing else changes.

Row Level Security is enabled on every user-facing table and is the actual access
boundary — the anon key grants nothing without a session. Verify the policies
against a real project before putting live data in.

## Attribution

UI design adapted from [Best-Flutter-UI-Templates](https://github.com/mitesh77/Best-Flutter-UI-Templates)
(MIT). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
