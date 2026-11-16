// Keep native colors and navigation assets tied to the web design system.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import sharp from "sharp";

const colors = Object.fromEntries([...readFileSync("src/app/globals.css", "utf8")
  .matchAll(/--color-([\w-]+):\s*(#[\da-f]+);/gi)].map((m) => [m[1], m[2]]));
const root = "android/native/app/src/main/res";
const aliases = {
  brand: "brand",
  brand_hover: "brand-hover",
  brand_soft: "brand-soft",
  on_action: "on-action",
  surface: "surface",
  surface_raised: "surface-raised",
  surface_container_low: "surface-container-low",
  surface_container: "surface-container",
  surface_container_high: "surface-container-high",
  surface_variant: "surface-variant",
  ink: "ink",
  muted: "ink-muted",
  faint: "ink-faint",
  fill: "fill",
  track: "track",
  border: "border-strong",
  border_subtle: "border-subtle",
  inflow: "inflow",
  inflow_soft: "inflow-soft",
  outflow: "outflow",
  outflow_soft: "outflow-soft",
  warning: "warning",
  warning_soft: "warning-soft",
  usd: "usd",
  usd_soft: "usd-soft",
  khr: "khr",
  khr_soft: "khr-soft",
  hero: "hero",
  hero_2: "hero-2",
  on_hero: "on-hero",
  hero_usd: "hero-usd",
  hero_khr: "hero-khr",
  chart_1: "chart-1",
  chart_2: "chart-2",
  chart_3: "chart-3",
  chart_4: "chart-4",
  chart_5: "chart-5",
  chart_6: "chart-6",
  chart_other: "chart-other",
};
writeFileSync(`${root}/values/colors.xml`, `<resources>\n${Object.entries(aliases).map(([name, token]) => `    <color name="${name}">${colors[token]}</color>`).join("\n")}\n</resources>\n`);
mkdirSync(`${root}/drawable-nodpi`, { recursive: true });
for (const name of ["home", "paper", "add", "wallet", "meatballs-menu", "pie-chart", "colum-up", "setting-line", "horizontal-switch", "widget"]) {
  const source = name === "paper" ? "public/icons/expense-list.svg" : `public/icons/lets-icons/${name}.svg`;
  const svg = readFileSync(source, "utf8").replaceAll("currentColor", colors.ink);
  await sharp(Buffer.from(svg)).resize(72, 72).png().toFile(`${root}/drawable-nodpi/nav_${name.replaceAll("-", "_")}.png`);
}
console.log("Android resources generated from web tokens and icons.");
