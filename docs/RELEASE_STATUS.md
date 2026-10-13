# Fractional riel released

Released on 2026-10-13 at 18:26 Cambodia time. Production is available at
[Luy Manager](https://luy-manager.vercel.app).

- Supabase project `nrxqisihktxborgrpaje` has migration `20261013112541 fractional_riel`.
  `ledger_precision_version()` returns 2. Anonymous callers cannot execute it.
- Vercel project `prj_j1OB0B3BDXYplTJ4HQirePDSMwRG`, team `sb-6cac`, serves
  deployment `dpl_8fj6ucLtYteU41BWy6bhN3zgFgot`, built from
  `b52fba856263ffd05abb8bbcb4374f9304d0945a`.
- All three production aliases were verified on this deployment. Web and bot
  requests were paused together during conversion and then resumed. The webhook
  and login endpoint return HTTP 200. Automatic Git deployments are restored.

## Recovery and reconciliation

The Free plan has no scheduled database backups. A consistent snapshot of all
19 public tables was captured while writes were paused, with no active writers.
It contains 2,499 rows, the audit sequence state and 11 derived account balances.
It is an application-data recovery snapshot for this migration, not a backup of
Supabase Auth, Storage or platform configuration, which this release did not change.

The private snapshot is kept in the ignored local path
`.tmp/release/ledger-maintenance-before-0014.json`. SHA256:
`86824e05a604cce02591e18b11e4916179864919f4ac109798bc429a0ac619b7`.
Keep this file; it contains private ledger data and must not be committed.
The repository's generated-file cleanup does not remove `.tmp/release`.

`.tmp/release/verify-backup.mjs` restored every public row against migrations
0001 through 0013 in isolated Postgres, compared every row and balance, and then
replayed 0014. Live reconciliation passed 1,851 checks: all nine amount fields
have the expected scale, all 912 transactions remain present and every account
balance and transaction count is preserved. A user-scoped live expense of
`9,993.55` KHR changed the balance by exactly `999355` minor units; that test
transaction was rolled back. Owner isolation also passed.

Use the [paired application/database recovery procedure](FRACTIONAL_RIEL_MIGRATION.md).
Never roll the application back alone against precision version 2.

## Checks and remaining limits

Typecheck, lint, dash checks, 659 tests across 57 files, money safety and the
production build passed. The money scanner remains at 6 low findings, zero medium
and zero high. All 14 migrations and repeat/unsafe-value rollback checks passed.
[GitHub CI for the release commit](https://github.com/KangKimpor/Luy-Manager/actions/runs/38383413815)
also passed both jobs.

Supabase advisors ran before and after conversion with the same findings:
the internal rate-sync table has RLS and no client policies; the platform
`rls_auto_enable` function is reported as executable by anon and authenticated;
leaked-password protection is disabled; nine foreign keys lack covering indexes
and sixteen indexes are currently unused. These pre-existing settings were not
changed by the precision release. Remediation references:
[RLS without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy),
[anonymous function execution](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable),
[authenticated function execution](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable),
[password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection),
[foreign-key indexes](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys),
[unused indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).

Supabase remains in Sydney (`ap-southeast-2`); Vercel remains in Singapore (`sin1`).
No region or JWT signing-key change was made. Physical-phone/PWA testing and an
authenticated browser save were not performed during this takeover. Reload open
app tabs and installed PWAs after this release.
