import { unstable_doesMiddlewareMatch as doesProxyMatch } from "next/experimental/testing/server";
import { expect, test } from "vitest";

import { config } from "./proxy";

test("the secret-authenticated webhook skips session refresh while ledger routes keep it", () => {
  for (const [url, matches] of [
    ["/api/telegram/webhook", false], ["/api/telegram/webhook?probe=1", false],
    ["/api/telegram/webhook-fake", true], ["/transactions", true], ["/add", true],
  ] as const) {
    expect(doesProxyMatch({ config, nextConfig: {}, url })).toBe(matches);
  }
});
