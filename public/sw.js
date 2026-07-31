/**
 * Service worker: making the app usable on a bad connection.
 *
 * PRD Section 1 lists offline capability, and PRD Section 15's five-second entry
 * budget is unmeetable on the mobile data this app will actually run on if every
 * tap waits for a round trip.
 *
 * Two deliberate decisions:
 *
 *   1. Ledger data is NEVER served from cache. A cached balance is a wrong balance,
 *      and there is no visual difference between "your net worth is $11,225" and
 *      "your net worth was $11,225 last Tuesday". Only the shell — scripts, styles,
 *      icons, the manifest — is cached. If the network is down, the app loads and
 *      says it cannot reach your data, rather than showing figures it cannot vouch
 *      for.
 *
 *   2. Auth responses are never cached, at any cost. They carry Set-Cookie headers,
 *      and a cached one would hand one person's session to whoever asked next.
 *
 * Plain JavaScript in `public/` rather than a build-time plugin: it is small enough
 * to read in one sitting, and a caching strategy for a finance app is something you
 * want to be able to read.
 */

const VERSION = "luy-v1";
const SHELL_CACHE = `${VERSION}-shell`;

/** Kept minimal on purpose: anything listed here must exist or install fails. */
const SHELL_ASSETS = ["/icon.svg", "/manifest.webmanifest"];

/** Shown when a navigation cannot reach the network. Declared before the
 * listeners that use it, so reading top to bottom works. */
const OFFLINE_PAGE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Offline — Luy Manager</title>
  <style>
    body {
      margin: 0; min-height: 100vh; display: flex; align-items: center;
      justify-content: center; padding: 1.5rem; text-align: center;
      font-family: system-ui, -apple-system, sans-serif;
      background: #f5f6f8; color: #1a1d23;
    }
    h1 { font-size: 1.125rem; margin: 0 0 .5rem; }
    p { font-size: .875rem; color: #5b6472; margin: 0 0 1.25rem; max-width: 22rem; }
    button {
      min-height: 2.75rem; padding: 0 1.25rem; border: none; border-radius: .75rem;
      background: #4c5fd5; color: #fff; font-size: .875rem; font-weight: 600;
    }
  </style>
</head>
<body>
  <div>
    <h1>You are offline</h1>
    <p>
      Your figures are not shown rather than shown out of date &mdash; a stale
      balance is worse than none. Reconnect and reload.
    </p>
    <button onclick="location.reload()">Try again</button>
  </div>
</body>
</html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // Individually, so one missing asset does not abort the whole install.
      .then((cache) => Promise.allSettled(SHELL_ASSETS.map((asset) => cache.add(asset))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** Paths whose responses must never be stored, whatever the headers say. */
function isSensitive(url) {
  return (
    url.pathname.startsWith("/auth") ||
    url.pathname.startsWith("/login") ||
    url.pathname.startsWith("/api/")
  );
}

/**
 * Build-hashed static assets. Safe to cache indefinitely because the filename
 * changes when the content does.
 */
function isImmutableAsset(url) {
  return url.pathname.startsWith("/_next/static/");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only GET is cacheable, and a server action is a POST, so this also leaves every
  // mutation strictly online.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Third-party requests, including Supabase itself, are left entirely alone.
  if (url.origin !== self.location.origin) return;

  if (isSensitive(url)) return;

  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Navigations: network first, and on failure the offline notice — never a stale
  // page, because a stale page in this app means stale figures.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response(OFFLINE_PAGE, {
            status: 503,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          }),
      ),
    );
  }
});
