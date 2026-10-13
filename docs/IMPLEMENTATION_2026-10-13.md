# Luy Manager implementation report

Prepared locally on 2026-10-13. The hosted database, production deployment and
remote Git branch have not been changed. There is one local commit per task.

The user's later instructions override two parts of the attached specification:
Accounts stays in the main mobile navigation and Budgets stays under More;
bank riel must preserve `9,993.55` exactly. The user authorized preparing the
necessary migration and coordinated application changes locally.

## Changes per task

| Task | Result | Commit |
| --- | --- | --- |
| A1 | AppLink uses Next auto prefetch. Explicit full prefetch and the route warming loop were removed. staleTimes and service-worker refresh remain. | e7ed92b |
| A2 | Proxy skips sw.js, manifest and .well-known. Compiled matcher tests retain private/API routes. connect:check warns on an empty JWKS without failing. | d02d5c6 |
| A3 | Range reads request 1,000 rows, discover an effective lower API cap if necessary, then fetch remaining offsets in parallel. Duplicate ids, count drift, malformed rows and incomplete results fail. Aggregations use seven money fields plus an id for integrity checks. Dashboard shares a union window and fetches only five full recent rows. | 436d90f |
| A4 | The same variable Noto Sans Khmer font was subset to U+17DB. The 1,136-byte local file retains a non-empty glyph and weight axis 100 to 900. Inter is unchanged. OFL license and notice included. | b98f968 |
| A5 | Saves read accounts directly rather than scanning account_balances. Independent account/profile/rate prerequisites run together, retaining validation and revalidation. | 49f6fa4 |
| B1 | Telegram accepts grouped or plain fractional KHR and preserves it exactly. Integer hundredths, exact string parsing, edit fields, keypad, exports, demo data and fixtures agree. Migration 0014 rescales existing values; a precision guard refuses legacy databases. USD behavior and bot confirmation/owner rules remain. | eb09e13 |
| B2 | Activity has Daily and Calendar views, whole-month reads, Cambodia day groups, converted month/day totals and native row amounts. Transfers retain both legs and neutral colors. URL filters/search, selected day, month navigation and Back work together. Rows link to edit and offer delete/restore. Recently deleted entries load on demand. | This commit |
| B3 | Reports defaults to a monthly income/expense report with a lazy category donut and ranked links into Activity. The previous report content moved to /reports/overall with header, back navigation and refresh/revalidation support. | 6465dcf |
| B4 | Settings offers cookie-persisted Light, Dark and System, with System as default. Server HTML, metadata, semantic tokens, charts, offline/error surfaces and contrast tests follow the choice. | bcefb5e |
| B5 | Accounts remains directly reachable in the main mobile navigation. Budgets and Reports are each two taps away through More. Desktop keeps all destinations. Navigation tests lock this decision. | f8b4abd |
| B6 | Recent exchange rates and its unused read were removed from Settings. Sync, manual override and stored history remain. | d030f7c |
| B7 | The sidebar blurb was removed, retaining the rest of the sidebar. | c48ab5a |

## First-load JavaScript

Production demo builds of Next 16.2.12, measured by summing gzip bytes for the
firstLoadChunkPaths in .next/diagnostics/route-bundle-stats.json. This is a bundle
comparison, not a measurement of hosted Supabase latency.

| Route | Before gzip bytes | After gzip bytes | Change |
| --- | ---: | ---: | ---: |
| / | 169064 | 168631 | -433 |
| /transactions | 170044 | 169993 | -51 |
| /reports | 168526 | 168083 | -443 |
| /accounts | 171056 | 170628 | -428 |
| /budgets | 168066 | 167635 | -431 |
| /settings | 171153 | 170740 | -413 |
| /more | 167001 | 166570 | -431 |
| /add | 181586 | 181370 | -216 |
| /accounts/new | 172220 | 172076 | -144 |
| /accounts/[id]/edit | 172220 | 172076 | -144 |
| /budgets/new | 170595 | 170140 | -455 |
| /transactions/[id]/edit | 174435 | 174243 | -192 |
| /login | 235628 | 235199 | -429 |
| /_not-found | 167001 | 166570 | -431 |
| /reports/overall (new URL) | n/a | 168105 | n/a |

No existing route grew. Recharts is absent from every first-load chunk list,
including both Reports routes. No app/client dependency was added; dependency
gzip cost is zero. PGlite and font tooling were installed only in scratch space.

The two English-screen fonts load 107208 bytes before and 49568 bytes after:
Inter 48432 plus riel 1136, saving 57640 bytes (53.8%). Other Inter language
subsets remain in build output but are not loaded for this English screen.

## Browser evidence

Chrome, local next start, demo data, cold desktop Home load through a local
request observer: 29 _rsc requests before and 23 after. The after requests all
carried Next's prefetch header, with response bodies from 175 to 2137 bytes.
Auto prefetch still requests visible link metadata/loading shells. These counts
do not mean zero network requests. The full-route warming loop is removed and
there was no periodic re-warm while the page was left open across the 30-second
stale interval. The existing service-worker refresh was retained as requested.

At a 390 by 844 viewport, Home, Activity, Reports, Overall report, Accounts,
Budgets, More, Add and Settings rendered in both themes without horizontal
overflow. Chrome reserved 15 px for its scrollbar on long pages, leaving a
375-px document. Calendar day links were at least 46.42 px wide and 92 px high;
Activity's visible navigation/interaction targets were at least 44 px. Today
was highlighted using the Cambodia date. The riel glyph rendered correctly.

Daily displayed all 28 demo entries for July. Both transfer pairs remained
visible and were excluded from totals. Calendar selection, search and browser
Back retained month/view/day; day rows used the same transaction component.
The donut and overall chart were checked after their lazy imports mounted in
both themes. No browser console errors were observed. Screenshots are saved in
the task's local visualization directory. Physical phone/PWA testing was not run.

## Verification

All required gates passed: typecheck, lint, check:dashes, Vitest, the money scanner
and a production build. Vitest passed 659 tests across 57 files. Scanner baseline remains exactly 6 low findings, zero
medium and zero high. Tests cover exact parsing/display, stored historical
conversion values, split/transfer arithmetic, the Telegram screenshot flow,
forms/exports, range completeness, calendar boundaries and URL/filter behavior.

All 14 migrations were replayed in an isolated PGlite database. The precision
fixtures proved preservation of nine KHR fields and USD values, soft-deleted
rows, transfer pairs, settings thresholds and derived balances. Saving the
9993.55-riel bank expense reduced the balance by exactly 999355 minor units.
The harness also tested unsafe-value rollback, repeat refusal, RLS isolation,
anonymous reads and marker function privileges. Real Postgres fixtures are
wired into CI; the hosted migration and hosted advisors have not been run.

## Limits, decisions and owner steps

The four reference images were not available as image attachments in this
session; their written descriptions were used. Chart legends show six categories
plus Everything else, while the ranked list retains every category. Calendar
figures may truncate on a phone; each date's accessible label and title retains
the full figures, and its transaction list below shows native amounts.

Settings.weekStartsOn is honored; missing settings defaults to Monday. The
existing notes search is retained. Recently deleted is intentionally limited to
50 entries from the shown month and says so. No new indexes, balance-view
rewrite, SQL aggregation, full prefetch loop or client library was added.

The original keypad allowed a decimal key only for USD. It now accepts exact
KHR hundredths, and associated edit/budget/tender fields no longer discard them,
because the later exact-bank requirement expanded the original Telegram-only
scope. See [the migration review and deployment procedure](FRACTIONAL_RIEL_MIGRATION.md).
Do not push/deploy this version independently of the reviewed database change.

Before a live release, the owner must confirm asymmetric Supabase JWT signing
keys and Singapore (ap-southeast-1) to match Vercel sin1. These hosted settings
were not verified in this local task. Migration 0014 needs a verified backup,
coordinated maintenance for web/bot writes, matching application deployment,
staging reconciliation, Supabase advisors and a reload of open PWAs. Old
application code must not run against the rescaled ledger. No new environment
variable is required. Reverting after fractional entries exist requires the
paired backup rather than dividing values and losing their decimals.
