-- =============================================================================
-- Phase 1 core schema: accounts, transactions, categories, exchange rates.
-- PRD Sections 5, 6, 7, 8, 12.
--
-- Conventions applied throughout:
--   * UUID primary keys, defaulted with gen_random_uuid().
--   * created_at / updated_at on every table, maintained by trigger.
--   * deleted_at for soft deletes where history matters.
--   * Amounts are BIGINT minor units, never floating point. See src/lib/money.
--   * Row Level Security on every user-facing table, keyed on auth.uid().
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

-- Only the two currencies in PRD Section 7. An enum rather than free text so a
-- typo cannot create a third currency that silently breaks every total.
create type currency_code as enum ('USD', 'KHR');

create type account_type as enum (
  'bank',
  'ewallet',
  'cash',
  'credit_card',
  'savings',
  'investment'
);

create type transaction_type as enum (
  'expense',
  'income',
  'transfer',
  'refund',
  'adjustment'
);

create type rate_source as enum ('manual', 'api', 'default');

-- -----------------------------------------------------------------------------
-- updated_at trigger
-- -----------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- profiles
--
-- Supabase owns auth.users. This table holds the app-level preferences that
-- belong to a person, and gives foreign keys something in the public schema to
-- point at.
-- -----------------------------------------------------------------------------

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  -- The currency every aggregate is reported in: net worth, budgets, reports.
  base_currency currency_code not null default 'USD',
  locale text not null default 'en-US',
  timezone text not null default 'Asia/Phnom_Penh',
  telegram_chat_id bigint unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on profiles
  for each row execute function set_updated_at();

-- Create the profile row automatically when someone signs up, so the app never
-- has to cope with an authenticated user that has no profile.
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
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- -----------------------------------------------------------------------------
-- accounts
--
-- PRD Section 6 lists ABA, ACLEDA, Wing, TrueMoney, cash, credit, savings and
-- investment. Those are institutions and types, not separate tables, so one
-- table with a type discriminator covers all of them.
-- -----------------------------------------------------------------------------

create table accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  name text not null,
  institution text,
  type account_type not null,
  currency currency_code not null,

  -- Minor units. An account is single-currency; a person holding both USD and
  -- KHR at one bank has two accounts, which is how the banks present it too.
  opening_balance bigint not null default 0,

  icon text,
  color text,
  is_active boolean not null default true,
  -- Excludes an account from net worth without deleting its history.
  include_in_net_worth boolean not null default true,
  sort_order integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint accounts_name_not_blank check (length(trim(name)) > 0)
);

create index accounts_user_id_idx on accounts (user_id) where deleted_at is null;
create unique index accounts_user_name_key
  on accounts (user_id, lower(name))
  where deleted_at is null;

create trigger accounts_set_updated_at
  before update on accounts
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- categories
--
-- Self-referencing for one level of grouping, e.g. Food > Coffee.
-- -----------------------------------------------------------------------------

create table categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  parent_id uuid references categories (id) on delete set null,
  name text not null,
  icon text,
  color text,
  -- Which transaction types this category may be used for. Keeps "Salary" out
  -- of the expense picker.
  applies_to transaction_type[] not null default array['expense']::transaction_type[],
  is_system boolean not null default false,
  sort_order integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint categories_name_not_blank check (length(trim(name)) > 0),
  constraint categories_no_self_parent check (id <> parent_id)
);

create index categories_user_id_idx on categories (user_id) where deleted_at is null;
create index categories_parent_id_idx on categories (parent_id);
create unique index categories_user_name_parent_key
  on categories (user_id, lower(name), coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where deleted_at is null;

create trigger categories_set_updated_at
  before update on categories
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- merchants
--
-- Backs the auto-categorisation in PRD Section 10: once "Lucky Supermarket" is
-- known to mean Groceries, later transactions inherit it.
-- -----------------------------------------------------------------------------

create table merchants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  name text not null,
  -- Normalised for matching: lowercased and stripped of punctuation.
  normalized_name text not null,
  default_category_id uuid references categories (id) on delete set null,
  logo_url text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint merchants_name_not_blank check (length(trim(name)) > 0)
);

create unique index merchants_user_normalized_key on merchants (user_id, normalized_name);

create trigger merchants_set_updated_at
  before update on merchants
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- exchange_rates
--
-- PRD Section 7 requires manual, automatic and historical rates. Rates are
-- global rather than per-user: the USD/KHR rate on a given day is a fact about
-- the world. user_id is nullable so a user can override with their own rate,
-- which is what actually happens when a money changer gives a different number.
-- -----------------------------------------------------------------------------

create table exchange_rates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles (id) on delete cascade,
  base_currency currency_code not null,
  quote_currency currency_code not null,

  -- How many quote units equal one base unit, in major units.
  -- NUMERIC, not float: a rate is a decimal quantity and must compare and store
  -- exactly. The scale allows for rates far outside the riel's actual band.
  rate numeric(18, 8) not null,

  as_of date not null,
  source rate_source not null default 'manual',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint exchange_rates_rate_positive check (rate > 0),
  constraint exchange_rates_distinct_currencies check (base_currency <> quote_currency)
);

-- One rate per pair per day, per scope. Two partial indexes because NULL user_id
-- does not collide in a plain unique constraint, which would let duplicate
-- global rates accumulate for the same day.
create unique index exchange_rates_global_key
  on exchange_rates (base_currency, quote_currency, as_of)
  where user_id is null;

create unique index exchange_rates_user_key
  on exchange_rates (user_id, base_currency, quote_currency, as_of)
  where user_id is not null;

create index exchange_rates_lookup_idx
  on exchange_rates (base_currency, quote_currency, as_of desc);

create trigger exchange_rates_set_updated_at
  before update on exchange_rates
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- transactions
--
-- PRD Section 8. Amounts are signed minor units in the account's currency;
-- expenses negative, income positive. Signing the amount rather than inferring
-- direction from `type` means SUM() over any slice is immediately correct.
--
-- Transfers are represented as two rows sharing a transfer_group_id: one
-- negative leg out of the source account, one positive leg into the
-- destination. A single row cannot express "$100 left ABA and 410,000 riel
-- arrived at Wing" because the two sides differ in both amount and currency.
-- -----------------------------------------------------------------------------

create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  account_id uuid not null references accounts (id) on delete restrict,
  category_id uuid references categories (id) on delete set null,
  merchant_id uuid references merchants (id) on delete set null,

  type transaction_type not null,

  -- Signed minor units in `currency`.
  amount bigint not null,
  currency currency_code not null,

  -- The rate applied at entry time, and the resulting amount in the user's base
  -- currency. Both are stored rather than recomputed so a historical row keeps
  -- reporting the figure the user actually saw, even after the rate table moves.
  exchange_rate numeric(18, 8),
  base_amount bigint,
  base_currency currency_code,

  occurred_at timestamptz not null default now(),
  notes text,
  location text,

  -- Set on both legs of a transfer.
  transfer_group_id uuid,

  -- Provenance, for the audit trail in PRD Section 12.
  created_via text not null default 'web',
  is_pending boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  -- An expense that is positive, or income that is negative, is a bug. Catch it
  -- at the boundary rather than discovering it in a report.
  constraint transactions_expense_is_negative
    check (type <> 'expense' or amount <= 0),
  constraint transactions_income_is_positive
    check (type <> 'income' or amount >= 0),

  -- If one of the base-currency fields is set they must all be set, otherwise
  -- the conversion is not reproducible.
  constraint transactions_base_fields_together check (
    (exchange_rate is null and base_amount is null and base_currency is null)
    or (exchange_rate is not null and base_amount is not null and base_currency is not null)
  ),

  -- A transfer is meaningless without its counterpart.
  constraint transactions_transfer_has_group
    check (type <> 'transfer' or transfer_group_id is not null)
);

create index transactions_user_occurred_idx
  on transactions (user_id, occurred_at desc)
  where deleted_at is null;

create index transactions_account_idx
  on transactions (account_id, occurred_at desc)
  where deleted_at is null;

create index transactions_category_idx
  on transactions (category_id)
  where deleted_at is null;

create index transactions_merchant_idx
  on transactions (merchant_id)
  where deleted_at is null;

create index transactions_transfer_group_idx
  on transactions (transfer_group_id)
  where transfer_group_id is not null;

create trigger transactions_set_updated_at
  before update on transactions
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- transaction_tenders
--
-- The mixed-currency case in PRD Section 7: one purchase settled with $3 and
-- 20,000 riel. Modelling it as two transactions would double-count the purchase
-- in category totals, so the parent transaction carries the total and the
-- tenders record how it was actually paid.
--
-- Only populated when a payment used more than one currency; the common
-- single-currency case leaves this empty.
-- -----------------------------------------------------------------------------

create table transaction_tenders (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions (id) on delete cascade,
  account_id uuid references accounts (id) on delete set null,

  amount bigint not null,
  currency currency_code not null,
  exchange_rate numeric(18, 8),

  created_at timestamptz not null default now(),

  constraint transaction_tenders_amount_nonzero check (amount <> 0),
  constraint transaction_tenders_rate_positive check (exchange_rate is null or exchange_rate > 0)
);

create index transaction_tenders_transaction_idx on transaction_tenders (transaction_id);

-- -----------------------------------------------------------------------------
-- transaction_splits
--
-- PRD Section 8: one payment divided across categories, e.g. a supermarket run
-- that is part groceries and part household. The application guarantees the
-- splits sum to the parent amount using splitEvenly / splitByWeights, which are
-- built to preserve the total exactly.
-- -----------------------------------------------------------------------------

create table transaction_splits (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions (id) on delete cascade,
  category_id uuid references categories (id) on delete set null,

  amount bigint not null,
  currency currency_code not null,
  notes text,

  created_at timestamptz not null default now(),

  constraint transaction_splits_amount_nonzero check (amount <> 0)
);

create index transaction_splits_transaction_idx on transaction_splits (transaction_id);
create index transaction_splits_category_idx on transaction_splits (category_id);

-- -----------------------------------------------------------------------------
-- account_balances
--
-- Current balance is derived, not stored, so it can never disagree with the
-- ledger. PRD Section 6 lists current_balance as an account field; deriving it
-- in a view satisfies the requirement without the drift a cached column brings.
-- -----------------------------------------------------------------------------

create view account_balances
with (security_invoker = true)
as
select
  a.id as account_id,
  a.user_id,
  a.name,
  a.type,
  a.currency,
  a.include_in_net_worth,
  a.opening_balance
    + coalesce(sum(t.amount) filter (where t.deleted_at is null), 0) as current_balance,
  count(t.id) filter (where t.deleted_at is null) as transaction_count,
  max(t.occurred_at) filter (where t.deleted_at is null) as last_activity_at
from accounts a
left join transactions t on t.account_id = a.id
where a.deleted_at is null
group by a.id, a.user_id, a.name, a.type, a.currency, a.include_in_net_worth, a.opening_balance;

-- =============================================================================
-- Row Level Security (PRD Section 12)
--
-- Enabled on every user-facing table. Without this, Supabase's anon key would
-- expose the whole ledger to any caller, because the client talks to PostgREST
-- directly and the database is the only enforcement point.
-- =============================================================================

alter table profiles enable row level security;
alter table accounts enable row level security;
alter table categories enable row level security;
alter table merchants enable row level security;
alter table exchange_rates enable row level security;
alter table transactions enable row level security;
alter table transaction_tenders enable row level security;
alter table transaction_splits enable row level security;

-- profiles: a user sees only their own row, and cannot create or delete it
-- (the auth trigger owns creation, and deletion cascades from auth.users).
create policy profiles_select_own on profiles
  for select using (auth.uid() = id);
create policy profiles_update_own on profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Straightforward ownership on the tables that carry user_id.
create policy accounts_all_own on accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy categories_all_own on categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy merchants_all_own on merchants
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy transactions_all_own on transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- exchange_rates: global rows (user_id is null) are readable by everyone
-- because a published rate is not private, but only the service role may write
-- them. A user may write only their own overrides.
create policy exchange_rates_select on exchange_rates
  for select using (user_id is null or auth.uid() = user_id);
create policy exchange_rates_insert_own on exchange_rates
  for insert with check (auth.uid() = user_id);
create policy exchange_rates_update_own on exchange_rates
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy exchange_rates_delete_own on exchange_rates
  for delete using (auth.uid() = user_id);

-- Child tables carry no user_id, so ownership is reached through the parent
-- transaction. Without the EXISTS check these tables would be world-readable
-- even though `transactions` itself is locked down.
create policy transaction_tenders_all_own on transaction_tenders
  for all
  using (
    exists (
      select 1 from transactions t
      where t.id = transaction_tenders.transaction_id and t.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from transactions t
      where t.id = transaction_tenders.transaction_id and t.user_id = auth.uid()
    )
  );

create policy transaction_splits_all_own on transaction_splits
  for all
  using (
    exists (
      select 1 from transactions t
      where t.id = transaction_splits.transaction_id and t.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from transactions t
      where t.id = transaction_splits.transaction_id and t.user_id = auth.uid()
    )
  );
