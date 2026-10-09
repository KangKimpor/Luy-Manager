/* Only versioned application assets are cached. Ledger, auth, API and RSC
 * responses always use the network, including when the app is installed. */
const CACHE_PREFIX = "luy-";
const ASSET_CACHE = "luy-v2-assets";
const MAX_ASSETS = 48;

const OFFLINE_PAGE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Offline | Luy Manager</title>
  <style>
    :root { --surface: #f4f7f5; --ink: #142c32; --brand: #087f78; }
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh; min-height: 100dvh; display: grid;
      place-items: center; padding: 1.5rem; text-align: center;
      font-family: system-ui, -apple-system, sans-serif;
      background: var(--surface); color: var(--ink);
    }
    h1 { font-size: 1.5rem; margin: 0 0 .75rem; }
    p { font-size: 1rem; line-height: 1.6; margin: 0 0 1.5rem; max-width: 23rem; }
    a {
      display: inline-flex; align-items: center; min-height: 3rem;
      padding: 0 1.5rem; border-radius: 1rem; text-decoration: none;
      background: var(--brand); color: white; font-size: 1rem; font-weight: 600;
    }
  </style>
</head>
<body>
  <main>
    <h1>Ready when you reconnect</h1>
    <p>Connect to the internet to load your latest balances and save entries.</p>
    <a href="/">Try again</a>
  </main>
</body>
</html>`;

self.addEventListener("install", (event) => {
  // No eager downloads compete with the app's first paint. New workers take
  // control without reloading pages, so an update never discards an entry draft.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== ASSET_CACHE)
        .map((key) => caches.delete(key))))
      .catch(() => undefined)
      .then(() => self.clients.claim()),
  );
});

async function cachedAsset(request, event) {
  let cache;
  try {
    cache = await caches.open(ASSET_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
  } catch {
    // Safari can refuse persistent storage. Asset delivery must still work.
  }

  const response = await fetch(request);
  const contentType = response.headers.get("Content-Type") ?? "";
  if (cache && response.ok && !response.redirected && !contentType.includes("text/html")) {
    const copy = response.clone();
    // Keep cache writes alive through worker suspension, and cap storage across
    // releases because old build hashes otherwise accumulate on installed PWAs.
    event.waitUntil(cache.put(request, copy).then(async () => {
      const keys = await cache.keys();
      await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_ASSETS))
        .map((key) => cache.delete(key)));
    }).catch(() => undefined));
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cachedAsset(request, event));
    return;
  }

  // Pass auth and API requests directly through, including their navigations.
  if (/^\/(auth|login|api)(\/|$)/.test(url.pathname)) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => new Response(OFFLINE_PAGE, {
      status: 503,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    })));
  }
});
