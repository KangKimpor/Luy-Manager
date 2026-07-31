#!/usr/bin/env node
/**
 * connect-supabase — point this app at a real Supabase project, and check it.
 *
 * Connecting is four separate things, and doing them by hand is where mistakes
 * happen. This does them in order and stops at the first genuine problem:
 *
 *   1. Confirm the environment is complete, naming exactly what is missing.
 *   2. Apply every migration, in order, to the project database.
 *   3. Run the schema guards CI runs — RLS on every table, and no policy calling
 *      auth.uid() per row.
 *   4. Probe the live REST API to confirm the anon key cannot read anyone's ledger.
 *
 * Step 4 is the one worth having. Row Level Security is the only thing standing
 * between a public anon key and every row in the database, and "we enabled RLS"
 * is a claim about intent. This checks the deployed reality by asking the real
 * API, as an anonymous caller, whether it will hand over data.
 *
 * Usage:
 *   node scripts/connect-supabase.mjs            # everything
 *   node scripts/connect-supabase.mjs --check    # skip migrations, verify only
 *
 * Reads .env.local. Never prints a key.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const CHECK_ONLY = process.argv.includes("--check");
const MIGRATIONS_DIR = "supabase/migrations";
const ENV_FILE = ".env.local";

const styles = {
  ok: (s) => `\x1b[32m✓\x1b[0m ${s}`,
  bad: (s) => `\x1b[31m✗\x1b[0m ${s}`,
  warn: (s) => `\x1b[33m!\x1b[0m ${s}`,
  head: (s) => `\n\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

let failed = false;
const fail = (message) => {
  console.log(styles.bad(message));
  failed = true;
};

/**
 * Parse a dotenv file.
 *
 * Deliberately no dependency: this runs before `npm install` might have brought
 * one in, and the format needed here is a handful of KEY=value lines.
 */
function loadEnvFile(path) {
  const values = {};
  if (!existsSync(path)) return values;

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    // Strip matching quotes, which people add out of habit.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

// Real environment wins, so this works in CI too.
const env = { ...loadEnvFile(ENV_FILE), ...process.env };

// ---------------------------------------------------------------------------
// 1. Environment
// ---------------------------------------------------------------------------

console.log(styles.head("1. Environment"));

const REQUIRED = {
  NEXT_PUBLIC_SUPABASE_URL: "Project URL, from Project Settings > API",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon public key, from Project Settings > API",
  SUPABASE_SERVICE_ROLE_KEY:
    "service_role key, from Project Settings > API. Writes the published rate, " +
    "which has no owner and so cannot be written by any user session",
};

const OPTIONAL = {
  SUPABASE_DB_URL:
    "Postgres connection string, from Project Settings > Database. Only needed to " +
    "apply migrations from here",
  CRON_SECRET: "Any long random string. The rate refresh endpoint refuses to run without it",
};

for (const [key, why] of Object.entries(REQUIRED)) {
  if (env[key]) console.log(styles.ok(`${key} is set`));
  else fail(`${key} is missing — ${why}`);
}

for (const [key, why] of Object.entries(OPTIONAL)) {
  if (env[key]) console.log(styles.ok(`${key} is set`));
  else console.log(styles.warn(`${key} is not set — ${why}`));
}

// A service_role key in a NEXT_PUBLIC_ variable would be shipped to the browser,
// which hands every row in the database to anyone who opens the page.
for (const [key, value] of Object.entries(env)) {
  if (key.startsWith("NEXT_PUBLIC_") && typeof value === "string") {
    // Supabase keys are JWTs; the role sits in the payload.
    const parts = value.split(".");
    if (parts.length === 3) {
      try {
        const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
        if (payload.role === "service_role") {
          fail(
            `${key} contains a service_role key. Anything NEXT_PUBLIC_ is sent to the ` +
              `browser, so this would expose every row. Use the anon key here.`,
          );
        }
      } catch {
        // Not a JWT we can read; nothing to assert.
      }
    }
  }
}

if (failed) {
  console.log(
    styles.head("Stopped.") +
      `\nFill in ${ENV_FILE} (copy .env.example) and run this again.`,
  );
  process.exit(1);
}

const projectUrl = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "");

// ---------------------------------------------------------------------------
// 2. Migrations
// ---------------------------------------------------------------------------

const migrations = existsSync(MIGRATIONS_DIR)
  ? readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()
  : [];

if (CHECK_ONLY) {
  console.log(styles.head("2. Migrations") + "\n" + styles.dim("  skipped (--check)"));
} else if (!env.SUPABASE_DB_URL) {
  console.log(
    styles.head("2. Migrations") +
      "\n" +
      styles.warn(
        "SUPABASE_DB_URL is not set, so migrations cannot be applied from here.",
      ) +
      "\n" +
      styles.dim(
        `  Either set it, or paste these files in order into the SQL editor:\n` +
          migrations.map((m) => `    ${m}`).join("\n"),
      ),
  );
} else {
  console.log(styles.head("2. Migrations"));

  let psqlAvailable = true;
  try {
    execFileSync("psql", ["--version"], { stdio: "ignore" });
  } catch {
    psqlAvailable = false;
  }

  if (!psqlAvailable) {
    console.log(styles.warn("psql is not installed; skipping. Install it or use the SQL editor."));
  } else {
    for (const file of migrations) {
      const path = join(MIGRATIONS_DIR, file);
      try {
        // One transaction per file, so a failure leaves nothing half-applied.
        execFileSync(
          "psql",
          [env.SUPABASE_DB_URL, "--single-transaction", "-v", "ON_ERROR_STOP=1", "-q", "-f", path],
          { stdio: ["ignore", "ignore", "pipe"] },
        );
        console.log(styles.ok(file));
      } catch (error) {
        const stderr = String(error.stderr ?? "");
        // Re-running is normal and should not read as breakage.
        if (/already exists/i.test(stderr)) {
          console.log(styles.warn(`${file} — already applied, skipped`));
        } else {
          fail(`${file}\n${stderr.split("\n").slice(0, 6).map((l) => `    ${l}`).join("\n")}`);
          break;
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Schema guards
// ---------------------------------------------------------------------------

/**
 * The guards CI runs, as SQL.
 *
 * Each check raises on failure, then a plain SELECT reports success. The success
 * marker is a SELECT rather than a RAISE NOTICE on purpose: notices go to stderr,
 * which made an earlier version of this silently report nothing at all.
 */
const GUARDS = `
do $$
declare unprotected text;
begin
  select string_agg(c.relname, ', ') into unprotected
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if unprotected is not null then
    raise exception 'Tables without row level security: %', unprotected;
  end if;
end $$;
select 'RLS_OK';

do $$
declare bare text;
begin
  select string_agg(format('%s.%s', tablename, policyname), ', ') into bare
  from pg_policies
  where schemaname = 'public'
    and ((qual is not null and qual like '%auth.uid()%' and qual not like '%( SELECT auth.uid()%')
      or (with_check is not null and with_check like '%auth.uid()%' and with_check not like '%( SELECT auth.uid()%'));
  if bare is not null then
    raise exception 'Policies calling auth.uid() per row: %', bare;
  end if;
end $$;
select 'INITPLAN_OK';

select 'TABLES=' || count(*)::text
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r';

select 'POLICIES=' || count(*)::text from pg_policies where schemaname = 'public';
`;

if (env.SUPABASE_DB_URL) {
  console.log(styles.head("3. Schema guards"));

  const result = spawnSync(
    "psql",
    [env.SUPABASE_DB_URL, "-v", "ON_ERROR_STOP=1", "-tA", "-q", "-f", "-"],
    { input: GUARDS, encoding: "utf8" },
  );

  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";

  if (result.status !== 0) {
    // The exception message carries the offending table or policy names.
    const detail =
      stderr
        .split("\n")
        .find((line) => /ERROR|Tables without|Policies calling/.test(line)) ??
      stderr.trim().split("\n")[0] ??
      "unknown error";
    fail(`Guard failed: ${detail.replace(/^psql:[^:]*:\d+:\s*/, "")}`);
  } else {
    if (stdout.includes("RLS_OK")) {
      console.log(styles.ok("Row Level Security is on every table in public"));
    }
    if (stdout.includes("INITPLAN_OK")) {
      console.log(styles.ok("Every policy evaluates auth.uid() once per statement"));
    }

    const tables = stdout.match(/TABLES=(\d+)/)?.[1];
    const policies = stdout.match(/POLICIES=(\d+)/)?.[1];
    if (tables && policies) {
      console.log(styles.dim(`  ${tables} tables, ${policies} policies`));
    }
  }
} else {
  console.log(styles.head("3. Schema guards") + "\n" + styles.dim("  needs SUPABASE_DB_URL"));
}

// ---------------------------------------------------------------------------
// 4. Live API probe
//
// The part that cannot be checked from the schema alone: what the deployed API
// actually returns to an anonymous caller.
// ---------------------------------------------------------------------------

console.log(styles.head("4. Live API"));

async function restGet(path, key) {
  const response = await fetch(`${projectUrl}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  let body = null;
  try {
    body = await response.json();
  } catch {
    // Some errors come back empty.
  }
  return { status: response.status, body };
}

try {
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Reachability first, so a DNS or URL typo is not reported as a policy problem.
  const reach = await fetch(`${projectUrl}/rest/v1/`, { headers: { apikey: anon } });
  if (reach.status >= 500) {
    fail(`REST API returned ${reach.status}. Is the project awake?`);
  } else {
    console.log(styles.ok(`REST API reachable at ${projectUrl}`));
  }

  // Anonymous reads of user data must come back empty. Not 200-with-rows, and not
  // 404: an empty array is RLS doing its job.
  for (const table of ["accounts", "transactions", "budgets", "profiles"]) {
    const { status, body } = await restGet(`${table}?select=id&limit=1`, anon);

    if (status === 200 && Array.isArray(body) && body.length === 0) {
      console.log(styles.ok(`anon read of ${table} returns no rows`));
    } else if (status === 200 && Array.isArray(body) && body.length > 0) {
      fail(
        `anon read of ${table} RETURNED DATA. The anon key is public — this is every ` +
          `row exposed to anyone who opens the app. Check the policies on ${table}.`,
      );
    } else if (status === 401 || status === 403) {
      console.log(styles.ok(`anon read of ${table} refused (${status})`));
    } else if (status === 404) {
      fail(`${table} does not exist. Have the migrations been applied?`);
    } else {
      console.log(styles.warn(`anon read of ${table}: unexpected ${status}`));
    }
  }

  // The published exchange rate is meant to be world-readable: it is a fact about
  // the world, not user data, and the app reads it before anyone signs in.
  const rates = await restGet("exchange_rates?select=rate,as_of&limit=1", anon);
  if (rates.status === 200 && Array.isArray(rates.body) && rates.body.length > 0) {
    console.log(styles.ok("published exchange rate is readable without a session"));
  } else if (rates.status === 200) {
    console.log(
      styles.warn(
        "no exchange rate rows yet. Migration 0002 seeds one; the daily job adds more.",
      ),
    );
  } else {
    console.log(styles.warn(`exchange_rates read: ${rates.status}`));
  }

  // The audit trail must not be writable, and the log tables must not be readable
  // without a session.
  const audit = await restGet("audit_logs?select=id&limit=1", anon);
  if (audit.status === 200 && Array.isArray(audit.body) && audit.body.length === 0) {
    console.log(styles.ok("audit_logs returns nothing to an anonymous caller"));
  } else if (audit.status === 401 || audit.status === 403) {
    console.log(styles.ok(`audit_logs refused (${audit.status})`));
  } else if (audit.status === 200) {
    fail("audit_logs RETURNED DATA to an anonymous caller.");
  }
} catch (error) {
  fail(`Could not reach the project: ${error.message}`);
}

// ---------------------------------------------------------------------------

console.log(
  failed
    ? styles.head("Not connected.") + "\nFix the items marked ✗ above and run this again.\n"
    : styles.head("Connected.") +
        "\nRun `npm run dev`, sign in, and add an account.\n" +
        styles.dim(
          "  The daily rate job is at GET /api/rates/refresh, guarded by CRON_SECRET.\n" +
            "  vercel.json schedules it for 01:30 UTC.\n",
        ),
);

process.exit(failed ? 1 : 0);
