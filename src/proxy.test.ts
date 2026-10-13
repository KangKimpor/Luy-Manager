import { createRequire } from "node:module";
import { expect, test } from "vitest";
import { PROXY_MATCHER } from "./proxy";

const { pathToRegexp } = createRequire(import.meta.url)("next/dist/compiled/path-to-regexp") as { pathToRegexp: (pattern: string) => RegExp };

test.each(["/", "/reports", "/api/rates/refresh", "/sw.js/private", "/manifest.webmanifest/private"])("protects %s", (path) => {
  expect(pathToRegexp(PROXY_MATCHER).test(path)).toBe(true);
});
test.each(["/sw.js", "/manifest.webmanifest", "/.well-known/assetlinks.json", "/_next/static/x.js", "/api/telegram/webhook", "/api/telegram/webhook/extra"])("skips %s", (path) => {
  expect(pathToRegexp(PROXY_MATCHER).test(path)).toBe(false);
});
