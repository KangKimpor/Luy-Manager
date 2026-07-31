-- =============================================================================
-- Close two gaps the Supabase schema linter reports against 0001-0008.
--
-- Gap 1: SECURITY DEFINER helpers were reachable over the REST API.
--
-- PostgREST exposes every function in `public` as an RPC endpoint, and a new
-- function is granted EXECUTE to PUBLIC by default. Four functions from 0001,
-- 0002 and 0007 were therefore callable as /rest/v1/rpc/<name> by anyone holding
-- the anon key, which is a key the browser is meant to have.
--
-- `seed_default_categories` and `seed_default_merchants` are the ones that
-- actually matter. Both are SECURITY DEFINER, so they bypass Row Level Security,
-- and both take a user id as an argument rather than deriving it from
-- auth.uid(). An unauthenticated caller could therefore write category and
-- merchant rows into any account whose id they could guess or learn:
--
--     POST /rest/v1/rpc/seed_default_categories  {"target_user_id": "<someone>"}
--
-- Nothing in the app calls them directly; they exist to be invoked by
-- handle_new_user() on signup. A function called only by a trigger has no reason
-- to be in the REST surface at all.
--
-- `handle_new_user` and `record_audit` are trigger functions that would fail on a
-- direct call, since there is no trigger context to read. They are revoked for
-- the same reason a locked door is locked on a room with nothing in it: the
-- guarantee should not depend on the caller being unable to find a use for it.
--
-- Revoking EXECUTE does not stop the triggers firing. Postgres checks EXECUTE on
-- a trigger function when the trigger is created, not each time it fires, and the
-- seed helpers are called from inside a SECURITY DEFINER function, so they run
-- with the definer's privileges rather than the caller's. Verified end to end
-- against this project, not assumed: a signup still seeds categories, merchants
-- and settings after this migration.
--
-- Mirrors what 0005 already does for upsert_global_exchange_rate. That function
-- got this treatment because it was obviously dangerous; these four were missed
-- because they are invoked indirectly.
--
-- Gap 2: trigger functions with a caller-controlled search_path.
--
-- The SECURITY DEFINER functions in 0001-0008 all pin `set search_path = public`.
-- The SECURITY INVOKER trigger functions do not, so the names they resolve
-- (`accounts`, `transactions`, the `currency_code` type) depend on whatever
-- search_path is in effect. That is a lower-severity issue than a mutable
-- search_path on a definer function, because these run with the caller's own
-- privileges and grant nothing extra. It is still worth fixing: a trigger that
-- enforces a money invariant should resolve `accounts` to one specific table
-- regardless of how the session is configured, or the invariant is only as solid
-- as the session settings.
--
-- The linter names are 0011_function_search_path_mutable,
-- 0028_anon_security_definer_function_executable and
-- 0029_authenticated_security_definer_function_executable.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Gap 1: take the internal helpers out of the REST surface.
--
-- FROM PUBLIC drops the implicit grant every function receives on creation;
-- anon and authenticated are named as well because a grant made directly to
-- either would survive the revoke from PUBLIC.
--
-- service_role is left alone deliberately. It bypasses RLS regardless, so
-- withholding EXECUTE from it would buy nothing and would break any future
-- server-side reseed.
-- -----------------------------------------------------------------------------

revoke all on function handle_new_user() from public, anon, authenticated;
revoke all on function record_audit() from public, anon, authenticated;
revoke all on function seed_default_categories(uuid) from public, anon, authenticated;
revoke all on function seed_default_merchants(uuid) from public, anon, authenticated;

comment on function seed_default_categories(uuid) is
  'Seeds one user''s default categories. SECURITY DEFINER and takes the owner as '
  'an argument, so it must never be reachable from a client session: EXECUTE is '
  'revoked from anon and authenticated and it is called only by handle_new_user().';

comment on function seed_default_merchants(uuid) is
  'Seeds one user''s default merchant rules. Same exposure rules as '
  'seed_default_categories: trigger-invoked only, never callable over REST.';

-- -----------------------------------------------------------------------------
-- Gap 2: pin the search_path on the SECURITY INVOKER trigger functions.
--
-- ALTER FUNCTION rather than CREATE OR REPLACE so the bodies defined in 0001,
-- 0003, 0004 and 0007 stay in exactly one place each and cannot drift from the
-- migration that explains them.
-- -----------------------------------------------------------------------------

alter function set_updated_at() set search_path = public;
alter function assert_transaction_currency_matches_account() set search_path = public;
alter function assert_split_currency_matches_transaction() set search_path = public;
alter function assert_tender_currency_matches_account() set search_path = public;
alter function assert_transfer_group_balanced() set search_path = public;
alter function prevent_log_mutation() set search_path = public;

-- -----------------------------------------------------------------------------
-- What is deliberately left as the linter reports it.
--
-- `exchange_rate_sync_runs` has RLS enabled and no policy, which the linter flags
-- as 0008_rls_enabled_no_policy at INFO. That is the intended design, stated in
-- 0005: the rows are operational telemetry written by the service role, and RLS
-- with no policy is a total denial to every client session. Adding a policy to
-- silence the notice would weaken the table.
-- -----------------------------------------------------------------------------
