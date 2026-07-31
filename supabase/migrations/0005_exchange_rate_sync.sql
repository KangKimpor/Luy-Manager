-- =============================================================================
-- Audit trail for the automatic exchange rate job.
--
-- Gap this closes:
--
-- Migration 0001 gave `exchange_rates` a `source` column with an 'api' value, so
-- the schema anticipated machine-fetched rates, but nothing recorded the fetching
-- itself. That leaves one failure mode completely invisible:
--
--   The daily job breaks. No new row is written. Every conversion in the app
--   keeps using the last rate that landed, and nothing on any screen looks
--   wrong. Net worth drifts further from reality every day, silently.
--
-- `references/currency-data.md` states the rule directly: never let a failed
-- fetch fall back to a stale rate without recording that it did. A table of runs
-- is how that recording happens — the absence of a row today, or a run of
-- 'failed' rows, is the signal.
--
-- Also resolves PRD Section 17 open decision 5: the provider chain lives in
-- src/lib/rates/provider.ts, and `provider_id` here is what makes it auditable
-- after the fact, including which provider actually answered.
--
-- Conventions applied: numeric(18,8) for rates as in 0001, never float. Rates are
-- global facts so these rows have no user_id, and RLS keeps them out of reach of
-- ordinary sessions entirely.
-- =============================================================================

create type rate_sync_status as enum ('inserted', 'updated', 'failed');

create table exchange_rate_sync_runs (
  id uuid primary key default gen_random_uuid(),

  base_currency currency_code not null,
  quote_currency currency_code not null,

  status rate_sync_status not null,

  -- Which provider answered, matching RateProvider.id in the application. Null
  -- on a run where every provider failed.
  provider_id text,

  -- The rate stored by this run, if any. Same type as exchange_rates.rate so the
  -- two can be compared without a cast.
  rate numeric(18, 8),

  -- The date the rate was filed under. Null on failure.
  as_of date,

  error_message text,

  -- The full provider attempt chain as returned by fetchUsdKhrRate, so a primary
  -- provider that has been quietly failing over to the fallback for weeks is
  -- visible rather than something to be inferred from timings.
  attempts jsonb not null default '[]'::jsonb,

  -- What users continued to be shown after a failure. Recording the age here is
  -- the difference between "the job failed" and "the job failed and everyone has
  -- been converting at a nine-day-old rate since".
  fallback_rate numeric(18, 8),
  fallback_as_of date,
  fallback_age_days int,

  ran_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint exchange_rate_sync_runs_rate_positive
    check (rate is null or rate > 0),
  constraint exchange_rate_sync_runs_fallback_positive
    check (fallback_rate is null or fallback_rate > 0),
  constraint exchange_rate_sync_runs_distinct_currencies
    check (base_currency <> quote_currency),

  -- A success must say what it stored, and a failure must say why. Either half
  -- alone is not something you can act on later.
  constraint exchange_rate_sync_runs_success_has_rate
    check (status = 'failed' or (rate is not null and as_of is not null and provider_id is not null)),
  constraint exchange_rate_sync_runs_failure_has_reason
    check (status <> 'failed' or error_message is not null),

  -- All three fallback columns or none: a partial record does not describe what
  -- users were actually seeing.
  constraint exchange_rate_sync_runs_fallback_together
    check (
      (fallback_rate is null and fallback_as_of is null and fallback_age_days is null)
      or (fallback_rate is not null and fallback_as_of is not null and fallback_age_days is not null)
    )
);

-- Answering "when did this pair last sync, and did it work" is the only read
-- pattern this table has.
create index exchange_rate_sync_runs_recent_idx
  on exchange_rate_sync_runs (base_currency, quote_currency, ran_at desc);

create index exchange_rate_sync_runs_failures_idx
  on exchange_rate_sync_runs (ran_at desc)
  where status = 'failed';

-- -----------------------------------------------------------------------------
-- RLS. These rows are operational telemetry, not user data. No policy is created
-- for the authenticated role, so with RLS enabled and no policy the table is
-- unreadable and unwritable through the anon and authenticated keys, and only
-- the service role the job uses can touch it. That is deliberate: enabling RLS
-- without a policy is a denial, and a denial is the correct default here.
-- -----------------------------------------------------------------------------

alter table exchange_rate_sync_runs enable row level security;

comment on table exchange_rate_sync_runs is
  'One row per run of the daily exchange rate job, successful or not. The absence '
  'of a recent row is the signal that the job has stalled and that stale rates '
  'are being served. Written only by the service role.';

-- -----------------------------------------------------------------------------
-- Freshness view.
--
-- Turns "is our rate current" into a single select rather than a query someone
-- has to reconstruct correctly under pressure. Exposed to users because the
-- dashboard tells them how old the rate behind their totals is, and hiding that
-- would make the number look more authoritative than it is.
-- -----------------------------------------------------------------------------

create view exchange_rate_freshness with (security_invoker = true) as
select
  r.base_currency,
  r.quote_currency,
  r.rate,
  r.as_of,
  r.source,
  (current_date - r.as_of) as age_days
from exchange_rates r
where r.user_id is null
  and r.as_of = (
    select max(inner_r.as_of)
    from exchange_rates inner_r
    where inner_r.user_id is null
      and inner_r.base_currency = r.base_currency
      and inner_r.quote_currency = r.quote_currency
  );

comment on view exchange_rate_freshness is
  'The newest published rate per currency pair and its age in days. age_days '
  'growing past 1 means the daily sync job has stopped landing rows.';

-- -----------------------------------------------------------------------------
-- Writing the published rate.
--
-- This has to be a function rather than a plain upsert from the client, and the
-- reason is specific: `exchange_rates_global_key` in 0001 is a PARTIAL unique
-- index (`where user_id is null`), because a plain unique constraint treats NULL
-- user_ids as distinct and would let duplicate global rates accumulate for one
-- day. Postgres will only infer a partial index as an ON CONFLICT target if the
-- statement repeats the index predicate:
--
--     on conflict (base_currency, quote_currency, as_of) where user_id is null
--
-- PostgREST's `on_conflict` parameter takes a bare column list and cannot express
-- that WHERE clause, so an upsert issued through supabase-js fails outright with
-- "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification". Verified against Postgres 16 rather than assumed.
--
-- Encapsulating it here also means the daily job performs one named operation
-- instead of an open-ended table write, and reports whether the day's rate was
-- new or corrected without a second round trip.
-- -----------------------------------------------------------------------------

create or replace function upsert_global_exchange_rate(
  p_base currency_code,
  p_quote currency_code,
  p_rate numeric,
  p_as_of date,
  p_source rate_source default 'api'
)
returns table (action text, previous_rate numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing numeric;
begin
  if p_rate is null or p_rate <= 0 then
    raise exception 'Exchange rate must be positive, received %', p_rate
      using errcode = 'check_violation';
  end if;

  -- Read before writing so the caller can log what changed. A rate that moved
  -- 10% overnight is worth noticing, and that is only visible as a difference.
  select rate into existing
  from exchange_rates
  where user_id is null
    and base_currency = p_base
    and quote_currency = p_quote
    and as_of = p_as_of;

  insert into exchange_rates (user_id, base_currency, quote_currency, rate, as_of, source)
  values (null, p_base, p_quote, p_rate, p_as_of, p_source)
  on conflict (base_currency, quote_currency, as_of) where user_id is null
  do update set
    rate = excluded.rate,
    source = excluded.source,
    updated_at = now();

  return query select
    case when existing is null then 'inserted' else 'updated' end,
    existing;
end;
$$;

-- SECURITY DEFINER lets this write a row no session-bound user could write, so
-- execution has to be withheld from the roles a browser can reach, then granted
-- back to the service role the scheduled job authenticates as. Revoking from
-- PUBLIC also drops the implicit grant every new function receives, so the grant
-- to service_role has to be explicit or the job cannot call its own function.
revoke all on function upsert_global_exchange_rate(currency_code, currency_code, numeric, date, rate_source) from public;
revoke all on function upsert_global_exchange_rate(currency_code, currency_code, numeric, date, rate_source) from anon;
revoke all on function upsert_global_exchange_rate(currency_code, currency_code, numeric, date, rate_source) from authenticated;
grant execute on function upsert_global_exchange_rate(currency_code, currency_code, numeric, date, rate_source) to service_role;

comment on function upsert_global_exchange_rate(currency_code, currency_code, numeric, date, rate_source) is
  'Stores the published rate for a day, correcting it if the job runs twice. '
  'Exists because the global uniqueness index is partial and PostgREST cannot '
  'express its predicate as an on_conflict target. Service role only.';
