# Supabase rebuild, 2026-10-29

Production uses `lesfzlirqkwvmevhrgug` in Singapore (`ap-southeast-1`).
The previous project `yqacpdhjddmwsvejywpn` was accidentally deleted.
The website remains https://luy-manager.vercel.app.

## Recovery and limits

The prior session restored the Oct 14 backup and merged the recovered Android
ledger. Current checks confirm 3 profiles, 14 accounts, 973 transactions and
211 categories. The recovered phone user has 60 transactions. The other two
users only have the data available in the Oct 14 backup. The earlier handoff
records missing audit entries for the phone transactions and regenerated category
IDs. The historical migration document does not establish a newer backup exists.

Keep the three recovered `ledger-c81c5d29-...` database files in `.tmp/`.
A new consistent, private snapshot of 46 public and Auth tables is saved at
`.tmp/supabase-rebuild-20261029/pre-history-repair.json`. It preserves each
table's raw JSON string to avoid changing numeric precision. SHA256:
`a904688ce6497c9ab9c5c66eab974f2c2c157b216e9696e4ea460deba826b9a5`.
Backups and credentials are ignored by Git.

## Completed checks and repairs

- The owner confirmed the exposed database password was reset. The local
  connection URL was normalized and verified over TLS using the dashboard's
  database CA certificate.
- Supabase's Site URL had changed to the Vercel-protected address
  `https://luy-manager-sb-6cac.vercel.app/`. It was restored to
  `https://luy-manager.vercel.app`. The owner confirmed sign-in now returns to
  Luy Manager. The Vercel integration resets this fallback on deployment, so
  changing Site URL alone is insufficient. The missing allowlist patterns were
  `https://luy-manager.vercel.app/auth/callback?next=**` and
  `http://localhost:3000/auth/callback?next=**`. The app includes this return-path
  query for both Google and email login. Generated links reproduced the bad
  fallback before the fix and preserved the requested callback afterward, even
  with the integration's fallback active. Root and accounts return paths,
  localhost and the unchanged native callback passed. No test email was sent.
- The Supabase Preview check failed because migration history was empty while
  the schema was already installed. Verified all 16 application function bodies,
  66 expected tables, views and indexes, RLS on all 19 public tables, enabled
  triggers, flat categories and precision version 2 before marking migrations
  0001 through 0016 applied with `supabase migration repair`. The data migrations
  were not rerun. The subsequent dry run listed only migration 0017.
  After applying 0017, the remote database is up to date and the Supabase Preview
  check, migration replay, app verification, CodeQL and Vercel deployment all pass
  for commit `c1cbce5`.
- Migration 0017 revokes client execution of the Supabase-created automatic RLS
  event-trigger helper. Both anonymous and authenticated execution are now denied.
  The helper remains available for database DDL. It is conditional because local
  databases do not necessarily have this platform helper.
  Rerunning the dashboard advisor cleared both helper warnings. The remaining
  dashboard warning is leaked-password protection disabled.
- Anonymous reads return no private profile, account, transaction, category or
  audit rows. Authenticated ownership checks passed for all three users across
  15 owner-scoped tables and views.
- Telegram reports the correct production webhook, zero pending updates and no
  delivery errors. A live authenticated rate refresh stored the Oct 29 rate
  successfully. An unauthenticated rate refresh returns HTTP 401.

## Android update

`android/Luy-Manager-Native-0.2.1.apk` uses the rebuilt backend and its public
publishable key. Package `com.luymanager.nativeapp`, version code 4, updates the
temporary recovery build's version code 3. Its signature matches that recovery
APK. ZIP alignment and signing checks pass. SHA256:
`3b74ea2a791a6d60893f9ff02992f8719439a493705e35a0908e7954cce084cc`.

The owner declined installation and reported seeing all data after signing in
to the existing app. No device was attached. Data visibility alone does not
establish successful server sync because the native app caches its ledger.
Do not uninstall or clear app storage before verifying sync.

## Validation and remaining checks

Typecheck, ESLint, 740 Vitest tests, 3 security regression tests and the production
build pass. The money scanner remains at 6 low findings, 0 medium and 0 high.
All 25 Android tests, release assembly and Android lint pass using the installed
64-bit JDK 17. The older 32-bit JDK cannot run Robolectric's native runtime.

Real email-link sign-in, a new user-originated Telegram message, duplicate
delivery behavior against production, phone installation and device sync have
not been verified in this continuation. No financial entries were added for
testing. Supabase's dashboard also reports leaked-password protection disabled;
no paid plan was enabled. The Supabase connector needs reauthentication, so
verification used the dashboard and the existing local database/API credentials.
