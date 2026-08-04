# Luy Manager — Android build (TWA, 100% free)

This wraps the existing deployed website in a native Android shell using a
**Trusted Web Activity**. It is not a second app to maintain — it loads
`https://<your-domain>` directly, so every change you ship to the website
appears in the Android app immediately, with zero rebuild.

You need this website already deployed at a real HTTPS domain before starting
(Vercel's free tier is fine). Everything below runs on your own machine —
nothing here needs Anthropic's sandbox or any paid service, except the
optional one-time $25 Google Play Console fee if you want it listed publicly.

## 0. Prerequisites (all free)

- [Node.js](https://nodejs.org) 18+
- A JDK (Bubblewrap installs one for you if missing — Android builds need
  Java, not because this app uses it, but because the Android toolchain does)
- That's it. Bubblewrap downloads the Android SDK components it needs on
  first run.

## 1. Fill in your real domain

Two files in this repo have a placeholder domain — replace
`REPLACE_WITH_YOUR_DOMAIN.com` with where the app is actually deployed:

- `android/twa-manifest.json` — the `host`, `iconUrl`, `maskableIconUrl`,
  `webManifestUrl`, and shortcut icon URL fields
- Nothing else needs it; the app itself has no hardcoded domain

## 2. Install Bubblewrap

```sh
npm install -g @bubblewrap/cli
```

## 3. Build the Android project

From the `android/` folder (where `twa-manifest.json` already lives):

```sh
cd android
bubblewrap build
```

First run: Bubblewrap notices there's no keystore yet and creates one
(`android.keystore`, matching the `signingKey` path in the manifest). It will
ask you to set a keystore password and key password — **write these down
somewhere safe**. Losing them means you can never publish an update to the
same app listing again; you'd have to ship a new app under a new package ID.

This produces:

- `app-release-signed.apk` — installable directly on a phone, no store needed
- `app-release-bundle.aab` — what the Play Store wants if you publish

## 4. Get your signing fingerprint, then finish assetlinks.json

```sh
keytool -list -v -keystore android.keystore -alias android
```

Copy the `SHA256:` fingerprint from the output (looks like
`14:6D:E9:83:C5:73...`), remove the colons, and paste it into
`public/.well-known/assetlinks.json` at the repo root, replacing
`PLACEHOLDER_REPLACE_WITH_YOUR_SIGNING_CERT_SHA256_FINGERPRINT`.

Deploy that change to your website. Android checks this file at install
time — if it's missing or the fingerprint doesn't match, the app still
works, it just shows a thin browser URL bar instead of looking fully native.

## 5. Install it

**Direct, free, no store:**

```sh
adb install app-release-signed.apk
```

or just copy the APK to your phone and open it (you'll need to allow
"install from unknown sources" once).

**Play Store (optional, $25 one-time):**
Upload `app-release-bundle.aab` to the [Play Console](https://play.google.com/console).
Google's review typically takes a few hours to a few days.

## Updating the app later

Because a TWA just points at your live website, you almost never need to
rebuild the Android app — ship changes to the site and the app reflects them
on next load. You only need to rerun `bubblewrap build` and re-publish if you
change:

- The app icon or name
- `twa-manifest.json` itself (theme colors, shortcuts, etc.)
- The `appVersionCode` (required by Play Store for any update, even a no-op one)

## Why the web app is untouched

Nothing above modifies how the site behaves as a website. The manifest and
service worker changes made to the main app (`icons`, `id` field,
`.well-known/assetlinks.json`) are additive — a browser that's never heard of
Android ignores all of them and the site works exactly as before. The
`android/` folder is Bubblewrap's own project, entirely separate from the
Next.js app, and safe to `.gitignore` the generated keystore and build output
if you don't want to commit it.
