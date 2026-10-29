# Native Android app, version 0.2.0

This is the first native core build for testing on the Samsung S25 Ultra. It uses Android views, private SQLite storage, Android Keystore encryption for session tokens, HTTPS to the existing Supabase project, and Android JobScheduler for retries. There is no WebView or JavaScript runtime in the APK.

## Included

- Google sign-in using PKCE and the native callback `com.luymanager.nativeapp://auth/callback`.
- Cached home balances, monthly cash flow, account balances, and searchable activity with 50-entry pages.
- Offline expense, income, refund, and two-leg transfer entries, plus account creation.
- Exact integer cents for USD and hundredths of riel for KHR. Amounts such as `9993.55 KHR` stay exact.
- Per-user draft and ledger isolation, a durable ordered upload queue, and lost-response recovery using stable row IDs and exact field comparison.
- Background retry on an available network. Android may delay jobs while the app is restricted or the phone is idle. Opening the app or tapping Sync now also attempts sync.
- Local reads and balance calculations run separately from network requests. Overlapping sync requests share one network sequence.
- Budgets can be viewed. Balance totals remain separate by currency.

## Scope and remaining checks

This build does not yet provide native editing/deletion, category management, budget editing, splits, mixed-currency tenders, converted reports, import/export, exchange-rate management, or Telegram notification parity. These remain available in the existing web app. Native entries do not capture historical base-currency conversion fields; native totals are explicitly separated by currency. Dates use Cambodia time.

Automated checks use isolated local fixtures and simulated server responses. They do not establish successful production Google sign-in, production upload/RLS behavior under a real user session, or frame-rate/battery behavior on a Samsung phone. The redirect allowlist save was submitted with the owner's approval, but its persisted dashboard state must still be confirmed after the browser connection is restored.

Keep the existing web app available while testing. Pending entries exist on the phone until confirmed by the server, so uninstalling or clearing app storage before sync removes them. Signing out is blocked while entries are pending. Local ledger files remain in private app storage after sign-out, and app backups are disabled.

## Build

Use JDK 17 and Android SDK platform 36. In this folder create ignored `local.properties` with your SDK path:

```properties
sdk.dir=C:/path/to/android_sdk
```

Create ignored `backend.properties` with the project's public publishable key:

```properties
publishableKey=sb_publishable_REPLACE_WITH_PUBLIC_KEY
```

Only a public publishable key belongs in an APK. Never use a secret or service-role key. Release builds reject a missing or invalid publishable key.

```powershell
./gradlew.bat --no-daemon testDebugUnitTest assembleRelease lint
```

The unsigned output is `app/build/outputs/apk/release/app-release-unsigned.apk`. Use Android SDK `zipalign` and `apksigner` to align and sign it with the retained `../android.keystore`, alias `android`. Keep the same key for updates and increment `versionCode` for each release. Signing passwords are not stored in this repository.

The current workstation keeps the signing password in a Windows DPAPI-protected credential file at `%USERPROFILE%/.bubblewrap/luy-manager/signing-password.xml`. It can only be opened under the Windows account that created it. Preserve the keystore and recoverable signing credentials separately before moving to a different computer.

## Verification

Run the unit tests, release assembly, and Android lint command above. Tests cover native navigation, durable offline entries, fractional riel, transfer atomicity, paging past 100 entries, draft selection, slow networks, sync coalescing, per-user isolation, interrupted uploads, malformed downloads, and ledger reconciliation.

On the phone, verify these before relying on the native app for daily use:

1. Install the signed APK and confirm Google sign-in returns to the app, then wait for Up to date.
2. Compare USD and KHR account balances with the web app.
3. Enable airplane mode, add an entry, close and reopen the app, and confirm the pending entry remains.
4. Reconnect, tap Sync now, and confirm exactly one entry appears in both apps and the pending count reaches zero.
5. Check transfer legs, keyboard layout, text scaling, scrolling, back navigation, and startup on the S25 Ultra.
6. Confirm behavior after token expiry, process termination, phone restart, and Samsung battery restrictions.

Only use an entry you intend to keep when testing with your production account.
## Build record, 2026-10-24

- 22 automated tests passed, with zero failures or errors.
- Release assembly passed. Android lint reported zero errors and 10 warnings, primarily synchronous durable preferences and English UI strings in code.
- APK signature and ZIP alignment verified. Package `com.luymanager.nativeapp`, minimum Android API 28, target API 36, version code 1.
- Final APK SHA-256: `8CEB65AB345EDE160FB7EF3659705B120FC96B9A4D03AF0161299FD68A55AE70`.
- No physical Android device was attached. No authenticated production financial writes were performed for testing. At the initial build, source changes and the APK were local to this checkout. The user subsequently requested publishing the source to main; the APK and signing files remain ignored and local.
