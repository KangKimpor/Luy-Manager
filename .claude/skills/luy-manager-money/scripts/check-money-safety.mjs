#!/usr/bin/env node
/**
 * check-money-safety - flags float-money antipatterns in a codebase.
 *
 * Heuristic and deliberately noisy at low confidence: a false positive costs a
 * glance, a missed float-money bug costs a reconciliation. Read every hit and
 * judge it; do not treat a clean run as proof of correctness.
 *
 * Usage:
 *   node check-money-safety.mjs [dir ...] [--quiet] [--json]
 *
 * Exit codes:
 *   0  nothing, or only low-confidence notes
 *   1  at least one high-confidence finding
 *   2  bad usage
 *
 * No dependencies. Runs on Node 18+.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build", "out",
  "coverage", ".turbo", ".vercel", "vendor", "__pycache__",
]);

const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".sql", ".prisma"]);

/** Words that mark a line as money-related. Keeps generic maths out of results. */
const MONEY_WORDS =
  /amount|price|total|balance|cost|fee|salary|money|currency|payment|paid|charge|refund|subtotal|discount|tax|budget|spend|income|expense|minor|cent|usd|khr|eur|gbp/i;

/** A comment line. Findings in prose are noise, and prose about money is common. */
const COMMENT = /^\s*(\/\/|\/\*|\*|--|#)/;

/**
 * A line whose decimals belong to a CSS class or style, not to money.
 * Tailwind alone produces py-2.5, gap-1.5, min-h-9 in volume.
 */
const STYLING =
  /class(Name)?\s*=|^\s*["'`][\w\s.:/[\]%-]+["'`],?\s*$|tw`|styled\.|(^|\s)(flex|grid|rounded|border|px|py|gap|text|font|min-h|max-w)-/;

/** Percentages are not money, even on a line that mentions spending. */
const PERCENTAGE = /percent|share|ratio|rate\s*\*|\*\s*100\b.*percent/i;

const RULES = [
  {
    id: "float-parse",
    severity: "high",
    test: (line) => /\b(parseFloat|Number\.parseFloat)\s*\(/.test(line) && MONEY_WORDS.test(line),
    message: "parseFloat on a money value reintroduces binary float error.",
    fix: "Parse to an integer count of minor units instead.",
  },
  {
    id: "tofixed-roundtrip",
    severity: "high",
    test: (line) =>
      /\.toFixed\s*\(/.test(line) &&
      /(Number\s*\(|parseFloat|parseInt|\+\s*[a-z_$])/i.test(line),
    message: "toFixed() result is being parsed back into a number.",
    fix: "toFixed is for display only. Keep the integer and format at the boundary.",
  },
  {
    id: "float-column",
    severity: "high",
    onlyExt: [".sql", ".prisma"],
    test: (line) =>
      /\b(float|double\s+precision|double|real)\b/i.test(line) && MONEY_WORDS.test(line),
    message: "Money column declared as a floating-point type.",
    fix: "Use BIGINT minor units, or NUMERIC(19,4) read through a decimal library.",
  },
  {
    id: "money-type",
    severity: "medium",
    onlyExt: [".sql", ".prisma"],
    // SQL is case-insensitive, so `money`, `MONEY` and `Money` are the same
    // type. Requires a preceding identifier so the word "money" inside a
    // column name or comment does not match.
    test: (line) =>
      /^\s*[a-z_][a-z0-9_]*\s+(money|smallmoney)\b/i.test(line) && !/^\s*(--|\/\*|\*)/.test(line),
    message: "The SQL MONEY type has locale-dependent behaviour and fixed scale.",
    fix: "Use BIGINT minor units instead.",
  },
  {
    id: "bare-math-round",
    severity: "medium",
    test: (line) =>
      /Math\.round\s*\(/.test(line) &&
      MONEY_WORDS.test(line) &&
      // Already handling sign explicitly. Matches both Math.sign(x) and a
      // precomputed `sign` variable, and `magnitude` as an absolute value.
      !/\babs\b|Math\.abs|\bsign\b|\bmagnitude\b/i.test(line) &&
      !PERCENTAGE.test(line),
    message: "Math.round is asymmetric on negatives: Math.round(-2.5) === -2.",
    fix: "Round half away from zero: Math.sign(x) * Math.round(Math.abs(x)).",
  },
  {
    id: "hardcoded-two-decimals",
    severity: "medium",
    test: (line) =>
      /(toFixed\s*\(\s*2\s*\)|[*/]\s*100\b|\bminimumFractionDigits\s*:\s*2)/.test(line) &&
      MONEY_WORDS.test(line) &&
      // x * 100 is a percentage far more often than a cents conversion.
      !PERCENTAGE.test(line),
    message: "Two decimal places assumed. Breaks KHR, JPY, KRW, VND (zero) and BHD, KWD (three).",
    fix: "Derive the scale from per-currency metadata.",
  },
  {
    id: "naive-split",
    severity: "medium",
    test: (line) =>
      /\/\s*(count|parts|n|length|people|shares|split)\b/i.test(line) && MONEY_WORDS.test(line),
    message: "Dividing money by a count loses or invents minor units.",
    fix: "Distribute the remainder so the parts sum to the original exactly.",
  },
  {
    id: "float-literal",
    severity: "low",
    test: (line) =>
      /\b\d+\.\d{1,2}\b/.test(line) &&
      MONEY_WORDS.test(line) &&
      !STYLING.test(line) &&
      !/\b(version|node|es20|tailwind)\b/i.test(line),
    message: "Decimal literal in a money context. It may be a major-unit value.",
    fix: "If it is money, express it in minor units or route it through fromMajor().",
  },
  {
    id: "cross-currency-sum",
    severity: "low",
    // Needs a call or operator, so prose mentioning "sum" does not match.
    test: (line) =>
      /\b(sum|reduce)\s*\(|\btotal\s*[+]?=/i.test(line) &&
      /amount/i.test(line) &&
      !/currenc/i.test(line),
    message: "Aggregation over amounts with no visible currency handling.",
    fix: "Confirm every row shares a currency, or convert before summing.",
  },
];

function collect(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith(".")) collect(full, out);
    } else if (CODE_EXT.has(extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Path for display: relative when the file sits under the working directory,
 * absolute otherwise. A relative path that escapes upward reads as
 * "../../../../AppData/..." and is harder to act on than the full path.
 */
function displayPath(file, root) {
  const rel = relative(root, file);
  if (rel === "" || rel.startsWith("..")) return file.split(sep).join("/");
  return rel.split(sep).join("/");
}

function scanFile(file, root) {
  const ext = extname(file);
  const findings = [];
  let lines;

  try {
    lines = readFileSync(file, "utf8").split(/\r?\n/);
  } catch {
    return findings;
  }

  // Test files legitimately contain decimal literals as expected values.
  const isTest = /\.(test|spec)\.[jt]sx?$/.test(file);

  lines.forEach((line, index) => {
    if (line.length > 500) return;

    // Comments describing money logic are not money logic. Scanning them
    // produced most of this tool's false positives, and a noisy scanner gets
    // ignored, which is worse than no scanner.
    if (COMMENT.test(line)) return;

    // Strip trailing comments too: `balance: 184_250, // $1,842.50` should not
    // match on the decimal that only appears in the annotation.
    const code = line.replace(/\s+(\/\/|--\s).*$/, "");

    for (const rule of RULES) {
      if (rule.onlyExt && !rule.onlyExt.includes(ext)) continue;
      if (isTest && rule.severity === "low") continue;
      if (!rule.test(code)) continue;

      findings.push({
        file: displayPath(file, root),
        line: index + 1,
        rule: rule.id,
        severity: rule.severity,
        message: rule.message,
        fix: rule.fix,
        source: line.trim().slice(0, 120),
      });
    }
  });

  return findings;
}

// --- main ---

const argv = process.argv.slice(2);
const asJson = argv.includes("--json");
const quiet = argv.includes("--quiet");
const targets = argv.filter((a) => !a.startsWith("--"));
const roots = targets.length > 0 ? targets : ["."];

for (const root of roots) {
  try {
    statSync(root);
  } catch {
    process.stderr.write(`check-money-safety: no such path: ${root}\n`);
    process.exit(2);
  }
}

const root = process.cwd();
const findings = roots.flatMap((r) => collect(r).flatMap((f) => scanFile(f, root)));

const rank = { high: 0, medium: 1, low: 2 };
findings.sort((a, b) => rank[a.severity] - rank[b.severity] || a.file.localeCompare(b.file) || a.line - b.line);

const counts = { high: 0, medium: 0, low: 0 };
for (const f of findings) counts[f.severity] += 1;

if (asJson) {
  process.stdout.write(`${JSON.stringify({ counts, findings }, null, 2)}\n`);
} else if (findings.length === 0) {
  process.stdout.write("check-money-safety: no antipatterns detected.\n");
  process.stdout.write("This is a heuristic scan, not a proof. Review the checklist too.\n");
} else {
  const LABEL = { high: "HIGH  ", medium: "MEDIUM", low: "LOW   " };
  let lastFile = "";

  for (const f of findings) {
    if (quiet && f.severity === "low") continue;
    if (f.file !== lastFile) {
      process.stdout.write(`\n${f.file}\n`);
      lastFile = f.file;
    }
    process.stdout.write(`  ${LABEL[f.severity]} line ${f.line}  [${f.rule}]\n`);
    process.stdout.write(`         ${f.message}\n`);
    process.stdout.write(`    fix: ${f.fix}\n`);
    process.stdout.write(`    >    ${f.source}\n`);
  }

  process.stdout.write(
    `\n${findings.length} finding(s): ${counts.high} high, ${counts.medium} medium, ${counts.low} low\n`,
  );
}

process.exit(counts.high > 0 ? 1 : 0);
