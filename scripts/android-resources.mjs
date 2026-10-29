// Keep native colors and navigation assets tied to the web design system.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import sharp from "sharp";

const colors = Object.fromEntries([...readFileSync("src/app/globals.css", "utf8")
  .matchAll(/--color-([\w-]+):\s*(#[\da-f]+);/gi)].map((m) => [m[1], m[2]]));
const root = "android/native/app/src/main/res";
const aliases = { brand: "brand", surface: "surface-muted", surface_raised: "surface", ink: "ink", muted: "ink-muted", outflow: "outflow", inflow: "inflow", hero: "hero", on_hero: "on-hero", brand_soft: "brand-soft", border: "surface-variant", on_action: "on-action" };
writeFileSync(`${root}/values/colors.xml`, `<resources>\n${Object.entries(aliases).map(([name, token]) => `    <color name="${name}">${colors[token]}</color>`).join("\n")}\n</resources>\n`);
mkdirSync(`${root}/drawable-nodpi`, { recursive: true });
for (const name of ["home", "paper", "add", "wallet", "meatballs-menu", "pie-chart", "colum-up", "setting-line", "horizontal-switch", "widget"]) {
  const source = name === "paper" ? "public/icons/expense-list.svg" : `public/icons/lets-icons/${name}.svg`;
  const svg = readFileSync(source, "utf8").replaceAll("currentColor", colors.ink);
  await sharp(Buffer.from(svg)).resize(72, 72).png().toFile(`${root}/drawable-nodpi/nav_${name.replaceAll("-", "_")}.png`);
}
console.log("Android resources generated from web tokens and icons.");
