# Codebase map

Where things live and, more usefully, where a given change belongs. Generated
against the tree, so if a file below is missing the map is stale.

## Deciding where new code goes

Ask what the code needs, in this order. The first honest answer is the layer.

| It needs | Layer | Directory |
| --- | --- | --- |
| Only numbers and a currency | money | `src/lib/money/` |
| Only domain rules and types | domain | `src/lib/domain/` |
| To read from the database | data | `src/lib/data/` |
| To write, with auth | actions | `src/app/actions/` |
| To render | app / components | `src/app/`, `src/components/` |

If the answer is "a Supabase client" and you are in `money` or `domain`, the logic
is in the wrong layer. Those two stay pure so their tests need no fixtures.

## `src/lib/money/` pure arithmetic

| File | Holds |
| --- | --- |
| `money.ts` | The `Money` type, constructor, arithmetic, splits, `formatMoney`, `roundToCashStep` |
| `currency.ts` | `CURRENCIES`, per-currency metadata: symbol, position, decimals, `cashStep` |
| `exchange.ts` | `ExchangeRate`, `convert`, `totalInBaseCurrency`, `mixedTotal`, `effectiveRate` |
| `index.ts` | Re-exports all three; import from `@/lib/money` |

No React, no I/O, no Supabase. Ever.

## `src/lib/domain/` business rules

| File | Holds |
| --- | --- |
| `types.ts` | Every domain type: `Account`, `AccountBalance`, `Transaction`, `Budget`, `Profile` |
| `accounts.ts` | `balanceOf`, `summarizeNetWorth`, `ACCOUNT_TYPE_LABELS`, `ACCOUNT_PRESETS` |
| `transactions.ts` | `buildTransaction`, `signedAmount`, `summarizeCashFlow`, `spendingByCategory` |
| `transfers.ts` | `planTransfer`, `transferInserts`, `describeTransfer` |
| `budgets.ts` | Budget periods and progress |

Builds rows; never writes them.

## `src/lib/data/` reads

| File | Holds |
| --- | --- |
| `client.ts` | `dataContext()`, `asRow`/`asRows`, the `*_COLUMNS` select lists |
| `mappers.ts` | `Row` to domain type, one `toX` per table, plus `mapRows` |
| `accounts.ts`, `transactions.ts`, `budgets.ts`, `reference.ts` | Query functions |

Two conventions here:

- **Every function needs a demo fallback.** `dataContext()` returns null when
  Supabase is unconfigured, and the function returns `src/lib/demo-data.ts`.
- **An explicit column list needs `asRows()`.** A `*_COLUMNS` template string is
  something the client's generics cannot narrow, so it types the result as an
  error shape. `asRows` is the cast.

## `src/lib/` cross-cutting

| File | Holds |
| --- | --- |
| `auth.ts` | `getUser`, `requireUserId`, `isDemoMode` |
| `validation.ts` | Every Zod schema, `parseMoney`, `firstIssue` |
| `theme.ts` | `CHART_COLORS`, the escape hatch for consumers that cannot read CSS |
| `period.ts` | Month arithmetic, `monthFromParam`, `shiftMonth`, `trailingMonths` |
| `display-currency.ts` | The display-currency cookie |
| `demo-data.ts` | Sample ledger for demo mode |
| `utils.ts` | `cn()` |

## `src/lib/rates/` exchange rates

| File | Holds |
| --- | --- |
| `provider.ts` | Provider chain with fallback, plausibility bounds, `fetchUsdKhrRate` |
| `repository.ts` | `loadUsdKhrRate`, `RateSnapshot`, freshness, `STALE_AFTER_DAYS` |
| `sync.ts` | `syncUsdKhrRate`, the daily job's logic, writes the audit row |

Freshness is not decoration. A stale rate looks identical to a fresh one once
multiplied into a total, so `RateStrip` surfaces the age.

## `src/lib/supabase/` clients

| File | Use from |
| --- | --- |
| `server.ts` | Server components, actions, route handlers. Cookie-based session |
| `client.ts` | Client components. Anon key |
| `admin.ts` | Service role. **Bypasses RLS.** Never import from a client component |
| `env.ts` | `isSupabaseConfigured`, `requireSupabaseServiceEnv` |

## `src/lib/telegram/` the bot

| File | Holds |
| --- | --- |
| `parse.ts` | Pure rules parser, intents, confidence, `CONFIRM_THRESHOLD` |
| `link.ts` | HMAC deep-link tokens, no storage |
| `client.ts` | Bot API calls, `isFromTelegram`, `escapeHtml` |
| `handle.ts` | Intent to ledger write. Service role, so every query is user-scoped |
| `env.ts` | `isTelegramConfigured`, `botUsername` |

See `.claude/skills/luy-manager-telegram/SKILL.md`.

## `src/app/` routes

| Route | Screen |
| --- | --- |
| `/` | Dashboard: rate strip, net worth, metrics, budget, cash flow, categories |
| `/accounts`, `/accounts/new`, `/accounts/[id]/edit` | Accounts |
| `/transactions`, `/transactions/[id]/edit` | Ledger with filters |
| `/add` | Quick add, transfer, split, mixed-currency tenders |
| `/budgets`, `/budgets/new` | Budgets |
| `/reports` | Twelve months, net worth trend, currency split |
| `/settings` | Currency, rate override, Telegram, sign out |
| `/login` | Passwordless. The only screen with no app bar or bottom nav |
| `/api/rates/refresh` | Daily rate job, guarded by `CRON_SECRET` |
| `/api/telegram/webhook` | Bot, guarded by the Telegram secret header |
| `/auth/callback` | PKCE code exchange |

`src/proxy.ts` is the middleware. Its `PUBLIC_PREFIXES` list is what keeps the two
API routes reachable without a session; forgetting to add a new one turns every
delivery into a redirect to `/login`.

## `src/components/`

**Shell:** `site-header.tsx` (the only `h1`), `bottom-nav.tsx`,
`service-worker.tsx`.

**Money display:** `money-amount.tsx` (`MoneyAmount`, `CurrencyBadge`),
`rate-strip.tsx`, `currency-toggle.tsx`, `month-stepper.tsx`.

**Entry:** `quick-add-form.tsx`, `amount-keypad.tsx`, `transfer-form.tsx`,
`tender-editor.tsx` (the mixed-currency case), `split-editor.tsx`,
`edit-transaction-form.tsx`, `add-entry.tsx`.

**Lists:** `transaction-list.tsx`, `transaction-row.tsx`,
`transaction-filters.tsx`, `account-row-actions.tsx`, `budget-row-actions.tsx`.

**Forms:** `account-form.tsx`, `budget-form.tsx`, `manual-rate-form.tsx`,
`login-form.tsx`.

**Charts:** `dashboard/cash-flow-chart.tsx`, `dashboard/category-breakdown.tsx`,
`dashboard/summary-cards.tsx`, `dashboard/budget-summary-card.tsx`,
`reports/net-worth-trend.tsx`.

**Primitives:** `ui/card.tsx`, `ui/button.tsx`.

Recharts components are client-only, so they render nothing in server HTML. A
chart that looks empty in a static capture is not necessarily broken.

## Tests

Node (`*.test.ts`), pure logic:
`money/money`, `money/exchange`, `domain/accounts`, `domain/budgets`,
`domain/transactions`, `domain/transfers`, `data/mappers`, `rates/provider`,
`telegram/parse`, `telegram/link`, `components/amount-keypad`,
`api/rates/refresh/route`.

jsdom (`*.test.tsx`), rendering:
`components/tender-editor`, `components/transfer-form`.

## Migrations

| File | Adds |
| --- | --- |
| `0001_phase1_core` | Enums, profiles, accounts, categories, merchants, exchange_rates, transactions, tenders, splits, `account_balances`, RLS |
| `0002_seed_defaults` | Default categories and merchant rules on signup, cold-start rate |
| `0003_enforce_account_currency` | The trigger that rejects a currency mismatch |
| `0004_transfer_integrity` | Deferred two-leg transfer check |
| `0005_exchange_rate_sync` | Sync audit table, freshness view, `upsert_global_exchange_rate` |
| `0006_rls_initplan_and_active_accounts` | `(select auth.uid())` rewrite, `counts_toward_net_worth` |
| `0007_phase2_tables` | Budgets, goals, recurring, tags, attachments, settings, notifications, telegram_logs, audit_logs |
| `0008_manual_rate_override` | `upsert_user_exchange_rate`, rate history view |
| `0009_harden_function_exposure` | Revokes EXECUTE on internal SECURITY DEFINER helpers, pins search_path |

## Skills

| Skill | Read when |
| --- | --- |
| `luy-manager-project` | Working anywhere in this repository |
| `luy-manager-money` | Touching an amount, currency, split or rate |
| `luy-manager-telegram` | Touching the bot or any webhook |
| `multi-currency-money` | Nothing. See below |

`multi-currency-money/` is a byte-for-byte copy of `luy-manager-money/` except for
the `name` in its frontmatter, and both were added in the same commit. CI and the
README reference only `luy-manager-money`, so this is almost certainly a leftover
from renaming the skill. Verified by checksum, not assumed. Edit one and the other
silently disagrees, so if you touch the money skill, either update both or delete
this copy.
