# Singapore migration status

Production now uses Singapore project `yqacpdhjddmwsvejywpn` in `ap-southeast-1`.
Sydney project `nrxqisihktxborgrpaje` was permanently deleted on 2026-10-14
after the user's explicit confirmation. The verified private backups are retained.
Kimpor workspace project `nlcpjdokfvawlpzyfytx` is restored and ACTIVE_HEALTHY
in the freed Free plan project slot. No paid services were activated.

## Production cutover on 2026-10-14

- After cutover, the user explicitly requested and confirmed permanent deletion
  of Sydney. The dashboard returned to the organization project list, and the
  Supabase project inventory now contains only Singapore and Kimpor, both
  ACTIVE_HEALTHY. Singapore's anonymous isolation, published rates and Google
  provider/callback probes passed again after deletion. The final source backup
  checksum was reverified before deletion. Historical references below to a
  paused or retained Sydney project describe the state before this deletion.
- The user confirmed that Singapore's server key was saved. Both public
  connection variables were independently verified against Singapore, with
  Production and Preview scopes preserved. Bot and cron settings were retained.
- A temporary Vercel rule held the production hostname. Web, Telegram POSTs and
  rate refresh requests all returned HTTP 403 with the deny mitigation during
  synchronization. The rule was deactivated and published after the rebuild.
- The final single-statement source snapshot contains all 45 application and
  Auth tables, totaling 3,020 rows. It is saved privately in
  `.tmp/singapore-migration/source-20261014-cutover.json`. SHA256:
  `a03f7c5cb0867b9d5406e27bbfa3cfdc1cde2bd6d5a980236b4138848d4c6aac`.
  Row payloads remain raw JSON strings so numeric precision is preserved.
- PostgreSQL decoded all 45 backup tables into their destination row types.
  Every recovered count and fingerprint matched. Only `auth.flow_state`,
  `auth.refresh_tokens`, `auth.sessions` and `auth.users` needed synchronization.
  They were copied in one transaction with fingerprint assertions before commit.
  All 45 destination table fingerprints then matched the final source snapshot.
- All 11 active account balance rows matched. Authenticated ownership isolation
  passed for all three users, all public tables retained RLS, all public and Auth
  foreign keys had zero orphan rows, and no public trigger was disabled.
  The authenticated KHR expense test reconciled exactly at `999355` minor units;
  positive expense rejection passed. These test writes were rolled back.
- Production deployment `dpl_FWVNF8XCXDsEdsMEqfmWDgQ6SP6g` rebuilt commit
  `5ed5a6c00eb106cd8da4bd9902c113f94116ca71` using Singapore's saved variables.
  It is READY and serves `https://luy-manager.vercel.app`.
- Interactive Google login succeeded with the existing ledger account, and its
  dashboard loaded the restored data. Anonymous reads of six private tables
  stayed empty. Published rates and the Google destination callback passed.
- A manual Vercel cron run successfully refreshed the published rate, verifying
  the deployed server key. Telegram's in-app connection check reported ready
  with zero pending messages. Unauthorized webhook and cron requests returned
  HTTP 401. The deployment's runtime error and fatal log scan was empty.
- Before pausing Sydney, its source fingerprints were unchanged. Destination
  ledger fingerprints still matched, including all 916 transactions. Only the
  expected live Auth and rate-refresh changes occurred after reopening.
  The production accounts page also loaded successfully after Sydney was paused.
- Kimpor workspace finished restoring and reports ACTIVE_HEALTHY. A read-only
  database health query succeeded. Final project states are Singapore healthy,
  Kimpor healthy and Sydney inactive, with Sydney retained for recovery.
- Typecheck, lint, all 670 tests and production build passed. The money scanner
  retained its baseline of six low findings, zero medium and zero high.
  Private verification evidence and runnable probes are in
  `.tmp/singapore-migration/`; none of these credential-bearing backups belong
  in Git.

The remaining sections preserve the earlier migration history. Statements about
pending cutover and unchanged variables below describe those earlier attempts.

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

## Historical cutover notes

Follow-up on 2026-10-14 from the Por checkout:

- Chrome successfully opened both Supabase projects and the existing Vercel
  project. The Supabase connector reports `USER_NOT_LOGGED_IN`; Vercel tools
  are not exposed. Browser control became unavailable during further checks.
- Singapore's Site URL is now `https://luy-manager.vercel.app`. Its redirect
  allowlist was copied exactly from Sydney: `http://localhost:3000/auth/callback`
  and `https://luy-manager-xyz.vercel.app/auth/callback`. Both saves were verified
  in the dashboard. Both projects use default email templates with custom SMTP
  disabled. Signup, email confirmation, manual linking and anonymous sign-in
  settings already matched.
- Google sign-in is enabled in Sydney and disabled in Singapore. Its credentials
  and destination callback configuration still need a user handoff.
- Live row fingerprints matched for all 14 accounts, 916 transactions and 1,331
  audit rows. Both projects have 3 Auth users, but canonical Auth user fingerprints
  differ. The per-field comparison remains incomplete; resolve this drift before
  cutover. These reads did not pause writes or change any ledger rows.
- Vercel production serves commit `5ed5a6c`; GitHub CI passed for that commit.
  All three connection variables currently cover Production and Preview.
  Neither environment was changed or redeployed during this follow-up.
- The private `.tmp/singapore-migration/` export is absent from this checkout.
  Recover it from the previous machine or obtain and verify a fresh complete
  source backup before retiring Sydney. The available `.tmp/release/` backups
  predate this region migration and do not replace its export.

Later follow-up on 2026-10-14:

- Supabase connector access is restored. Chrome was recovered through the
  supported browser runtime without changing permissions or plugin files.
- All 19 public tables match by canonical row fingerprints. Functions, columns,
  constraints, indexes, policies, triggers, RLS settings and all 11 active account
  balance rows match. Destination migration history still has the expected extra
  schema-restoration entry.
- The Auth user difference is limited to `updated_at`; all other 34 fields match.
  `auth.sessions` and `auth.refresh_tokens` have changed on the writable source
  since the first restore. Synchronize the final Auth snapshot during cutover.
- A fresh single-statement snapshot of all 45 application and Auth tables,
  totaling 3,020 rows, is saved privately in
  `.tmp/singapore-migration/source-20261014-readonly.json`. SHA256:
  `c8769fc96c78f0bda824d40b1c697297ec2304bac5042853f2651c9eec7e16eb`.
  This supersedes the missing export for data recovery, but was captured while
  Sydney remained writable and is not the final cutover snapshot.
- PostgreSQL decoded the preserved raw JSON into every destination table's row
  type; all 45 recovered table counts and fingerprints match the source snapshot.
  Private schema, migration statement, sequence and fingerprint evidence is in
  `.tmp/singapore-migration/verification-20261014.json`. Backup payloads were not
  parsed and reserialized before PostgreSQL recovery checks.
- Anonymous API isolation passed for six private tables, and published rates
  remain readable. Authenticated ownership isolation passed for all three users.
  The rolled-back KHR expense test reconciled exactly at `999355` minor units;
  positive expense rejection passed and every destination row fingerprint stayed
  unchanged. Advisor findings remain the two previously documented findings.
- Google OAuth credential entry and the destination server key configuration
  still require the browser policy's credential handoff. The source and
  destination Google forms, destination API keys and Vercel variables are open.
  No production variables were saved and no redeployment was started.
- The user entered the Google client ID and secret in Singapore. Google remains
  disabled and the form is unsaved; the user must enable and submit it under the
  browser credential policy. Google Cloud was opened and the SB Projects account
  selected, but Chrome blocked automation because another extension sign-in UI
  is open. Complete or dismiss that UI before configuring the destination callback.
- All 704 public table, view and sequence grants match. All 34 public foreign
  keys have zero orphan rows. No permanent ledger writes were made by verification.
- After cutover passes, pause Sydney to free the active Free project slot and
  restore Kimpor. Paused projects do not count toward the Free project limit, so
  deletion is unnecessary for this migration:
  [Supabase billing](https://supabase.com/docs/guides/platform/billing-on-supabase).

Latest configuration follow-up on 2026-10-14:

- Google is enabled and saved in Singapore. The existing Google Cloud OAuth
  client now includes the Singapore callback and retains the Sydney callback.
  The destination Auth settings API reports Google enabled, and its authorize
  endpoint returns the expected Google redirect with the destination callback.
  An interactive Google login against the destination remains untested.
- The user saved Singapore's legacy `service_role` key in Vercel's existing
  `SUPABASE_SERVICE_ROLE_KEY`, for Production and Preview. No redeployment ran.
- Vercel blocks saving new values in the existing public variables because
  they are Secret entries. Its editor also blocks converting saved Secrets to
  Config. The attempted public URL edit was cancelled without saving; the anon
  key was not edited. The user declined deletion and recreation and explicitly
  requested that both public variables remain unchanged.
- The unused maintenance rule draft was cancelled. No firewall rule was
  published, writes were not paused, and the live Sydney deployment is unchanged.
- Vercel's server-key history offers no restore control. The user completed the
  handoff to restore Sydney's legacy `service_role` key, preserving Production
  and Preview. After reloading the page, its new save timestamp and environment
  scope were verified. Vercel's Secret value is write-only, so its contents were
  not inspected; the Sydney key selection relies on the user's confirmation.
- Cutover cannot proceed with both public connection variables unchanged.
  Sydney must remain active; Kimpor remains paused because the two active Free
  project slots are occupied. No project was paused, deleted or restored.

1. Keep the Sydney configuration and both public variables unchanged as
   requested. The server-key restoration handoff is complete. Existing
   deployments retain their built values; future deployments use the saved
   project variables.
2. Resume the remaining region cutover only if the user authorizes updating
   both public connection variables. Google provider and callback configuration
   are already saved; recheck them before cutover.
3. When cutover is authorized, use the destination server API key privately.
   Never reuse Sydney's key with Singapore or expose a server key in a
   `NEXT_PUBLIC_` variable.
4. Pause web and Telegram writes together. Capture a fresh, consistent source
   backup, synchronize changes since the initial restore and reconcile all
   rows and account balances. Verify backup recovery before retiring Sydney.
5. Update the three Supabase connection variables for the existing Vercel
   project `prj_j1OB0B3BDXYplTJ4HQirePDSMwRG` in team `sb-6cac`, preserving bot
   and cron settings. Redeploy because public variables are baked into builds.
6. Verify login, owner isolation, balances, transaction saves, rates refresh
   and Telegram delivery without duplicate writes. Resume writes only after
   the destination deployment passes. Existing sessions may need login again.
7. Pause Sydney only after final backup and live checks pass. Then restore Kimpor
   workspace and wait for its backend to become healthy. Retain Sydney for
   recovery rather than deleting it. Do not activate paid services.

Existing advisor findings remain: the internal rate-sync table has RLS without
client policies, and leaked-password protection is disabled. References:
[internal-table policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
and [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Production login, balances, rates and Telegram connection checks now pass on
Singapore. A new user-originated Telegram message and a physical-device
transaction-save smoke test were not performed during this cutover.
