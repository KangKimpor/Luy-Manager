/**
 * Setup for component tests.
 *
 * `cleanup` is registered explicitly. Testing Library only wires its own automatic
 * cleanup when the test framework's globals are injected, and this project does not
 * enable `globals`, so without this every `render` would stack another copy of the
 * component into the same document — and queries would fail with "found multiple
 * elements" in a way that looks like a component bug rather than a setup one.
 *
 * jest-dom adds the matchers that make assertions about a rendered control read
 * plainly: `toBeDisabled()` rather than inspecting an attribute by hand.
 */

import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
