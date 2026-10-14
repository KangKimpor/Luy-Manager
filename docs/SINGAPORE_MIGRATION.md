# Singapore migration status

The database restore is verified. The production cutover is pending.

Sydney project `nrxqisihktxborgrpaje` still serves production. Singapore project
`yqacpdhjddmwsvejywpn` was created in `ap-southeast-1`. Kimpor workspace project
`nlcpjdokfvawlpzyfytx` remains paused until the migration is finished and a Free
plan project slot is available.

## Verified restore

Verified on 2026-10-14 at 15:01 Bangkok time. Recheck the source before cutover:
it is still writable, so these figures describe the verified snapshot.

- All 45 copied application and Auth data tables matched the live source by
  exact PostgreSQL row fingerprints: 3,017 rows, including 3 users, 14 accounts,
  916 transactions and 1,331 audit entries.
- All 14 source migration statement sets were replayed. Destination history has
  15 entries, including `restore_source_schema_extras`, which preserves the
  source function definitions and automatic RLS event trigger.
- All 16 public function definitions, constraints, indexes and RLS policies
  matched. Platform-owned Auth migration history stays on the destination's
  current version. The RLS event-trigger function has client execution revoked;
  its automatic RLS behavior is preserved.
- All 19 public tables have RLS. All 34 public foreign keys have zero orphan
  rows. No public trigger is disabled. Serial sequences were restored.
- Authenticated transaction isolation passed for all three users. Anonymous
  REST reads of accounts, transactions, budgets, profiles, audit logs and
  Telegram logs returned no rows. Published exchange rates are readable.
- Precision version is 2. An authenticated KHR expense of `999355` minor units
  changed its balance by exactly that amount. The test was rolled back and
  positive expense rejection passed. All table fingerprints stayed unchanged.
- Neither project had storage objects or Edge Functions to transfer.

The original private export is in the ignored local directory
`.tmp/singapore-migration/`. It contains credential data and must never be
committed. Its `source-initial.json` SHA256 is
`eae86f46fdc2e0fd44b66d41c742fb07d0ebbebc999ac329a2d203a889d0db11`.
The original export preserves embedded JSON numeric formatting; parsed JSON
derivatives must not replace it for exact audit restoration.

## Remaining cutover

1. Restore working Supabase and Vercel connector access. The last attempts
   returned `Unknown tool` despite enabled plugins. Supabase browser access
   was denied by a saved permission or managed policy. Do not bypass that gate.
2. Copy and verify Auth provider, email, site URL and redirect configuration.
   Configure the existing Google OAuth client for the destination callback:
   `https://yqacpdhjddmwsvejywpn.supabase.co/auth/v1/callback`.
   Credential entry through the browser requires a user handoff.
3. Obtain the destination server API key privately. Never reuse Sydney's key
   with Singapore or expose a server key in a `NEXT_PUBLIC_` variable.
4. Pause web and Telegram writes together. Capture a fresh, consistent source
   backup, synchronize changes since the initial restore and reconcile all
   rows and account balances. Verify backup recovery before retiring Sydney.
5. Update the three Supabase connection variables for the existing Vercel
   project `prj_j1OB0B3BDXYplTJ4HQirePDSMwRG` in team `sb-6cac`, preserving bot
   and cron settings. Redeploy because public variables are baked into builds.
6. Verify login, owner isolation, balances, transaction saves, rates refresh
   and Telegram delivery without duplicate writes. Resume writes only after
   the destination deployment passes. Existing sessions may need login again.
7. Delete Sydney only after final backup and live checks pass and the required
   deletion confirmation is obtained. Then restore Kimpor workspace and wait
   for its backend to become healthy. Do not activate paid services.

Existing advisor findings remain: the internal rate-sync table has RLS without
client policies, and leaked-password protection is disabled. References:
[internal-table policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
and [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

No production connection variables were changed during this restore. Login,
Telegram and physical-device checks against the destination remain pending.
