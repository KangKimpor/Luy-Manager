# Local session handover

Prepared 2026-10-24, Asia/Bangkok. Continue in this existing checkout:

Push follow-up: the user subsequently requested all updates be pushed to main. Native source and this handover are included in that update. Working-tree descriptions below record the earlier handover state; use current Git status and remote history for the latest state. The APK, backend configuration and signing files remain ignored and local.

`C:\Users\jpkim\OneDrive\SB Documents\GitHub\Luy-Manager`

## User intent and authorization

The user wants Luy Manager to feel fast on a Samsung S25 Ultra and to have a real native Android APK, with offline entries that sync later. The existing production web app is `https://luy-manager.vercel.app`, installed from Chrome. The user chose to build first and test on the phone later. Do not claim physical-device validation or perfect behavior.

The user explicitly approved adding `com.luymanager.nativeapp://auth/callback` to the live Supabase redirect allowlist. Save was submitted in Chrome, but persistence was not verified before that browser connection disappeared. Do not ask for this same approval again. Verify the current allowlist before adding a duplicate.

The user approved including compatible Next.js and Vitest updates in the earlier dependency fix, and previously requested pushing the web updates. Native source and APK have only been prepared locally so far.

## Instructions to retain

Read `AGENTS.md`, `.claude/skills/luy-manager-project/SKILL.md`, and relevant references before changing code. Read the money skill for amounts and currencies. Read bundled Next.js docs before editing Next.js code. Do not edit applied migrations. Keep bank KHR in integer hundredths, just like USD cents. No em or en dashes in new text.

Ponytail full mode is active: finish the smallest complete change, preserve validation and data safety, test nontrivial logic, and end responses with what was not checked and any material risk. Do not spawn agents unless expressly authorized by the user or applicable instructions. Existing historical dependency agents are not required for continuation.

## Current repository state

HEAD at handover: `37359f4` (dependency fixes). Previous web performance commit: `5630e29`.

The earlier session reported both commits pushed, CI and CodeQL successful, and production deployed. Those are historical verification results, not a fresh remote/deployment check in this handover.

Uncommitted changes, verified at handover:

- `.gitignore`: excludes native Gradle output, local SDK/backend configuration, APKs and signature sidecars.
- `android/README.md`: updated to point to the native project.
- Entire new `android/native/` project, including source, tests, wrapper and documentation.

Do not reset, clean, overwrite or discard these changes. The native source is untracked, not committed. No native push or release publication has happened.

## Deliverable already built

Signed APK:

`android/Luy-Manager-Native-0.1.0.apk`

- Size: 78,525 bytes.
- SHA-256: `8CEB65AB345EDE160FB7EF3659705B120FC96B9A4D03AF0161299FD68A55AE70`.
- Package: `com.luymanager.nativeapp`.
- Version: 0.1.0, code 1.
- Minimum API 28, target/compile API 36.
- APK signature scheme v3 and ZIP alignment verified. A v3-only signature is valid for the declared minimum API.
- Release APK contains the native activity/back handler and a public publishable key. Inspection found no WebView, test framework or `sb_secret_` key.

The APK is ignored by Git. Keep it when moving or copying this work. The user has been given a local clickable link. Read `android/native/README.md` for feature coverage and installation checks.

## Native implementation

Plain Java and Android platform APIs, without runtime third-party dependencies or a WebView:

- `MainActivity.java`: native Home, Activity, Add, Accounts and More screens; Google PKCE sign-in; per-owner draft persistence; keyboard/system insets; back navigation; 50-entry activity pages.
- `Ledger.java`: exact account balances and monthly cash flow calculated on the local worker, separate totals for USD and KHR. Positive/negative adjustments count in cash flow; transfers are excluded.
- `Money.java`: exact decimal parsing, safe integer bounds, formatting and symmetric conversion rounding. KHR is two decimals.
- `LedgerStore.java`: per-owner private SQLite database, snapshots and durable FIFO outbox; atomic snapshot replacement/acknowledgment and row-ID overlay to avoid double counting.
- `CloudClient.java`: fixed HTTPS Supabase origin, user-scoped REST requests, refresh/user verification, precision RPC guard, paginated complete downloads, account/category revalidation, atomic transfer insert and exact lost-response reconciliation.
- `SessionVault.java`: AES-GCM session tokens protected by Android Keystore. Ledger and drafts are in private app storage; do not describe the SQLite ledger itself as encrypted by this implementation.
- `LuyApplication.java`: separate local and network executors, coalesced sync requests, persisted network-required jobs.
- `SyncJob.java`: retry through JobScheduler. Signed-out jobs stop; sign-out cancels the job and is blocked while entries remain pending.

Offline creation supports expenses, income, refunds, two-leg transfers and accounts. Budgets are view-only. Native entry amounts and transfers have automated coverage.

## Material gaps and risks

This is a first native core test build, not full web feature parity. Native editing/deletion, category management, budget editing, splits, mixed-currency tenders, converted reports, import/export, rate management and Telegram notification parity are not implemented. They remain in the web app.

Native entries currently omit historical base-currency conversion fields. Native totals stay separate by currency. Assess compatibility with historical converted web reports before expanding daily-use claims. Dates use Cambodia time.

Pending writes refused by the server remain on the device and are shown in More. There is no native editor for resolving those queued records yet. Do not silently drop them to unblock sync.

No authenticated production ledger writes, successful real Google login, real token-refresh cycle, physical-device startup/FPS/battery measurements, or Samsung keyboard/inset checks were performed. Clearing app storage or uninstalling before sync loses pending entries. Sign-out retains owner-isolated cached ledger files in private storage. Backups are disabled.

## Latest verification

The last source build ran:

```powershell
./android/native/gradlew.bat -p android/native --no-daemon testDebugUnitTest assembleRelease lint
```

All 22 tests passed, zero failures/errors: CloudClient 5, LedgerStore 4, Ledger 2, MainActivity 8, Money 3. Release assembly passed. Android lint: zero errors, 10 warnings, primarily synchronous durable preferences and English strings in Java. Java compiler also reports deprecated APIs and unchecked spinner casts. These warnings were not represented as absent.

Tests cover durable offline fractional-riel entries, atomic transfer rows, draft account selection across snapshot reordering, activity beyond 100 entries, back/draft behavior, slow network isolation, sync coalescing, account isolation, exact duplicate recovery, missing/changing/cross-owner downloads and ledger reconciliation.

Reports: `android/native/app/build/reports/tests/testDebugUnitTest/` and `android/native/app/build/reports/lint-results-debug.html`. Native checks are distinct from web tests and live production proof. `git diff --check` passed at handover.

Earlier dependency verification: production npm audit had zero findings; one unpatched development-only braces advisory remained, appearing as five aggregate chain findings. The previous session reported stale GitHub alerts despite the dependency graph updating. Recheck current alert state if relevant; do not downgrade tools to hide the advisory.

## Backend and connection state

Correct live Supabase project: `yqacpdhjddmwsvejywpn`, LuyManager, Singapore. It was previously verified ACTIVE_HEALTHY and its schema read through the plugin. Native configuration points there.

`.env.local` points to the old `nrxqisihktxborgrpaje` project and was intentionally left untouched. Do not copy that stale address into native configuration or assume local environment equals production.

At the end of this session, Plugin Management reported Supabase installed/enabled, but project/list calls returned Unknown tool. Browser inventory showed only the in-app browser and MCP Apps, despite the user reporting Chrome reconnected. Resetting the CUA runtime did not expose Chrome. The in-app browser reached the Supabase sign-in page, not the authenticated dashboard. Do not claim these connections worked merely because tools were listed. A fresh local session may refresh routing and browser availability.

Do not loop connection retries or change security permissions to work around routing. Discover current tools, attempt a read-only project call, and inspect Chrome inventory. Use the Supabase skill. The plugin available here did not expose Auth redirect configuration, so the approved callback change used the dashboard.

## Local toolchain and signing

Read `%USERPROFILE%/.bubblewrap/config.json` for the exact JDK and SDK paths. The prepared JDK is 64-bit Java 17; the original 32-bit JDK exhausted memory. Use the 64-bit path, not the abandoned TWA toolchain settings.

Gradle wrapper is 8.11.1, Android Gradle Plugin 8.9.1. SDK platform 36 and build tools 36.1.0 are installed. Robolectric 4.17 and JUnit 4.13.2 are test-only dependencies. No device was attached at the last check.

Ignored required build files:

- `android/native/local.properties`: SDK directory.
- `android/native/backend.properties`: public publishable key only. Release checks reject a missing key or a non-publishable key. Never put a service-role/secret key in the APK.
- `android/android.keystore`: RSA 3072 signing key, alias `android`.
- `%USERPROFILE%/.bubblewrap/luy-manager/signing-password.xml`: Windows DPAPI-protected PSCredential for signing. Its plaintext was not printed or committed. Keep signing credentials out of handover text and terminal output. It is tied to this Windows account.

Set `JAVA_HOME` and `ANDROID_HOME` from the Bubblewrap config before Gradle. The unsigned release is `android/native/app/build/outputs/apk/release/app-release-unsigned.apk`. Run SDK zipalign before apksigner; sign with the retained key, pass passwords through temporary environment variables, clean those variables in `finally`, and verify the final artifact. Signing used `--v4-signing-enabled false`; no sidecar is needed for installation. Reuse the signing key for updates and increment the version code for a new distributed release.

Google Java Format 1.25.2 is available in ignored `.tmp/google-java-format.jar`; source was formatted with the 64-bit JDK.

## Recommended continuation

1. Read this handover and the native README, inspect current Git status, and preserve all local files.
2. Refresh the Supabase/browser connections in the new session. Verify the already-approved callback exists in the live allowlist. Add it only if missing, then verify persistence.
3. Have the user install the signed APK as requested. Test Google return-to-app, initial sync, and balance reconciliation first. Use only production entries the user intends to keep, or a genuinely isolated test environment.
4. Test offline save, process restart, reconnect and exactly-once cloud visibility; then keyboard, large text, scrolling, back gestures, token expiry, reboot and Samsung battery restrictions. Do not mark these completed based on Robolectric tests.
5. Resolve real failures before claiming daily-use readiness. Prioritize historical conversion compatibility and queued-error recovery before broad feature expansion.
6. If asked to push, run repository-required typecheck, lint, tests, build and money scanner, plus native tests/lint/build for this new code. Keep source push, CI, web deployment and APK installation as distinct states.

The handover request does not authorize creating a new chat, moving the checkout, publishing a release, or changing persistent memory. Continue locally using this file.
