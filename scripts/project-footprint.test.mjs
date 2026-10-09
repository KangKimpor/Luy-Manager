import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { generatedFootprint } from "./project-footprint.mjs";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "luy-footprint-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "src"));
  mkdirSync(join(root, ".next", "cache"), { recursive: true });
  mkdirSync(join(root, "node_modules"));
  writeFileSync(join(root, "package.json"), "{}");
  writeFileSync(join(root, ".env.local"), "user configuration");
  writeFileSync(join(root, "src", "app.ts"), "source");
  writeFileSync(join(root, "node_modules", "dependency.js"), "dependency");
  writeFileSync(join(root, ".next", "cache", "chunk"), "cache");
  writeFileSync(join(root, ".next", "BUILD_ID"), "current build");
  return root;
}

test("preview does not mutate source, configuration, dependencies or build output", (t) => {
  const root = fixture(t);
  const plan = generatedFootprint(root, { includeBuild: true });
  assert.equal(plan[0].name, ".next");
  assert.equal(existsSync(join(root, ".next", "cache", "chunk")), true);
  assert.equal(existsSync(join(root, ".env.local")), true);
});

test("cache cleanup preserves a usable build and all user-owned content", (t) => {
  const root = fixture(t);
  generatedFootprint(root, { clean: true, stopped: true });
  assert.equal(existsSync(join(root, ".next", "cache")), false);
  for (const name of ["src/app.ts", ".env.local", "node_modules/dependency.js", ".next/BUILD_ID"]) {
    assert.equal(existsSync(join(root, name)), true, name);
  }
});

test("cleanup requires stopped servers and rejects Next.js locks", (t) => {
  const root = fixture(t);
  assert.throws(() => generatedFootprint(root, { clean: true }), /Stop the dev server/);
  writeFileSync(join(root, ".next", "lock"), "active build");
  assert.throws(() => generatedFootprint(root, { clean: true, stopped: true }), /locks/);
  assert.equal(existsSync(join(root, ".next", "cache", "chunk")), true);
});

test("build removal requires explicit selection", (t) => {
  const root = fixture(t);
  generatedFootprint(root, { clean: true, includeBuild: true, stopped: true });
  assert.equal(existsSync(join(root, ".next")), false);
  assert.equal(existsSync(join(root, "src", "app.ts")), true);
});

test("linked directories refuse the whole deletion plan", (t) => {
  const root = fixture(t);
  const outside = mkdtempSync(join(tmpdir(), "luy-outside-"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  writeFileSync(join(outside, "keep"), "external data");
  symlinkSync(outside, join(root, "coverage"), process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => generatedFootprint(root, { clean: true, stopped: true }), /linked/);
  assert.equal(existsSync(join(outside, "keep")), true);
  assert.equal(existsSync(join(root, ".next", "cache", "chunk")), true);
});
