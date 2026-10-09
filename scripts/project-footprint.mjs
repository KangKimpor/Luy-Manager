#!/usr/bin/env node
// Reports storage without traversing links. Deletion is opt-in and limited to
// named build artifacts, so credentials, source, dependencies and Git stay intact.
import { existsSync, lstatSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const GENERATED = [
  ".tmp/vitest",
  ".next/cache",
  ".next/dev/cache",
  "coverage",
  "dist/luy-manager",
  "dist/luy-manager.zip",
  "tsconfig.tsbuildinfo",
];

export function directoryBytes(path) {
  if (!existsSync(path)) return 0;
  const entry = lstatSync(path);
  if (entry.isSymbolicLink()) return 0;
  if (!entry.isDirectory()) return entry.size;
  return readdirSync(path).reduce((total, name) => total + directoryBytes(join(path, name)), 0);
}

function assertNoLinks(path) {
  const entry = lstatSync(path);
  if (entry.isSymbolicLink()) throw new Error(`Refusing to remove a linked path: ${path}`);
  if (entry.isDirectory()) {
    for (const name of readdirSync(path)) assertNoLinks(join(path, name));
  }
}

function checkedTarget(repoRoot, name) {
  const root = realpathSync(repoRoot);
  const path = resolve(root, name);
  const local = relative(root, path);
  if (!local || local.startsWith("..") || isAbsolute(local)) {
    throw new Error(`Target is outside the project: ${name}`);
  }
  if (!existsSync(path)) return null;
  // Check ancestors as well as contents: a linked dist/cache directory must not
  // turn an allowlisted child into a removal outside this repository.
  let ancestor = path;
  while (ancestor !== root) {
    if (lstatSync(ancestor).isSymbolicLink()) throw new Error(`Refusing a linked target: ${name}`);
    ancestor = dirname(ancestor);
  }
  const actual = relative(root, realpathSync(path));
  if (actual.startsWith("..") || isAbsolute(actual)) throw new Error(`Target escaped the project: ${name}`);
  assertNoLinks(path);
  return path;
}

export function generatedFootprint(repoRoot, { clean = false, includeBuild = false, stopped = false } = {}) {
  if (!existsSync(join(repoRoot, "package.json")) || !existsSync(join(repoRoot, "src"))) {
    throw new Error("Run this against a Luy Manager project containing package.json and src.");
  }
  if (clean && (!stopped || [".next/lock", ".next/dev/lock"].some((name) => existsSync(join(repoRoot, name))))) {
    throw new Error("Stop the dev server, production server and build first, then add --stopped. Active Next.js locks also block cleanup.");
  }
  const names = includeBuild
    ? [".next", ...GENERATED.filter((name) => !name.startsWith(".next/"))]
    : GENERATED;
  // Validate the whole deletion plan before changing even one file.
  const plan = names.map((name) => {
    const path = checkedTarget(repoRoot, name);
    return { name, path, bytes: path ? directoryBytes(path) : 0 };
  }).filter((entry) => entry.path);
  if (clean) {
    for (const entry of plan) rmSync(entry.path, { recursive: true, force: true });
  }
  return plan;
}

const invokedPath = process.argv[1] && resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const allowed = ["--clean", "--include-build", "--stopped", "--help"];
  if (args.some((arg) => !allowed.includes(arg))) {
    process.stderr.write("Unknown option. Use --help.\n");
    process.exitCode = 1;
  } else if (args.includes("--help")) {
    process.stdout.write("Usage: node scripts/project-footprint.mjs [--include-build] [--clean --stopped]\nDefault: report only. --include-build also selects .next. Stop all servers before cleaning.\n");
  } else {
    try {
      const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
      const clean = args.includes("--clean");
      const plan = generatedFootprint(root, {
        clean,
        includeBuild: args.includes("--include-build"),
        stopped: args.includes("--stopped"),
      });
      const mib = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
      for (const name of ["src", "public", "node_modules", ".next", ".git"]) {
        process.stdout.write(`${name}: ${mib(directoryBytes(join(root, name)))}\n`);
      }
      process.stdout.write(`\n${clean ? "Removed" : "Cleanup preview"}:\n`);
      for (const entry of plan) process.stdout.write(`  ${entry.name}: ${mib(entry.bytes)}\n`);
      process.stdout.write(`Total ${clean ? "removed" : "regenerable"}: ${mib(plan.reduce((sum, entry) => sum + entry.bytes, 0))}\n`);
      if (!clean) process.stdout.write("No files changed. Add --clean --stopped after stopping all servers.\n");
    } catch (error) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    }
  }
}
