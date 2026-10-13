# Exact bank riel: migration 0014

Prepared locally on 2026-10-13. The hosted database has not been changed.

Bank KHR now uses integer hundredths of a riel. `9,993.55៛` is stored as `999355`,
without rounding or a floating-point parsing step. USD still uses cents.
Whole-riel display remains familiar: `1200000` minor units displays as `12,000៛`.
The physical cash suggestion remains a 100-riel step and is never applied to a
bank entry automatically.

## Existing values stay the same

[0014_fractional_riel.sql](../supabase/migrations/0014_fractional_riel.sql) rescales
only KHR amounts. Legacy `12000` becomes `1200000`; both represent `12,000៛`.
Rates are major-unit ratios and remain unchanged. Owners, account ids, dates,
notes, deleted rows, transfer groups and historical USD conversion amounts stay
intact. The existing audit triggers record the unit transition; older audit row
images retain their original whole-riel representation.

Nine amount fields are covered: account opening balances, transaction native and
base amounts, tenders, splits, budget limits, savings targets, recurring amounts,
and large-transaction notification thresholds. Derived balances follow the same
view. Old Telegram previews are consumed because their serialized amounts use
the previous units; users resend those entries.

The migration aborts and rolls back if rescaling would exceed JavaScript's safe
integer range, and refuses to run twice. The read-only precision marker is a
security-invoker function with a fixed search path. Only authenticated and
service-role clients may call it, following the
[Supabase function security guidance](https://supabase.com/docs/guides/database/functions).
All existing RLS policies remain in place.

The application and bot check this marker before accessing money. Against an
unmigrated database they refuse the operation with a migration message, rather
than displaying or saving a value using the wrong scale. Checks are shared per
client; ledger data is never cached across users.

## Verification

The SQL fixtures in `supabase/tests/fractional_riel_before.sql` and
`fractional_riel_after.sql` run around migration 0014 in the real-Postgres CI job.
Local replay also checks unsafe-value rollback, repeat refusal, owner isolation,
anonymous reads and function privileges.

```powershell
npm install --prefix .tmp/pg-check --no-save @electric-sql/pglite@0.3.14
node scripts/verify-fractional-riel.mjs
```

This optional test runtime adds no dependency to the app or its browser bundle.
PGlite is in-process Postgres, and lacks the `pgcrypto` extension used by the CI
bootstrap. The local harness omits only that extension declaration; core
`gen_random_uuid()` and every migration statement are exercised. Hosted Supabase
advisors have not been run because no hosted migration is authorized yet.

## Owner review before a live change

1. Back up the database and verify the backup can be restored.
2. Put the existing web app and bot writes into maintenance together. Old server
   code must never write whole-riel amounts into the converted database.
3. Apply migration 0014 once, in one transaction, through the approved migration
   workflow. Confirm the hosted project has the same first 13 migrations; its
   existing history may use timestamped labels.
4. Deploy this matching application version while maintenance is still active.
5. Verify precision version 2, a copied bank balance and a fractional test entry
   in a staging account. Run Supabase security and performance advisors.
6. Ask users to reload open tabs and installed PWAs, then resume writes.

Rollback needs the paired application and database backup. After fractional
entries exist, dividing amounts into legacy whole riel would lose their decimals.
Do not deploy the old application against version 2 or rescale live data by hand.
