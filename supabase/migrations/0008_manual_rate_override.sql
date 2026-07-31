-- =============================================================================
-- Writing a personal exchange rate.
--
-- Gap this closes:
--
-- `references/currency-data.md` argues that for a personal-finance product manual
-- entry is often the *most* accurate rate source, because the rate that matters is
-- the one the user's own bank or money changer applied rather than the published
-- mid-market figure. Migration 0001 supported this from the start — an
-- `exchange_rates` row with a non-null `user_id` is an override, and the reader
-- already prefers it over the published rate for the same day — but there was no
-- way to write one.
--
-- It needs a function for the same reason `upsert_global_exchange_rate` in 0005
-- does, and it is worth restating because the trap caught this a second time:
--
--     exchange_rates_user_key is a PARTIAL unique index
--       ON (user_id, base_currency, quote_currency, as_of) WHERE user_id IS NOT NULL
--
-- Postgres only infers a partial index as an ON CONFLICT target when the statement
-- repeats its predicate. PostgREST's `on_conflict` takes a bare column list and
-- cannot express `WHERE user_id IS NOT NULL`, so an upsert through supabase-js
-- fails with 42P10, "there is no unique or exclusion constraint matching the ON
-- CONFLICT specification" — even though every row it sends satisfies the
-- predicate. Verified against Postgres 16 rather than reasoned about.
--
-- Unlike the global writer this one is SECURITY INVOKER, so Row Level Security
-- still applies. It takes no user id: the owner comes from auth.uid() inside the
-- function, which means a caller cannot write somebody else's override even if a
-- policy were later loosened by mistake.
-- =============================================================================

create or replace function upsert_user_exchange_rate(
  p_base currency_code,
  p_quote currency_code,
  p_rate numeric,
  p_as_of date
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null then
    raise exception 'You must be signed in to record your own rate.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_rate is null or p_rate <= 0 then
    raise exception 'Exchange rate must be positive, received %.', p_rate
      using errcode = 'check_violation';
  end if;

  if p_base = p_quote then
    raise exception 'A rate needs two different currencies.'
      using errcode = 'check_violation';
  end if;

  insert into exchange_rates (user_id, base_currency, quote_currency, rate, as_of, source)
  values (actor, p_base, p_quote, p_rate, p_as_of, 'manual')
  on conflict (user_id, base_currency, quote_currency, as_of) where user_id is not null
  do update set
    rate = excluded.rate,
    source = 'manual',
    updated_at = now();
end;
$$;

-- Reachable from a signed-in session, which is the whole point. The function
-- derives the owner itself, so there is nothing to forge.
grant execute on function upsert_user_exchange_rate(currency_code, currency_code, numeric, date)
  to authenticated;
revoke all on function upsert_user_exchange_rate(currency_code, currency_code, numeric, date)
  from anon;

comment on function upsert_user_exchange_rate(currency_code, currency_code, numeric, date) is
  'Records the caller''s own rate for a day, replacing any previous one. Exists '
  'because exchange_rates_user_key is a partial unique index whose predicate '
  'PostgREST cannot express as an on_conflict target. Owner comes from auth.uid().';

-- -----------------------------------------------------------------------------
-- Rate history, for showing how the riel has moved.
--
-- Exposes the published series alongside whichever rate was actually in force for
-- the user on each day, so the chart shows what their own conversions used rather
-- than a mid-market line they never traded at.
-- -----------------------------------------------------------------------------

create view exchange_rate_history with (security_invoker = true) as
select
  r.as_of,
  r.base_currency,
  r.quote_currency,
  max(r.rate) filter (where r.user_id is null) as published_rate,
  max(r.rate) filter (where r.user_id is not null) as your_rate,
  -- What a conversion on that date would actually have used.
  coalesce(
    max(r.rate) filter (where r.user_id is not null),
    max(r.rate) filter (where r.user_id is null)
  ) as effective_rate,
  bool_or(r.user_id is not null) as is_override
from exchange_rates r
group by r.as_of, r.base_currency, r.quote_currency;

comment on view exchange_rate_history is
  'One row per day per pair: the published rate, the user''s override if any, and '
  'the rate that was therefore in force. RLS on exchange_rates means a user only '
  'ever sees global rows plus their own.';
