#!/usr/bin/env node
/**
 * Fails if an em dash or en dash appears anywhere under `src/`.
 *
 * The house style is no em dashes in the application, in UI strings and in the
 * comments alongside them. Style rules that nothing enforces drift, and this one
 * had: 81 of them had accumulated across 42 files before this check existed.
 *
 * Scope is deliberately `src/` only. Migrations, docs and the skill references are
 * prose for maintainers rather than part of the app, and are left alone.
 *
 * The fix is never to swap in a hyphen. Rewrite the sentence with a colon, comma,
 * period or parentheses so it still reads naturally.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "src");

// Anything that ships or is read as source. Fonts and images cannot hold prose.
const TEXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".css", ".json", ".webmanifest", ".md"]);

const BANNED = [
  ["\u2014", "em dash"],
  ["\u2013", "en dash"],
];

/** Every text file under a directory, recursively. */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      out.push(...walk(path));
    } else if (TEXT.has(entry.slice(entry.lastIndexOf(".")))) {
      out.push(path);
    }
  }
  return out;
}

const findings = [];
for (const path of walk(SRC)) {
  const lines = readFileSync(path, "utf8").split("\n");
  lines.forEach((line, index) => {
    for (const [char, name] of BANNED) {
      if (line.includes(char)) {
        findings.push({
          file: relative(ROOT, path),
          line: index + 1,
          name,
          text: line.trim(),
        });
      }
    }
  });
}

if (findings.length === 0) {
  console.log("No em dashes or en dashes in src/.");
  process.exit(0);
}

console.error(`${findings.length} banned dash character(s) in src/:\n`);
for (const finding of findings) {
  console.error(`  ${finding.file}:${finding.line}  ${finding.name}`);
  console.error(`    ${finding.text.slice(0, 100)}`);
}
console.error(
  "\nRewrite with a colon, comma, period or parentheses so the sentence still reads\n" +
    "naturally. Do not simply substitute a hyphen.",
);
process.exit(1);
