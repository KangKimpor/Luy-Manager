# Luy Manager Android

The native Android app is in `native/`. It renders Android views and reads a private SQLite ledger locally. It does not load the website to display its screens. The old `twa-manifest.json` describes the earlier website wrapper and is not used by this build.

The signed test APK is `Luy-Manager-Native-0.1.0.apk` in this folder. Install it alongside the existing Chrome app, sign in with Google while online, and wait for the first ledger sync. Subsequent launches and entries can use the local ledger without internet.

See [native build and verification notes](native/README.md) for build commands, supported features, and the remaining device checks.