# Luy Manager — Cambodia Personal Finance

A personal finance app built for Cambodia, where USD and KHR are both everyday
currencies. Full product spec in
[`docs/Cambodia_Personal_Finance_App_PRD.md`](docs/Cambodia_Personal_Finance_App_PRD.md).

## Status

Phase 1 complete and most of Phase 2. The app persists to Supabase when
configured and falls back to demo data when it is not, so a fresh clone still
runs with no setup.

| Area | State |
| --- | --- |
| Currency engine (USD/KHR) | Done, 255 tests |
| Database schema + RLS | 9 migrations, all 17 PRD tables, verified against Postgres 16 |
| Authentication | Google OAuth + email magic link, session refresh in `proxy.ts` |
| Accounts | Create, edit, close, reopen, delete — from the institution presets |
| Transactions | Add, edit, soft-delete, restore; filtered and paged ledger |
| Transfers, incl. cross-currency | Done, both legs in one statement |
| Mixed-currency payments | Done — one purchase paid in dollars *and* riel |
| Split transactions | Done, parts always sum to the total |
| Daily exchange rate sync | Done, plus manual per-user overrides and rate history |
| Budgets | Done — per category or one overall cap |
| Reports | Done — 12-month cash flow, category split, net worth trend |
| Offline | Service worker caching the shell only, never ledger data |
| Telegram bot | Phase 2, blocked on PRD decision 6 |
| AI insights, OCR, forecasting | Phase 3 |

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

Tests run as two projects: `logic` (`*.test.ts`, node) and `components`
(`*.test.tsx`, jsdom). Target one with `npx vitest --run --project components`.

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
- **A transfer is two rows**, sharing a `transfer_group_id`, one negative and one
  positive. A single row cannot express "$100 left ABA and 410,000៛ arrived at
  Wing", because the two sides differ in amount *and* currency. Migration `0004`
  enforces exactly two opposite legs on two different accounts, checked at commit
  so both must land together.
- **Transfers are excluded from income and expense.** Both legs net to zero, so
  counting them would inflate both totals with money that never entered or left
  the user's control.
- **A missing rate is never a silent 1.0.** Fetched rates are range-checked, and
  every sync attempt is recorded — including failures and the age of the figure
  still being served.

## Layout

```
src/
  proxy.ts           Session refresh and the coarse signed-in check
  app/
    actions/         Server actions: transactions, accounts, budgets, rates, auth
    api/rates/       Daily exchange rate refresh endpoint
    ...              Routes: dashboard, accounts, add, transactions, budgets,
                     reports, settings, login
  components/        UI, dashboard widgets, shared keypad, forms
  lib/
    money/           Currency, Money arithmetic, exchange rates — pure, no IO
    domain/          Accounts, transactions, transfers, budgets: types + aggregation
    data/            Reads. The snake_case/camelCase boundary lives in mappers.ts
    rates/           Fetching, storing and reading the daily rate — does IO
    supabase/        Browser, server and service-role clients
    auth.ts          getUser / requireUser
    demo-data.ts     Stand-in data when Supabase is not configured
supabase/migrations/ Schema and seed SQL
docs/                PRD
```

Two rules worth knowing before adding a query or a policy, both enforced in CI:

- **Every table in `public` must have RLS enabled.** A table added without it is
  readable by anyone holding the anon key.
- **Policies must call `(select auth.uid())`, not `auth.uid()`.** The bare form is
  re-evaluated once per row; the subquery form is evaluated once per statement.

## Connecting Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Copy `.env.example` to `.env.local` and fill in the URL and anon key.
3. Apply the migrations in order, `0001` through `0009`.
4. Nothing else. The pages read through `src/lib/data/`, which returns your own
   ledger once a session exists and demo data when it does not.

Row Level Security is enabled on every user-facing table and is the actual access
boundary — the anon key grants nothing without a session. Verify the policies
against a real project before putting live data in.

## Daily exchange rate

The published USD/KHR rate is refreshed by `GET /api/rates/refresh`, scheduled in
`vercel.json` for 01:30 UTC (08:30 Phnom Penh). Provider chain, fallback
behaviour and the reasoning behind them are in
[PRD Section 17, decision 5](docs/Cambodia_Personal_Finance_App_PRD.md#17-open-decisions).

The endpoint needs two things and refuses to run without them:

- `CRON_SECRET`, sent as `Authorization: Bearer …` (Vercel Cron does this
  automatically) or `X-Cron-Secret`. Without it configured the route returns 503
  rather than running unauthenticated.
- `SUPABASE_SERVICE_ROLE_KEY`. The published rate is stored with `user_id = null`
  because it is a fact about the world, and no user session can write that row
  under RLS.

Run it by hand against a local server with:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/rates/refresh
```

A non-2xx means the sync failed; the response body names every provider tried and
states which rate users are still being served, and how old it is.

## Claude skill

`.claude/skills/luy-manager-money/` packages the money-handling rules above as
a [Claude Agent Skill](https://claude.com/docs/skills/how-to). Claude Code picks
it up automatically in this repo. It also carries a working scanner:

```bash
node .claude/skills/luy-manager-money/scripts/check-money-safety.mjs src supabase
```

Exits non-zero on a high-confidence finding, so it works as a CI gate.

To use it on claude.ai, zip the skill directory and upload it under
Settings > Capabilities:

```powershell
Compress-Archive -Path .claude/skills/luy-manager-money -DestinationPath dist/luy-manager-money.zip
```

The archive root must be the `luy-manager-money/` directory itself, not its
loose contents.

## Attribution

UI design adapted from [Best-Flutter-UI-Templates](https://github.com/mitesh77/Best-Flutter-UI-Templates)
(MIT). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
