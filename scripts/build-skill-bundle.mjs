#!/usr/bin/env node
// Builds one uploadable Claude skill that carries the whole project context.
//
// claude.ai takes a single skill per upload, but the context an agent needs here is
// split across three skills plus the product spec. This script joins them into
// dist/luy-manager/ and zips it, so the upload is one file.
//
// It generates rather than duplicates on purpose. .claude/skills/multi-currency-money
// is a hand copy of the money skill that now has to be kept in sync by memory, and the
// README warns that editing one silently disagrees with the other. A fourth copy of the
// same prose would repeat that at four times the size. The sources stay the single
// truth; this output is disposable and gitignored.
//
// Usage: node scripts/build-skill-bundle.mjs [--check]
//   --check validates the sources and the composition without writing anything.

import { createHash } from "node:crypto";
import { deflateRawSync } from "node:zlib";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bundleName = "luy-manager";
const distDir = join(repoRoot, "dist");
const bundleDir = join(distDir, bundleName);
const zipPath = join(distDir, `${bundleName}.zip`);
const checkOnly = process.argv.includes("--check");

// claude.ai truncates at 200 even though the Agent Skills spec allows 1024, and a
// truncated description is how a skill quietly stops being selected for its own work.
const DESCRIPTION_LIMIT = 200;

// The comma after the name is load-bearing. "Luy Manager: a Cambodia..." reads better
// and is invalid YAML: a plain scalar cannot contain a colon followed by a space, so
// the frontmatter fails to parse, and a skill whose frontmatter does not parse is
// accepted by the uploader and then never triggers. assertPlainScalar below enforces it.
const description =
  "Luy Manager, a Cambodia dual-currency finance app on Next.js 16 and Supabase. " +
  "Use when changing this repository, touching money or currency, writing migrations " +
  "or RLS, or building the Telegram bot.";

// Each part keeps the heading levels it was written with. Nesting the parts under one
// h1 by demoting headings is the obvious move and it is wrong twice over: two of these
// skills already use h6, so demoting emits ####### which is not a heading at all, and
// the telegram skill has shell comments starting with # inside code fences that a
// line-based rewrite would turn into headings.
const parts = [
  {
    dir: "luy-manager-project",
    label: "Part 1: the repository",
    summary:
      "Layer boundaries, the migration and RLS workflow, the server action shape, " +
      "design tokens, CI gates, and the traps that have already caused bugs here.",
    // Every rule must match, so renaming a reference in a source skill fails this
    // build instead of shipping a skill whose links point at nothing.
    rewrites: [
      [
        "docs/Cambodia_Personal_Finance_App_PRD.md",
        "references/product-requirements.md",
      ],
      [
        ".claude/skills/luy-manager-money/scripts/check-money-safety.mjs",
        "scripts/check-money-safety.mjs",
      ],
      ["`.claude/skills/luy-manager-money/SKILL.md`", "part 2 of this skill (money)"],
      [
        "`.claude/skills/luy-manager-telegram/SKILL.md`",
        "part 3 of this skill (chat bots that write to a ledger)",
      ],
    ],
  },
  {
    dir: "luy-manager-money",
    label: "Part 2: money",
    summary:
      "Integer minor units, the zero-decimal riel, rounding, splits that sum back to " +
      "the original, and conversion that records the rate it used.",
    rewrites: [
      ["references/currency-data.md", "references/money/currency-data.md"],
      ["references/review-checklist.md", "references/money/review-checklist.md"],
    ],
  },
  {
    dir: "luy-manager-telegram",
    label: "Part 3: chat bots that write to a ledger",
    summary:
      "Intent parsing, deep-link account binding, and the fact that a webhook has no " +
      "session, so Row Level Security is absent rather than weakened.",
    rewrites: [
      ["references/message-grammar.md", "references/telegram/message-grammar.md"],
      ["references/review-checklist.md", "references/telegram/review-checklist.md"],
    ],
  },
];

// Copied beside SKILL.md so the bundle is self-contained. An uploaded skill cannot
// reach the repository it describes, so anything the body cites has to travel with it.
const extraFiles = [
  {
    from: "docs/Cambodia_Personal_Finance_App_PRD.md",
    to: "references/product-requirements.md",
    note:
      "Product intent, including features not built yet. Not a description of " +
      "current behaviour.",
    required: true,
  },
  {
    from: "docs/SETUP.md",
    to: "references/setup-guide.md",
    note: "Cloning, Supabase, Google sign-in, deploying, and connecting the bot.",
    // Optional so this builds on any branch, and starts including the guide by itself
    // once the branch that adds it lands.
    required: false,
  },
];

const problems = [];
const fail = (message) => problems.push(message);

const readText = (absolutePath) =>
  readFileSync(absolutePath, "utf8").replace(/\r\n/g, "\n");

// Deliberately strict. Frontmatter that does not parse is accepted by the uploader and
// then never triggers, which presents as "the skill does nothing".
function splitFrontmatter(text, sourceLabel) {
  if (!text.startsWith("---\n")) {
    fail(`${sourceLabel}: does not start with YAML frontmatter`);
    return { meta: {}, body: text };
  }
  const end = text.indexOf("\n---\n", 3);
  if (end === -1) {
    fail(`${sourceLabel}: frontmatter is never closed`);
    return { meta: {}, body: text };
  }
  const meta = {};
  for (const line of text.slice(4, end + 1).split("\n")) {
    const match = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (match) meta[match[1]] = match[2].trim();
  }
  for (const key of ["name", "description"]) {
    if (!meta[key]) fail(`${sourceLabel}: frontmatter is missing "${key}"`);
  }
  return { meta, body: text.slice(end + 5).replace(/^\n+/, "") };
}

function applyRewrites(body, rewrites, sourceLabel) {
  let out = body;
  for (const [from, to] of rewrites) {
    if (!out.includes(from)) {
      fail(
        `${sourceLabel}: expected to rewrite "${from}" but it is absent. A source ` +
          `skill changed; update the rule in scripts/build-skill-bundle.mjs.`,
      );
      continue;
    }
    out = out.split(from).join(to);
  }
  return out;
}

const loaded = parts.map((part) => {
  const skillPath = join(repoRoot, ".claude", "skills", part.dir, "SKILL.md");
  const label = `.claude/skills/${part.dir}/SKILL.md`;
  if (!existsSync(skillPath)) {
    fail(`${label}: missing`);
    return { ...part, body: "" };
  }
  const { body } = splitFrontmatter(readText(skillPath), label);
  return { ...part, body: applyRewrites(body, part.rewrites, label) };
});

// Notes for the files copied beside SKILL.md, keyed by their path in the bundle. Every
// copied file has to appear here, so adding a reference to a source skill without
// describing it fails the build instead of shipping a file nothing points at. That
// failure is not hypothetical: luy-manager-project/SKILL.md never links its own
// references/codebase-map.md, so in the repository nothing tells an agent to open it.
const fileNotes = {
  "references/project/codebase-map.md":
    'Where a given change belongs, with real paths. Answers "where does this go".',
  "references/money/currency-data.md":
    "Exact minor-unit exponents and formatting rules per currency.",
  "references/money/review-checklist.md":
    "Money review, ordered by how quietly each failure does its damage.",
  "references/telegram/message-grammar.md":
    "Every message the bot accepts, and how the ambiguous parts resolve.",
  "references/telegram/review-checklist.md":
    "Webhook bot audit, starting with the authorization miss that exposes every user.",
  "scripts/check-money-safety.mjs":
    "Scanner for float-money antipatterns. Used as a CI gate.",
  "scripts/telegram-webhook.mjs": "Register, inspect and remove the bot's webhook.",
};

const bundled = [];
for (const part of loaded) {
  const namespace = part.dir.replace(/^luy-manager-/, "");
  for (const kind of ["references", "scripts"]) {
    const dir = join(repoRoot, ".claude", "skills", part.dir, kind);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir).sort()) {
      if (!statSync(join(dir, entry)).isFile()) continue;
      // References are namespaced because money and telegram both ship a
      // review-checklist.md and one would overwrite the other. Script names are
      // already unique, and CI cites the money scanner by that flat path.
      const to =
        kind === "references" ? `references/${namespace}/${entry}` : `scripts/${entry}`;
      if (bundled.some((file) => file.to === to)) {
        fail(`two sources both produce ${to}`);
        continue;
      }
      if (!fileNotes[to]) {
        fail(`${to}: copied from ${part.dir} but has no entry in fileNotes`);
      }
      bundled.push({
        from: `.claude/skills/${part.dir}/${kind}/${entry}`,
        to,
        note: fileNotes[to] ?? "",
      });
    }
  }
}

for (const file of extraFiles) {
  const present = existsSync(join(repoRoot, file.from));
  if (!present) {
    if (file.required) fail(`${file.from}: missing and required`);
    continue;
  }
  bundled.push(file);
}

// Both tables are generated from the manifest actually used, so neither can promise a
// file the bundle does not ship, and every bundled file is listed somewhere an agent
// will read.
const partRows = loaded.map((part) => [part.label, `\`${part.dir}\``, part.summary]);
const fileRows = bundled.map((file) => [`\`${file.to}\``, `\`${file.from}\``, file.note]);

const skillDoc = `---
name: ${bundleName}
description: ${description}
---

<!-- Generated by scripts/build-skill-bundle.mjs. Edit the sources under
     .claude/skills/ and rebuild; edits to this file are lost on the next build. -->

# Luy Manager, whole project context

Three skills joined into one upload, plus the files they cite. Each part below keeps its
own heading structure and reads as it does in the repository. Read the part you need
rather than all three.

| Part | Source skill | Covers |
| --- | --- | --- |
${partRows.map(([a, b, c]) => `| ${a} | ${b} | ${c} |`).join("\n")}

Supporting files ship alongside this one and are worth opening when the work touches
them:

| File | Source | Covers |
| --- | --- | --- |
${fileRows.map(([a, b, c]) => `| ${a} | ${b} | ${c} |`).join("\n")}

Working in a clone rather than reading this upload? The sources are separate skills
under \`.claude/skills/\` and are picked up automatically.

${loaded.map((part) => `---\n\n${part.body.trimEnd()}`).join("\n\n")}
`;

if (description.length > DESCRIPTION_LIMIT) {
  fail(
    `description is ${description.length} characters, ` +
      `${description.length - DESCRIPTION_LIMIT} over the ${DESCRIPTION_LIMIT} ` +
      `that claude.ai allows`,
  );
}

// The frontmatter is emitted unquoted, so the value has to survive as a plain YAML
// scalar. Rather than quote and hope the escaping is right, refuse the characters that
// make quoting necessary.
function assertPlainScalar(field, value) {
  if (value.includes(": ")) {
    fail(`${field}: contains ": ", which ends a plain YAML scalar. Use a comma instead.`);
  }
  if (value.includes(" #")) {
    fail(`${field}: contains " #", which starts a YAML comment. Reword it.`);
  }
  if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(value)) {
    fail(`${field}: starts with "${value[0]}", which YAML reads as punctuation. Reword it.`);
  }
  if (value !== value.trim() || /\n/.test(value)) {
    fail(`${field}: must be a single trimmed line.`);
  }
}

assertPlainScalar("description", description);
assertPlainScalar("name", bundleName);

const files = new Map([["SKILL.md", Buffer.from(skillDoc, "utf8")]]);
for (const file of bundled) {
  files.set(file.to, readFileSync(join(repoRoot, file.from)));
}

// The two tables cite repository paths in their Source column on purpose, and the
// generated comment names this script. Neither is an instruction to follow a link, so
// both are excluded from the link checks below.
const prose = skillDoc
  .replace(/<!--[\s\S]*?-->/g, "")
  .split("\n")
  .filter((line) => !line.startsWith("|"))
  .join("\n");

// The reverse of the rewrite check: a link that survived, still pointing at a
// repository path an upload cannot open.
for (const stale of [".claude/skills/luy-manager", "docs/Cambodia", "docs/SETUP"]) {
  prose.split("\n").forEach((line, index) => {
    if (line.includes(stale)) {
      fail(`composed SKILL.md still points at "${stale}" (near prose line ${index + 1})`);
    }
  });
}

// Every relative path the prose cites has to exist in the bundle. This is the check
// that catches a namespaced reference whose link was never updated.
for (const match of prose.matchAll(/(?:^|[\s(`])((?:references|scripts)\/[\w./-]+)/gm)) {
  const cited = match[1].replace(/[.,)`]+$/, "");
  if (!files.has(cited)) {
    fail(`composed SKILL.md cites ${cited}, which the bundle does not contain`);
  }
}

if (problems.length > 0) {
  console.error(`Skill bundle build failed with ${problems.length} problem(s):\n`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

if (checkOnly) {
  console.log(
    `Sources and composition are valid: ${files.size} files, ` +
      `description ${description.length}/${DESCRIPTION_LIMIT} characters.`,
  );
  process.exit(0);
}

// A minimal zip writer. Node ships deflate but no archiver, and the alternatives are
// worse than 60 lines: a dependency for one build step, or shelling out to zip or
// Compress-Archive, which then only works on one operating system.
function dosStamp() {
  // Fixed at the zip epoch (1980-01-01) so identical sources produce an identical
  // archive. Real mtimes are not preserved by git, so using them would make the
  // output differ per clone for no gain.
  return { time: 0, date: 0x0021 };
}

const crcTable = Int32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buffer) {
  let c = ~0;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

function buildZip(entries, rootDir) {
  const { time, date } = dosStamp();
  const locals = [];
  const central = [];
  let offset = 0;

  // Directory entries are not required by the format, but zip and Compress-Archive
  // both emit them, and this archive gets uploaded to a parser I cannot inspect.
  const dirs = new Set([`${rootDir}/`]);
  for (const path of entries.keys()) {
    const segments = path.split("/").slice(0, -1);
    for (let i = 0; i < segments.length; i += 1) {
      dirs.add(`${rootDir}/${segments.slice(0, i + 1).join("/")}/`);
    }
  }

  const members = [
    ...[...dirs].sort().map((name) => ({ name, data: Buffer.alloc(0), dir: true })),
    ...[...entries]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([path, data]) => ({ name: `${rootDir}/${path}`, data, dir: false })),
  ];

  for (const member of members) {
    const name = Buffer.from(member.name, "utf8");
    const stored = member.dir ? Buffer.alloc(0) : deflateRawSync(member.data, { level: 9 });
    const method = member.dir ? 0 : 8;
    const crc = member.dir ? 0 : crc32(member.data);

    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // filenames are UTF-8
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(stored.length, 18);
    local.writeUInt32LE(member.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    locals.push(local, stored);

    const header = Buffer.alloc(46 + name.length);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(0x031e, 4); // made on unix, so the mode below is read
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0x0800, 8);
    header.writeUInt16LE(method, 10);
    header.writeUInt16LE(time, 12);
    header.writeUInt16LE(date, 14);
    header.writeUInt32LE(crc, 16);
    header.writeUInt32LE(stored.length, 20);
    header.writeUInt32LE(member.data.length, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt32LE(member.dir ? 0x41ed0010 : 0x81a40000, 38); // 0755 dir, 0644 file
    header.writeUInt32LE(offset, 42);
    name.copy(header, 46);
    central.push(header);

    offset += local.length + stored.length;
  }

  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(members.length, 8);
  end.writeUInt16LE(members.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, directory, end]);
}

rmSync(bundleDir, { recursive: true, force: true });
for (const [path, data] of files) {
  const target = join(bundleDir, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, data);
}

const archive = buildZip(files, bundleName);
writeFileSync(zipPath, archive);

const unpacked = [...files.values()].reduce((sum, buffer) => sum + buffer.length, 0);
console.log(`Wrote ${relative(repoRoot, bundleDir)}/ and ${relative(repoRoot, zipPath)}`);
console.log(
  `  ${files.size} files, ${(unpacked / 1024).toFixed(1)} KiB unpacked, ` +
    `${(archive.length / 1024).toFixed(1)} KiB zipped`,
);
console.log(`  description ${description.length}/${DESCRIPTION_LIMIT} characters`);
console.log(`  sha256 ${createHash("sha256").update(archive).digest("hex")}`);
for (const path of [...files.keys()].sort()) console.log(`    ${bundleName}/${path}`);
