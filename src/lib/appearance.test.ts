import { describe, expect, it } from "vitest";

import {
  appearanceThemeAttribute,
  DEFAULT_APPEARANCE,
  isAppearance,
  parseAppearance,
} from "./appearance";

describe("appearance", () => {
  it("accepts only light, dark, and system", () => {
    expect(isAppearance("light")).toBe(true);
    expect(isAppearance("dark")).toBe(true);
    expect(isAppearance("system")).toBe(true);
    expect(isAppearance("auto")).toBe(false);
    expect(isAppearance(null)).toBe(false);
  });

  it("falls back to system for unrecognised values", () => {
    expect(parseAppearance("light")).toBe("light");
    expect(parseAppearance("dark")).toBe("dark");
    expect(parseAppearance("system")).toBe("system");
    expect(parseAppearance("garbage")).toBe(DEFAULT_APPEARANCE);
    expect(parseAppearance(undefined)).toBe("system");
    expect(parseAppearance(null)).toBe("system");
  });

  it("sets data-theme only for explicit light or dark", () => {
    expect(appearanceThemeAttribute("light")).toBe("light");
    expect(appearanceThemeAttribute("dark")).toBe("dark");
    expect(appearanceThemeAttribute("system")).toBeUndefined();
  });
});
