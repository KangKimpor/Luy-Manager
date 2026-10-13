import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { parseTheme, themeColors } from "./theme-preference";

test("system is the safe default and viewport colors follow explicit choices", () => {
  for (const value of [undefined, "", "invalid"]) expect(parseTheme(value)).toBe("system");
  expect(parseTheme("dark")).toBe("dark");
  expect(themeColors("system")).toHaveLength(2);
  expect(themeColors("dark")[0]).not.toHaveProperty("media");
  expect(themeColors("light")[0].color).not.toBe(themeColors("dark")[0].color);
});

function luminance(hex: string) {
  const rgb = hex.match(/[a-f\d]{2}/gi)!.map(value => {
    const channel = parseInt(value, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}

test("dark tokens cover the light palette and text meets AA contrast", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  const palette = (block: string) => Object.fromEntries([...block.matchAll(/--color-([\w-]+): (#[a-f\d]+);/g)].map(match => [match[1], match[2]]));
  const light = palette(css.split(':root[data-theme="dark"]')[0]);
  const darkBlock = css.split(':root[data-theme="dark"]')[1].split("}")[0];
  const dark = palette(darkBlock);
  expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
  expect(palette(css.split(':root:not([data-theme="light"])')[1].split("}")[0])).toEqual(dark);
  for (const colors of [light, dark]) {
    for (const token of ["ink", "ink-muted", "ink-faint", "brand", "inflow", "outflow"]) {
      for (const background of ["surface", "surface-muted"]) {
        const values = [luminance(colors[token]), luminance(colors[background])].sort((a, b) => b - a);
        expect((values[0] + 0.05) / (values[1] + 0.05), `${token} on ${background}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  }
});
