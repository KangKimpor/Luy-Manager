import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "luy-security-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

for (const mocked of [true, false]) test(`connection diagnostics hide secrets on ${mocked ? "success" : "failure"}`, t => {
  const root = fixture(t);
  const preload = join(root, "mock-fetch.mjs");
  writeFileSync(preload, `globalThis.fetch = async url => ({
    status: 200, ok: true, json: async () => String(url).includes("jwks") ? { keys: [{}] }
      : String(url).includes("exchange_rates?") ? [{ rate: 4100 }] : []
  });`);
  const result = spawnSync(process.execPath, [...(mocked ? ["--import", pathToFileURL(preload).href] : []), join(repo, "scripts/connect-supabase.mjs"), "--check"], {
    cwd: root, encoding: "utf8", timeout: 10000,
    env: {
      PATH: process.env.PATH, SystemRoot: process.env.SystemRoot,
      NEXT_PUBLIC_SUPABASE_URL: "https://tester:url-secret@project.supabase.co/?token=query-secret",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_test",
      SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test",
    },
  });
  assert.equal(result.status, mocked ? 0 : 1, result.stderr);
  assert.match(result.stdout, mocked ? /REST API reachable/ : /Could not reach the project/);
  assert.doesNotMatch(result.stdout + result.stderr, /url-secret|query-secret|sb_secret_test|sb_publishable_test/);
});

test("bundle link checks ignore comments without joining surrounding path fragments", t => {
  const root = fixture(t);
  mkdirSync(join(root, "scripts"));
  mkdirSync(join(root, "docs"));
  cpSync(join(repo, "scripts/build-skill-bundle.mjs"), join(root, "scripts/build-skill-bundle.mjs"));
  cpSync(join(repo, ".claude/skills"), join(root, ".claude/skills"), { recursive: true });
  cpSync(join(repo, "docs/Cambodia_Personal_Finance_App_PRD.md"), join(root, "docs/Cambodia_Personal_Finance_App_PRD.md"));
  const skill = join(root, ".claude/skills/luy-manager-project/SKILL.md");
  const source = readFileSync(skill, "utf8");
  writeFileSync(skill, source + "\n<!-- references/absent.md -->\ndocs/Cam<!-- comment -->bodia/fragment.md\n<!-<!-- comment -->- marker\n");
  const run = () => spawnSync(process.execPath, [join(root, "scripts/build-skill-bundle.mjs"), "--check"], {
    cwd: root, encoding: "utf8", timeout: 10000,
  });
  const valid = run();
  assert.equal(valid.status, 0, valid.stderr);
  writeFileSync(skill, source + "\nSee references/absent.md\n");
  const invalid = run();
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /references\/absent.md/);
});
