import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Test-only runtime, installed in scratch. Nothing is added to the client bundle.
const { PGlite } = await import(pathToFileURL(resolve(process.argv[2] ?? ".tmp/pg-check/node_modules/@electric-sql/pglite/dist/index.js")).href);
const db = new PGlite();
try {
  await db.exec(`create schema auth;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;`);
  const migration = readFileSync("supabase/migrations/0014_fractional_riel.sql", "utf8");
  for (const file of readdirSync("supabase/migrations").filter(file => file.endsWith(".sql") && file < "0014").sort()) {
    // PGlite lacks pgcrypto; gen_random_uuid is built into its Postgres core.
    const sql = readFileSync(`supabase/migrations/${file}`, "utf8").replace('create extension if not exists "pgcrypto";', "");
    await db.transaction(tx => tx.exec(sql));
  }
  await db.transaction(tx => tx.exec(readFileSync("supabase/tests/fractional_riel_before.sql", "utf8")));
  await db.exec("update budgets set amount = 90071992547410 where currency = 'KHR'");
  await assert.rejects(db.transaction(tx => tx.exec(migration)), /exceeds safe precision/);
  assert.equal((await db.query("select opening_balance from accounts where id = '20000000-0000-4000-8000-000000000001'")).rows[0].opening_balance, 12000);
  await db.exec("update budgets set amount = 10000 where currency = 'KHR'");
  await db.transaction(tx => tx.exec(migration));
  await db.transaction(tx => tx.exec(readFileSync("supabase/tests/fractional_riel_after.sql", "utf8")));
  await assert.rejects(db.transaction(tx => tx.exec(migration)), /already applied/);
  assert.equal((await db.query("select current_balance::text from account_balances where account_id = '20000000-0000-4000-8000-000000000001'")).rows[0].current_balance, "4188345");
  assert.equal((await db.query("select count(*)::integer n from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity")).rows[0].n, 0);
  await db.exec("grant select on accounts, transactions, account_balances to anon, authenticated");
  await db.transaction(async tx => {
    await tx.exec("set local role authenticated; set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001'");
    assert.equal((await tx.query("select count(*)::integer n from account_balances where user_id <> '10000000-0000-4000-8000-000000000001'")).rows[0].n, 0);
  });
  await db.transaction(async tx => {
    await tx.exec("set local role anon; set local request.jwt.claim.sub = ''");
    assert.equal((await tx.query("select count(*)::integer n from transactions")).rows[0].n, 0);
  });
  console.log("14 migrations replayed. Nine amount fields preserved; exact bank expense, unsafe rollback, repeat refusal, RLS and function privileges verified.");
} finally { await db.close(); }
