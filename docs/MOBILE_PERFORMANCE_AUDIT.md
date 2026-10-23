# Mobile performance audit

Checked on 2026-10-23 for the Samsung S25 Ultra Chromium app.

The user confirmed the target is `luy-manager.vercel.app`, installed from Chrome as a PWA. An Android wrapper rebuild is not needed for these web changes.

## Changes

| Finding | Change | Scope |
| --- | --- | --- |
| Dashboard waited for the exchange rate before starting budget and transaction reads. | Start independent reads together; only budget calculations await the rate. | Dashboard loader and caller, with a concurrency regression test. |
| Dashboard previews and Add-screen habit learning requested an exact total count that neither screen uses. | Use a bounded recent-row query without a count. | Data helper and both callers. Activity pagination retains its exact count. |
| The bottom Add link prefetched only the loading shell. | Fully prefetch this frequent destination through Next Link. | Mobile bottom navigation. Other destinations keep their existing prefetch behavior. |
| Touch navigation replayed decorative entrance, progress, and orbit animations. | Remove those animations for coarse pointers without hover. | Touch devices; tap, saving, and error feedback remain. |
| Android's keyboard could cover content without resizing the layout viewport. | Set `interactive-widget=resizes-content`. | Root viewport. Pinch zoom is also available again. |

The keyboard setting follows [Chrome's viewport guidance](https://developer.chrome.com/blog/viewport-resize-behavior/). Next behavior was checked against the installed 16.3.8 documentation before implementation.

No dependencies, database migrations, write paths, money arithmetic, RLS policies, or shared ledger caches were added.

## Browser measurements

Local production build with demo data, headless Chromium through Edge, touch enabled, 3x device scale, 4x CPU slowdown, 80 ms network latency, and 200 KB/s download throughput. These are representative phone layouts, not physical S25 Ultra measurements. Each before/after value below is one run and subject to timing noise.

| Metric | 412 px before | 412 px after | 390 px before | 390 px after |
| --- | ---: | ---: | ---: | ---: |
| First contentful paint | 2028 ms | 1956 ms | 1852 ms | 1820 ms |
| Largest contentful paint | 2440 ms | 2336 ms | 2372 ms | 2288 ms |
| Add navigation, including visible input | 606 ms | 457 ms | 547 ms | 530 ms |
| Long-task time above 50 ms per task | 138 ms | 126 ms | 117 ms | 124 ms |
| Initial cumulative layout shift | 0 | 0 | 0 | 0 |

The results suggest an improvement in Add navigation, especially at 412 px. They do not establish a statistically reliable speedup or demonstrate faster authenticated database queries. The small long-task increase at 390 px is within this single-run comparison and prevents claiming a uniform improvement.

Home, Add, Activity, Accounts, Budgets, Reports, Settings, and More were checked at both widths. No horizontal overflow or uncaught page errors were observed. Home screenshots were visually inspected at both widths, and the Add layout was checked at a reduced viewport height. Real Android keyboard and gesture behavior still need device verification.

Evidence from this run is in ignored `.tmp/s25-before.json`, `.tmp/s25-after.json`, `.tmp/s25-after-verified.json`, and the corresponding PNG screenshots. The local browser harness is `.tmp/s25-browser.mjs`.

## Connection audit

- The Android wrapper names `luy-manager.vercel.app` as its host. Its public login page returned HTTP 200.
- The deployed browser bundle references `yqacpdhjddmwsvejywpn.supabase.co`. Its JWKS endpoint returned ES256 keys, supporting the existing local signature-verification path.
- Public-key probes of accounts and transactions returned HTTP 200 with zero rows. These confirm those anonymous reads do not expose rows; they are not a full RLS audit.
- The three sequential API probes took 587 ms for JWKS, 466 ms for accounts, and 353 ms for transactions from this machine. These are network observations, not authenticated query-plan measurements or device latency.
- Local `.env.local` references `nrxqisihktxborgrpaje.supabase.co`, which failed DNS resolution. `npm run connect:check` consequently failed. Local credentials were left untouched because switching only a URL could mix credentials from different projects.
- The connected Supabase account did not expose the deployed project, so database advisors, query plans, and actual database region could not be checked. Source configuration requests Vercel region `sin1`; its deployed region was not independently verified.
- The alternative address `luy.kimporkang.com/login` returned HTTP 404 during this audit.

Before an authenticated local preview, restore a matching URL and keys for the intended project. Before attributing remaining delay to the database, profile an authenticated session against the deployed project and inspect its advisors and query plans. Do not change regions or indexes based on these public probes alone.

## Validation and remaining limits

- Typecheck, ESLint, production build, and dash check passed.
- 737 Vitest tests and 3 security regression tests passed.
- Money scanner remained at 6 low findings, 0 medium, 0 high.
- New tests cover overlapping reporting windows, concurrent reads, bounded recent queries, unchanged filtering and ordering, and query error propagation.
- Full Add prefetch spends a bounded background read to reduce the next tap's delay. Existing action revalidation and the 30-second router cache policy still govern freshness.
- At audit completion, changes were validated locally; push and deployment status are tracked separately in the release checks. No physical phone, signed-in production write, offline ledger operation, or actual frame-rate test was performed.
