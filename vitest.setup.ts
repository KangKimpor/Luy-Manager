/**
 * Test setup.
 *
 * Runs for every test file, including the node-environment ones, so anything here
 * has to be safe without a DOM.
 */

import { afterEach, vi } from "vitest";

// `crypto.randomUUID` is used to generate transfer group ids and draft row keys.
// Node 20+ provides it, but jsdom's window does not always expose it.
if (typeof globalThis.crypto === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  globalThis.crypto = require("node:crypto").webcrypto;
}

afterEach(() => {
  vi.restoreAllMocks();
});
