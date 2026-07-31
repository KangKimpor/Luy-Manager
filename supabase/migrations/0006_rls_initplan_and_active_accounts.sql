-- =============================================================================
-- Two corrections to migration 0001: RLS evaluation cost, and closed accounts.
--
-- Gap 1: auth.uid() re-evaluated per row.
--
-- Every policy in 0001 calls `auth.uid()` bare:
--
--     using (auth.uid() = user_id)
--
-- Postgres treats that as a volatile expression referencing the row, so it runs
-- the function once for every row the query touches. Wrapping it in a scalar
-- subquery turns it into an InitPlan the planner evaluates once per statement
-- and caches:
--
--     using ((select auth.uid()) = user_id)
--
-- The predicate is logically identical — row visibility does not change — so
-- this is purely an evaluation-count fix. It matters most on `transactions`,
-- which is the table that grows without bound and the one every dashboard query
-- scans. Supabase's own schema linter flags the unwrapped form as
-- `0003_auth_rls_initplan`.
--
-- Policies cannot be altered in place in a way that rewrites their expressions,
-- so each is dropped and recreated. Dropping a policy while RLS stays enabled
-- means the table is briefly closed rather than briefly open, which is the safe
-- direction to fail.
--
-- Gap 2: `account_balances` ignored `is_active`.
--
-- The view filtered `deleted_at` but not `is_active`, so an account the user had
-- deliberately closed still appeared in the accounts list and still counted
-- toward net worth. `is_active` then had no observable effect anywhere, which
-- makes it a column that lies. The view now exposes it and excludes closed
-- accounts from the net-worth rollup while still reporting their balance, since
-- a closed account with money left in it is something the user needs to see.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------

drop policy if exists profiles_select_own on profiles;
drop policy if exists profiles_update_own on profiles;

create policy profiles_select_own on profiles
  for select using ((select auth.uid()) = id);
create policy profiles_update_own on profiles
  for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- -----------------------------------------------------------------------------
-- Tables carrying user_id directly.
-- -----------------------------------------------------------------------------

drop policy if exists accounts_all_own on accounts;
create policy accounts_all_own on accounts
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists categories_all_own on categories;
create policy categories_all_own on categories
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists merchants_all_own on merchants;
create policy merchants_all_own on merchants
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists transactions_all_own on transactions;
create policy transactions_all_own on transactions
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- exchange_rates: global rows stay readable by everyone, writes stay owner-only.
-- -----------------------------------------------------------------------------

drop policy if exists exchange_rates_select on exchange_rates;
drop policy if exists exchange_rates_insert_own on exchange_rates;
drop policy if exists exchange_rates_update_own on exchange_rates;
drop policy if exists exchange_rates_delete_own on exchange_rates;

create policy exchange_rates_select on exchange_rates
  for select using (user_id is null or (select auth.uid()) = user_id);
create policy exchange_rates_insert_own on exchange_rates
  for insert with check ((select auth.uid()) = user_id);
create policy exchange_rates_update_own on exchange_rates
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy exchange_rates_delete_own on exchange_rates
  for delete using ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- Child tables: ownership reached through the parent transaction.
--
-- The EXISTS subquery already runs once per row by necessity, but the uid call
-- inside it does not have to, so it gets the same treatment.
-- -----------------------------------------------------------------------------

drop policy if exists transaction_tenders_all_own on transaction_tenders;
create policy transaction_tenders_all_own on transaction_tenders
  for all
  using (
    exists (
      select 1 from transactions t
      where t.id = transaction_tenders.transaction_id
        and t.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from transactions t
      where t.id = transaction_tenders.transaction_id
        and t.user_id = (select auth.uid())
    )
  );

drop policy if exists transaction_splits_all_own on transaction_splits;
create policy transaction_splits_all_own on transaction_splits
  for all
  using (
    exists (
      select 1 from transactions t
      where t.id = transaction_splits.transaction_id
        and t.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from transactions t
      where t.id = transaction_splits.transaction_id
        and t.user_id = (select auth.uid())
    )
  );

-- -----------------------------------------------------------------------------
-- account_balances: surface is_active, and stop closed accounts counting.
--
-- `include_in_net_worth` and `is_active` are different questions. The first is a
-- user's choice to exclude an account from the total while still tracking it;
-- the second means the account is closed. Both must exclude it from net worth,
-- so the view exposes a single derived `counts_toward_net_worth` alongside the
-- raw flags rather than making every caller remember to check two columns.
-- -----------------------------------------------------------------------------

drop view if exists account_balances;

create view account_balances
with (security_invoker = true)
as
select
  a.id as account_id,
  a.user_id,
  a.name,
  a.institution,
  a.type,
  a.currency,
  a.icon,
  a.color,
  a.is_active,
  a.include_in_net_worth,
  a.sort_order,
  -- Both flags must hold. Kept as one derived column so a caller cannot include
  -- a closed account by checking only the flag it happened to remember.
  (a.is_active and a.include_in_net_worth) as counts_toward_net_worth,
  a.opening_balance
    + coalesce(sum(t.amount) filter (where t.deleted_at is null), 0) as current_balance,
  count(t.id) filter (where t.deleted_at is null) as transaction_count,
  max(t.occurred_at) filter (where t.deleted_at is null) as last_activity_at
from accounts a
left join transactions t on t.account_id = a.id
where a.deleted_at is null
group by
  a.id, a.user_id, a.name, a.institution, a.type, a.currency, a.icon, a.color,
  a.is_active, a.include_in_net_worth, a.sort_order, a.opening_balance;

comment on view account_balances is
  'Derived balances. Summing transactions.amount without conversion is safe '
  'because the transactions_currency_matches_account trigger guarantees every '
  'transaction on an account shares that account''s currency. '
  'counts_toward_net_worth combines is_active and include_in_net_worth: a closed '
  'account still reports its balance but must not inflate the total.';
