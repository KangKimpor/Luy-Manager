---
name: luy-manager-project
description: Working in the Luy Manager codebase, a Cambodia-focused dual-currency personal finance app on Next.js and Supabase. Covers the layer boundaries, the migration and RLS workflow, the server action pattern, the design token system, the CI gates, and the traps that have already caused bugs here. Use when adding a feature, page, table or migration to this repository, when a check in CI fails, when touching money or currency display, or when deciding which layer new code belongs in.
---

# Luy Manager

A personal finance app for Cambodia, where people hold and spend US dollars and
Khmer riel side by side, often within a single purchase. That one fact drives most
of the architecture: every amount carries a currency, most totals are only
meaningful once converted, and the conversion rate is itself a fact that can go
stale and quietly falsify every figure on the screen.

Read `docs/Cambodia_Personal_Finance_App_PRD.md` for what the product is meant to
be. This file is about how the code is built and what will bite you.

## Read the Next.js docs in node_modules first

`AGENTS.md` says this and it is not boilerplate. This is **Next 16.2**, and it
differs from what most models have memorised. The docs ship with the dependency:

```sh
ls node_modules/next/dist/docs/01-app
```

The visible consequence: **middleware is called `proxy`.** The file is
`src/proxy.ts` and it exports `proxy`, not `middleware`. Creating
`src/middleware.ts` produces a file that is silently never executed.

## Stack

| | |
| --- | --- |
| Framework | Next 16.2 (App Router, server components by default) |
| React | 19.2 |
| Styling | Tailwind **v4**, configured in CSS via `@theme`, not `tailwind.config.js` |
| Backend | Supabase (Postgres 17, RLS, PostgREST) |
| Validation | Zod 4 |
| Tests | Vitest 4, two projects (node and jsdom) |
| Charts | Recharts 3 |
| Icons | `lucide-react` (**not** Material Symbols, whatever a design mockup uses) |

## Layers, and what each is allowed to do

```
src/lib/money/     pure arithmetic. No I/O, no React, no Supabase.
src/lib/domain/    pure business rules. Builds rows, never writes them.
src/lib/data/      reads. Returns domain types, falls back to demo data.
src/app/actions/   writes. Auth, validation, revalidation.
src/app/           server components that compose the above.
src/components/    presentation. No money arithmetic.
```

The rule that keeps this honest: **money and domain stay pure, so they are
exhaustively testable without a database.** Every test in `src/lib/money` and
`src/lib/domain` runs in milliseconds with no fixtures. If you find yourself
wanting a Supabase client in either, the logic belongs in `data` or `actions`.

Presentation does no arithmetic. A component that divides an amount is a bug
waiting to be found by the money scanner.

## Money

Read `.claude/skills/luy-manager-money/SKILL.md` before touching an amount. The
short version, because these are the mistakes that recur:

- Amounts are **integer minor units** plus a currency: `{ minor, currency }`.
  US cents for USD, whole riel for KHR.
- **KHR has zero decimals.** `12,000៛` is `12000` minor units, not `1200000`.
  Getting this wrong inflates riel by 100x.
- Build money with `money()` or `fromMajor()`, never an object literal. The
  constructor validates the integer and collapses negative zero.
- Never sum across currencies. Convert first with `convert()` or
  `totalInBaseCurrency()`, and say in the UI that the figure is converted.
- Expenses are stored negative, income positive, so `SUM()` over any slice is
  correct without inspecting a type column.
- Charts need literal colours, so they read them from `src/lib/theme.ts`. Do not
  inline hex in a component.

## Database

Migrations live in `supabase/migrations/`, currently `0001` through `0009`.

**Never edit an applied migration.** CI replays every migration from an empty
database, so an edit looks fine there while the deployed database keeps the old
shape. Add a new numbered file instead.

Two things about the hosted project that will confuse you:

1. Its migration history is recorded with **timestamped versions and snake_case
   names** (`20260731145601 phase1_core`), not the `0001_...` filenames, because
   they were applied through the Supabase MCP server rather than the CLI. The
   contents match; the labels do not.
2. There is no Supabase CLI in this sandbox. Apply DDL with the MCP
   `apply_migration` tool and write the same SQL to a numbered file so CI and the
   hosted project agree.

### The triggers will reject your writes

These exist because the application cannot be trusted to remember, and they fail
loudly rather than corrupting the ledger. Know them before debugging an insert:

| Guard | Refuses |
| --- | --- |
| `transactions_currency_matches_account` | A transaction whose currency differs from its account's. An account is single-currency |
| `transactions_transfer_group_balanced` | A transfer group without exactly two active legs, one negative and one positive, on two different accounts. Deferred to COMMIT |
| `transactions_expense_is_negative` | A positive expense |
| `transactions_base_fields_together` | A partial conversion record |

The currency one is the most common surprise: **a KHR amount cannot be posted to a
USD account.** The account is chosen by the currency, not by preference.

### RLS is the access boundary, except where it is absent

Every table has RLS keyed on `(select auth.uid())`. The subquery form is
deliberate: bare `auth.uid()` is re-evaluated per row, and CI fails if you
reintroduce it.

**A webhook has no session, so RLS is not weakened but absent.** In
`src/app/api/*/webhook/` and anything using `createAdminClient()`, a forgotten
`user_id` filter fails *open*. See
`.claude/skills/luy-manager-telegram/SKILL.md`.

## Server actions follow one shape

Three steps, in order, every time. From `src/app/actions/transactions.ts`:

```ts
export async function createTransaction(input: CreateTransactionInput) {
  const userId = await requireUserId();              // 1. who is calling
  const parsed = transactionInputSchema.safeParse(input);
  const account = await loadAccount(parsed.data.accountId); // 2. re-read the row
  // ... build and insert, taking currency from the ACCOUNT, not the request
  revalidateLedger();                                 // 3. refresh what changed
}
```

1. **Establish the caller.** A server action is reachable by direct POST, so the
   UI having rendered a form proves nothing.
2. **Re-read from the database rather than trusting the request.** The currency
   comes from the account row, because the trigger above compares against the row
   and not against what the client claimed.
3. **Revalidate every page whose figures moved.** `revalidateLedger()` exists so
   nobody has to remember the list.

Return `ActionResult<T>`, a discriminated union. Do not throw across the boundary.

## Demo mode is a supported state

With no Supabase configured, `isDemoMode()` is true, `dataContext()` returns null,
and the data layer serves `src/lib/demo-data.ts`. This is what makes
`npm run dev` work on a fresh clone, and it is why:

- Every data function needs a demo fallback.
- `proxy.ts` skips the auth redirect entirely when Supabase is unconfigured.
- Write paths return "Connect Supabase to save..." rather than crashing.

It is also the fastest way to render the UI locally. Build with the Supabase
variables set to empty strings and the whole app renders against sample data.

## Design system

Tokens are defined once in `src/app/globals.css` under `@theme`. Use the semantic
names (`bg-surface`, `text-ink-muted`, `text-inflow`, `bg-brand-soft`) and never a
raw hex in a component. Recharts and inline SVG are the only exceptions, and they
read `CHART_COLORS` from `src/lib/theme.ts`.

The type scale has dedicated money steps: `text-numeric-md`, `text-numeric-lg`,
`text-display-hero`. Amount columns get `tabular` so decimal points align.

### Font traps, all three of which have already shipped bugs

1. **`--font-sans` must be set explicitly.** Without it Tailwind's default system
   stack wins and the Inter file loads on every page and is never used.
2. **`៛` (U+17DB) is not in Inter's latin subset.** Noto Sans Khmer is loaded
   second in the stack purely to provide it. Without that, every riel amount
   renders as a tofu box on any device lacking a Khmer font.
3. **`≈`, `←` and `→` are in no subset this app ships.** They rendered as tofu.
   Use `~`, and lucide `ChevronLeft`/`ChevronRight` for arrows. Before adding any
   non-ASCII character to UI text, check it against the shipped
   `unicode-range` declarations.

### Other layout facts

- One `h1` per screen, rendered by `SiteHeader` from the route. Pages must not
  repeat the title; they render only the subtitle the bar cannot express.
- Bottom nav labels are **10px**, not the 12px `label-caps` step. Five labels plus
  the centre action do not fit across a 390px phone at 12px.
- Progress tracks use `bg-surface-variant`. The page colour is nearly white, so
  `surface-muted` is invisible on a card.

## Tests

`vitest.config.mts` defines two projects, split by extension:

- `*.test.ts` runs in **node**. Logic, money, domain, parsers.
- `*.test.tsx` runs in **jsdom**. Component rendering.

The split is deliberate: pure logic in node is faster and would let an accidental
dependency on a browser global pass unnoticed under jsdom.

Run one file: `npx vitest --run --project logic path/to/file.test.ts`

Test the invariants, not the implementation. For money that means splits summing
to the original, conversions crossing the scale gap, and symmetric rounding.

## CI gates

`.github/workflows/ci.yml` runs two jobs. Reproduce all of it locally before
pushing:

```sh
npm run typecheck
npm run lint
npm test
node .claude/skills/luy-manager-money/scripts/check-money-safety.mjs src supabase
npm run build
```

The money scanner **baseline is 7 findings: 0 high, 1 medium, 6 low.** Exit code
is 0 unless something high appears, so compare the count. If you added one, fix it
rather than accepting a new baseline. The usual cause is arithmetic on `.minor`
inside JSX; resolve a share to a plain ratio first, the way `CategoryTotal.share`
does.

The second job replays every migration into a real Postgres from empty, then
asserts RLS is on every table and that no policy calls `auth.uid()` per row.

## Verification in this sandbox

Two constraints that will waste time otherwise:

- **A server cannot survive between tool calls.** Each command gets its own PID
  namespace with `--die-with-parent`. Start the server, exercise it, and kill it
  **inside one command**.
- **The Playwright MCP browser blocks `file://`.** To see a screen, build in demo
  mode, `curl` the pages, mirror the CSS chunk (under `chunks/`, not `css/`, in
  Next 16) and the fonts it references as relative `../media/`, then screenshot
  with `/usr/local/bin/chrome --headless=new --no-sandbox`.

For the app itself, `npm run connect:check` probes the live project and confirms
the anon key cannot read anyone's ledger.

## Writing conventions

- **Comments explain why, not what.** The codebase is dense with rationale
  because most of its decisions look arbitrary until you know the failure they
  prevent. Match that. A comment restating the code is noise; one naming the bug
  it avoids is the most valuable line in the file.
- **Never use em dashes or en dashes** in code, comments, UI strings, commit
  messages, docs or PR descriptions. Use a colon, comma, period or parentheses.
- Prose in UI copy, not jargon. "Rate is 6 days old, totals may be inaccurate"
  beats "stale FX".

## Procedure

**Adding a feature**

1. Decide the layer. Pure rules go in `domain` with tests before any UI.
2. Read paths go in `data` with a demo fallback. Writes go in `actions`.
3. Compose in a server component. Add a client component only for interactivity.
4. Run the five CI checks.

**Adding a table**

1. Write the SQL to the next numbered file in `supabase/migrations/`.
2. Enable RLS and add policies using `(select auth.uid())`.
3. Apply it with the MCP `apply_migration` tool.
4. Run `get_advisors` for security and performance and act on the findings.
5. Add a mapper in `src/lib/data/mappers.ts` and a domain type.

**Changing the design**

1. Change the token in `globals.css`, not the component.
2. Grep for hardcoded hex that the change strands.
3. Screenshot at 390px before claiming it works.

## Anti-patterns

| Do not | Because |
| --- | --- |
| Create `src/middleware.ts` | This Next version calls it `proxy` and will ignore the file |
| Edit an applied migration | CI replays from empty and passes while production drifts |
| Post a KHR amount to a USD account | The currency trigger rejects it |
| Query without `user_id` in a webhook | RLS is absent there and it fails open |
| Trust a currency from the request | Read it from the account row |
| Hardcode a hex colour in a component | Strands on the next token change |
| Add a non-ASCII glyph to UI text unchecked | `៛`, `≈` and arrows have all rendered as tofu |
| Repeat the screen title in the page | `SiteHeader` already renders the `h1` |
| Do money arithmetic in JSX | Trips the scanner, and hides rounding |
| Skip the demo fallback in a data function | Breaks `npm run dev` on a fresh clone |
| Add a UI control for an unimplemented feature | A button that does nothing is worse than a gap |
| Assume a chart is broken from a static capture | Recharts mounts on the client |
