-- =============================================================================
-- The remaining tables from PRD Section 5.
--
-- Gap this closes:
--
-- Section 5 lists seventeen core tables. Migrations 0001-0005 built eight of
-- them plus the rate machinery. This adds the nine that were missing: budgets,
-- savings_goals, recurring_transactions, tags, attachments, telegram_logs,
-- notifications, audit_logs and settings.
--
-- Conventions carried over from 0001, deliberately and without exception:
--
--   * Every monetary amount is BIGINT minor units paired with a currency_code.
--     Never FLOAT, never NUMERIC-for-money, never a bare number. A budget that
--     drifts by a cent is a budget nobody trusts.
--   * auth.uid() is always wrapped as (select auth.uid()) so it is evaluated once
--     per statement rather than once per row. See 0006.
--   * deleted_at for soft deletes where history matters; hard delete where the
--     row is a log entry that no one edits.
--   * Partial unique indexes rather than plain ones wherever soft deletes mean a
--     name can legitimately be reused after deletion.
-- =============================================================================

create type budget_period as enum ('weekly', 'monthly', 'quarterly', 'yearly');

create type recurrence_frequency as enum (
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'yearly'
);

create type notification_kind as enum (
  'budget_threshold',
  'budget_exceeded',
  'large_transaction',
  'rate_moved',
  'recurring_due',
  'goal_reached'
);

create type telegram_direction as enum ('inbound', 'outbound');

create type audit_action as enum ('insert', 'update', 'delete');

-- -----------------------------------------------------------------------------
-- budgets
--
-- PRD Section 11 puts "Budget Remaining" on the dashboard. A budget is a limit
-- on spending in a category over a repeating period.
--
-- `category_id` is nullable on purpose: a null category is an overall spending
-- cap, which is how most people start before they trust their categories.
--
-- The amount carries its own currency rather than being assumed to be the
-- profile's base currency. Someone who thinks of rent in dollars and food in riel
-- will set budgets in the unit they think in, and `spendingByCategory` already
-- converts actuals into a chosen currency, so the comparison converts one side
-- rather than forcing the user to.
-- -----------------------------------------------------------------------------

create table budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  category_id uuid references categories (id) on delete cascade,

  name text,

  -- Minor units in `currency`. BIGINT, not numeric or float.
  amount bigint not null,
  currency currency_code not null,

  period budget_period not null default 'monthly',

  -- The period anchor. A monthly budget starting on the 15th runs 15th to 14th,
  -- which matters to anyone paid mid-month.
  starts_on date not null default current_date,
  -- Null means it repeats indefinitely.
  ends_on date,

  -- Carry an underspend into the next period instead of resetting.
  rollover boolean not null default false,

  -- Warn at this fraction of the limit. 0.8 = warn at 80%.
  alert_threshold numeric(4, 3) not null default 0.8,

  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint budgets_amount_positive check (amount > 0),
  constraint budgets_threshold_range check (alert_threshold > 0 and alert_threshold <= 1),
  constraint budgets_period_order check (ends_on is null or ends_on >= starts_on)
);

-- One live budget per category per period. The null-category overall budget is
-- covered by the second index, since NULL does not collide in a plain unique.
create unique index budgets_user_category_period_key
  on budgets (user_id, category_id, period, starts_on)
  where deleted_at is null and category_id is not null;

create unique index budgets_user_overall_period_key
  on budgets (user_id, period, starts_on)
  where deleted_at is null and category_id is null;

create index budgets_user_active_idx
  on budgets (user_id, is_active)
  where deleted_at is null;

create trigger budgets_set_updated_at
  before update on budgets
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- savings_goals
--
-- Progress is derived from a linked account rather than stored, for the same
-- reason `account_balances` derives a balance: a stored `current_amount` and the
-- ledger will disagree eventually, and when they do the user believes the wrong
-- one. A goal with no linked account is aspirational and reports no progress.
-- -----------------------------------------------------------------------------

create table savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,

  name text not null,

  target_amount bigint not null,
  currency currency_code not null,

  -- Where the money actually sits. Progress reads this account's balance.
  account_id uuid references accounts (id) on delete set null,

  target_date date,

  icon text,
  color text,

  -- Set once when the target is first met, so "reached" is a fact with a date
  -- rather than something recomputed from a balance that may dip again later.
  achieved_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint savings_goals_target_positive check (target_amount > 0)
);

create index savings_goals_user_idx
  on savings_goals (user_id)
  where deleted_at is null;

create unique index savings_goals_user_name_key
  on savings_goals (user_id, lower(name))
  where deleted_at is null;

create trigger savings_goals_set_updated_at
  before update on savings_goals
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- recurring_transactions
--
-- A template plus a schedule, not a pile of pre-generated future rows. Writing
-- rows ahead of time means editing a recurring amount has to chase every row it
-- already created, and a ledger containing the future cannot be reconciled
-- against a bank statement.
--
-- `next_occurrence_on` is stored rather than computed so the generator can find
-- due templates with an index lookup instead of evaluating a recurrence rule
-- across every row.
-- -----------------------------------------------------------------------------

create table recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,

  account_id uuid not null references accounts (id) on delete cascade,
  category_id uuid references categories (id) on delete set null,
  merchant_id uuid references merchants (id) on delete set null,

  type transaction_type not null,

  -- Magnitude in minor units. The sign is applied when the transaction is
  -- generated, by the same signedAmount() rule everything else uses.
  amount bigint not null,
  currency currency_code not null,

  notes text,

  frequency recurrence_frequency not null,
  -- Every N periods: 2 with 'weekly' is fortnightly.
  interval_count int not null default 1,

  starts_on date not null,
  ends_on date,

  next_occurrence_on date not null,
  last_generated_on date,

  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint recurring_amount_positive check (amount > 0),
  constraint recurring_interval_positive check (interval_count >= 1),
  constraint recurring_period_order check (ends_on is null or ends_on >= starts_on),
  -- A transfer needs two accounts, which this single-account template cannot
  -- express. Recurring transfers would need their own shape.
  constraint recurring_not_transfer check (type <> 'transfer')
);

-- The generator's only query: what is due on or before today.
create index recurring_due_idx
  on recurring_transactions (next_occurrence_on)
  where is_active and deleted_at is null;

create index recurring_user_idx
  on recurring_transactions (user_id)
  where deleted_at is null;

create trigger recurring_transactions_set_updated_at
  before update on recurring_transactions
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- tags and transaction_tags
--
-- PRD Section 8 lists Tags alongside Category. They are different things: a
-- transaction has one category (what kind of spending) and any number of tags
-- (which trip, which project, reimbursable). Hence a join table.
--
-- `normalized_name` mirrors the merchants approach so "Siem Reap" and "siem
-- reap" are the same tag rather than two.
-- -----------------------------------------------------------------------------

create table tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,

  name text not null,
  normalized_name text not null,
  color text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index tags_user_normalized_key
  on tags (user_id, normalized_name)
  where deleted_at is null;

create trigger tags_set_updated_at
  before update on tags
  for each row execute function set_updated_at();

create table transaction_tags (
  transaction_id uuid not null references transactions (id) on delete cascade,
  tag_id uuid not null references tags (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (transaction_id, tag_id)
);

-- Answering "which transactions carry this tag" needs the reverse direction too;
-- the primary key only serves the forward one.
create index transaction_tags_tag_idx on transaction_tags (tag_id);

-- -----------------------------------------------------------------------------
-- attachments
--
-- PRD Section 8 lists Receipt. The file lives in Supabase Storage; this row is
-- the pointer plus the metadata needed to list attachments without fetching
-- them. Storage path rather than a URL, because a signed URL expires and a
-- stored one would rot.
-- -----------------------------------------------------------------------------

create table attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  transaction_id uuid references transactions (id) on delete cascade,

  storage_bucket text not null default 'receipts',
  storage_path text not null,

  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null,

  -- Populated by the Phase 3 OCR pass; null until then.
  extracted_text text,

  created_at timestamptz not null default now(),

  constraint attachments_size_positive check (size_bytes > 0)
);

create unique index attachments_path_key on attachments (storage_bucket, storage_path);
create index attachments_transaction_idx on attachments (transaction_id);
create index attachments_user_idx on attachments (user_id);

-- -----------------------------------------------------------------------------
-- settings
--
-- One row per user, not a key/value bag. The set of settings is known, so typed
-- columns get constraints and a wrong value fails at write time instead of
-- surfacing as an unparseable string months later.
--
-- Distinct from `profiles`, which holds identity and the reporting currency.
-- This holds behaviour.
-- -----------------------------------------------------------------------------

create table settings (
  user_id uuid primary key references profiles (id) on delete cascade,

  -- Preselected in the quick-add form, so the common case is one fewer tap.
  default_account_id uuid references accounts (id) on delete set null,

  -- 0 = Sunday, 1 = Monday. Affects weekly budgets and report grouping.
  week_starts_on int not null default 1,

  notify_budget_threshold boolean not null default true,
  notify_large_transaction boolean not null default true,
  notify_rate_moved boolean not null default false,

  -- A transaction at or above this is worth a notification. Minor units.
  large_transaction_amount bigint not null default 10000,
  large_transaction_currency currency_code not null default 'USD',

  -- Fractional daily move worth flagging. 0.02 = 2%.
  rate_move_threshold numeric(4, 3) not null default 0.02,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint settings_week_start_valid check (week_starts_on between 0 and 6),
  constraint settings_large_amount_positive check (large_transaction_amount > 0),
  constraint settings_rate_threshold_range check (rate_move_threshold > 0 and rate_move_threshold <= 1)
);

create trigger settings_set_updated_at
  before update on settings
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- notifications
--
-- Read state is a nullable timestamp rather than a boolean, so "when did they
-- see this" is answerable without a second column.
-- -----------------------------------------------------------------------------

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,

  kind notification_kind not null,
  title text not null,
  body text,

  -- What the notification is about, loosely coupled so a deleted entity does not
  -- delete the history of having been told about it.
  entity_type text,
  entity_id uuid,

  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- The badge count query: unread, newest first.
create index notifications_unread_idx
  on notifications (user_id, created_at desc)
  where read_at is null;

create index notifications_user_idx on notifications (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- telegram_logs
--
-- PRD Section 9. Every message in and out, with what the parser made of it.
-- Without this, a misparsed "Spent 12000 riel lunch" is unreproducible: the
-- original text is gone and only the wrong transaction remains.
-- -----------------------------------------------------------------------------

create table telegram_logs (
  id uuid primary key default gen_random_uuid(),
  -- Nullable: a message can arrive from a chat_id not yet linked to a profile,
  -- and that is exactly the case worth being able to inspect.
  user_id uuid references profiles (id) on delete set null,

  chat_id bigint not null,
  direction telegram_direction not null,

  message_text text,
  -- What the parser extracted, so a bad interpretation can be replayed.
  parsed jsonb,

  -- The transaction this message produced, when it produced one.
  transaction_id uuid references transactions (id) on delete set null,

  error_message text,
  created_at timestamptz not null default now()
);

create index telegram_logs_chat_idx on telegram_logs (chat_id, created_at desc);
create index telegram_logs_user_idx on telegram_logs (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- audit_logs
--
-- PRD Section 12 lists audit logging as a security requirement, not a feature.
-- Append-only: users may read their own history but there is no update or delete
-- policy, so an audit trail cannot be edited by the account it describes.
--
-- Written by a SECURITY DEFINER trigger. A user-invoked insert would be blocked
-- by RLS, which is the point — the rows are produced by the database, not
-- claimed by the client.
-- -----------------------------------------------------------------------------

create table audit_logs (
  id bigserial primary key,
  user_id uuid references profiles (id) on delete set null,

  action audit_action not null,
  entity_type text not null,
  entity_id uuid,

  -- Full row images. jsonb rather than a column-diff table because the shape
  -- varies per entity and a diff can be computed from these two on read.
  before_data jsonb,
  after_data jsonb,

  created_at timestamptz not null default now()
);

create index audit_logs_user_idx on audit_logs (user_id, created_at desc);
create index audit_logs_entity_idx on audit_logs (entity_type, entity_id, created_at desc);

/**
 * Record a change to a money-bearing table.
 *
 * SECURITY DEFINER so it can write a table the invoking user cannot insert into.
 * search_path is pinned because a definer function that resolves names through a
 * caller-controlled search_path is a privilege-escalation route.
 */
create or replace function record_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid;
  entity uuid;
begin
  -- coalesce because the row is in OLD on delete and NEW otherwise.
  actor := coalesce(
    (case when tg_op = 'DELETE' then old.user_id else new.user_id end),
    (select auth.uid())
  );
  entity := case when tg_op = 'DELETE' then old.id else new.id end;

  insert into audit_logs (user_id, action, entity_type, entity_id, before_data, after_data)
  values (
    actor,
    lower(tg_op)::audit_action,
    tg_table_name,
    entity,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );

  return null;
end;
$$;

-- Applied to the tables where an unexplained change is a real problem. Not to
-- the log tables themselves, which would recurse, and not to notifications,
-- where the audit trail would outweigh the data.
create trigger transactions_audit
  after insert or update or delete on transactions
  for each row execute function record_audit();

create trigger accounts_audit
  after insert or update or delete on accounts
  for each row execute function record_audit();

create trigger budgets_audit
  after insert or update or delete on budgets
  for each row execute function record_audit();

-- =============================================================================
-- Row Level Security
--
-- Same ownership model as 0001, with auth.uid() wrapped per 0006.
-- =============================================================================

alter table budgets enable row level security;
alter table savings_goals enable row level security;
alter table recurring_transactions enable row level security;
alter table tags enable row level security;
alter table transaction_tags enable row level security;
alter table attachments enable row level security;
alter table settings enable row level security;
alter table notifications enable row level security;
alter table telegram_logs enable row level security;
alter table audit_logs enable row level security;

create policy budgets_all_own on budgets
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy savings_goals_all_own on savings_goals
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy recurring_transactions_all_own on recurring_transactions
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy tags_all_own on tags
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy attachments_all_own on attachments
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy settings_all_own on settings
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy notifications_select_own on notifications
  for select using ((select auth.uid()) = user_id);
-- Update is allowed only so a user can mark their own notification read.
create policy notifications_update_own on notifications
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy notifications_delete_own on notifications
  for delete using ((select auth.uid()) = user_id);

-- transaction_tags carries no user_id; ownership comes from the parent
-- transaction, exactly as for tenders and splits in 0001.
create policy transaction_tags_all_own on transaction_tags
  for all
  using (
    exists (
      select 1 from transactions t
      where t.id = transaction_tags.transaction_id
        and t.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from transactions t
      where t.id = transaction_tags.transaction_id
        and t.user_id = (select auth.uid())
    )
  );

-- Read-only to the user it describes. No insert, update or delete policy: rows
-- are written by the SECURITY DEFINER trigger above and never by a client.
create policy audit_logs_select_own on audit_logs
  for select using ((select auth.uid()) = user_id);

-- telegram_logs are operational records the user may read but not author.
create policy telegram_logs_select_own on telegram_logs
  for select using ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- Making the log tables genuinely immutable.
--
-- RLS alone is not enough here, and the reason is subtle. With RLS enabled and no
-- UPDATE policy, `update audit_logs set ...` does not raise — it simply matches
-- zero visible rows and reports success. Nothing is tampered with, but the caller
-- cannot distinguish "denied" from "matched nothing", so a tampering attempt and
-- a no-op look identical in application code and in logs.
--
-- Two layers, because they fail differently:
--
--   1. REVOKE gives a hard "permission denied" instead of a silent no-op.
--   2. A trigger holds the guarantee even if a later migration or a platform
--      default re-grants the privilege, which is exactly the kind of drift that
--      goes unnoticed.
--
-- The trigger is FOR EACH STATEMENT, not FOR EACH ROW, and that detail is the
-- whole point. RLS filters rows before a row-level trigger ever sees them, so on
-- a table with no UPDATE policy a row-level guard never fires: zero rows match,
-- nothing is tampered with, and the statement still reports success. A
-- statement-level trigger fires once per statement regardless of how many rows
-- matched, which is what turns a silent no-op into a refusal.
--
-- The check is on `current_user`, not `session_user`: under `set role` — which is
-- how PostgREST assumes the caller's role — session_user remains the login role
-- and would wrongly look privileged.
--
-- Maintenance roles keep both verbs so a retention policy can prune old rows.
-- Only the two roles a browser can reach are refused.
-- -----------------------------------------------------------------------------

revoke insert, update, delete on audit_logs from anon, authenticated;
revoke insert, update, delete on telegram_logs from anon, authenticated;

create or replace function prevent_log_mutation()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') then
    raise exception
      'Table % is append-only; % is not permitted from a client session.',
      tg_table_name, tg_op
      using errcode = 'insufficient_privilege';
  end if;

  return null;
end;
$$;

create trigger audit_logs_immutable
  before update or delete on audit_logs
  for each statement execute function prevent_log_mutation();

create trigger telegram_logs_immutable
  before update or delete on telegram_logs
  for each statement execute function prevent_log_mutation();

-- -----------------------------------------------------------------------------
-- Give every new user a settings row, for the same reason 0001 creates a profile
-- row: the app should never have to cope with a signed-in user who has none.
-- -----------------------------------------------------------------------------

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email))
  on conflict (id) do nothing;

  perform seed_default_categories(new.id);
  perform seed_default_merchants(new.id);

  insert into public.settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

comment on table budgets is
  'Spending limits per category per period. A null category_id is an overall cap. '
  'Amounts are BIGINT minor units with an explicit currency.';
comment on table savings_goals is
  'Targets whose progress is derived from a linked account, never stored, so it '
  'cannot drift from the ledger.';
comment on table recurring_transactions is
  'Templates plus a schedule. Transactions are generated when due rather than '
  'written ahead, so the ledger never contains the future.';
comment on table audit_logs is
  'Append-only change history for money-bearing tables. Written by the '
  'record_audit() SECURITY DEFINER trigger; readable but not writable by users.';
