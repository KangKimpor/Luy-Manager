-- =============================================================================
-- Default categories and the cold-start exchange rate.
--
-- Categories are seeded per user on signup rather than shared globally, because
-- PRD Section 10's auto-categorisation learns per person and users rename and
-- reorganise their own categories.
-- =============================================================================

-- The global USD/KHR starting point. The riel has been managed in a narrow band
-- around 4000-4100 for years, so this is a safe cold-start value that the rate
-- fetcher or a manual entry will supersede.
insert into exchange_rates (user_id, base_currency, quote_currency, rate, as_of, source)
values (null, 'USD', 'KHR', 4100, current_date, 'default')
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Per-user default categories, matched to the spending patterns in PRD Section 10.
-- -----------------------------------------------------------------------------

create or replace function seed_default_categories(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  food_id uuid;
  transport_id uuid;
begin
  -- Top-level expense categories.
  insert into categories (user_id, name, icon, color, applies_to, is_system, sort_order)
  values
    (target_user_id, 'Food & Drink', 'utensils', '#f97316', array['expense']::transaction_type[], true, 10),
    (target_user_id, 'Transport',    'car',      '#3b82f6', array['expense']::transaction_type[], true, 20),
    (target_user_id, 'Groceries',    'shopping-cart', '#22c55e', array['expense']::transaction_type[], true, 30),
    (target_user_id, 'Housing',      'home',     '#8b5cf6', array['expense']::transaction_type[], true, 40),
    (target_user_id, 'Utilities',    'zap',      '#eab308', array['expense']::transaction_type[], true, 50),
    (target_user_id, 'Health',       'heart-pulse', '#ef4444', array['expense']::transaction_type[], true, 60),
    (target_user_id, 'Shopping',     'shopping-bag', '#ec4899', array['expense']::transaction_type[], true, 70),
    (target_user_id, 'Entertainment','tv',       '#06b6d4', array['expense']::transaction_type[], true, 80),
    (target_user_id, 'Education',    'graduation-cap', '#14b8a6', array['expense']::transaction_type[], true, 90),
    (target_user_id, 'Fees & Charges','receipt', '#64748b', array['expense']::transaction_type[], true, 100),
    (target_user_id, 'Other',        'circle-dashed', '#94a3b8', array['expense']::transaction_type[], true, 900)
  on conflict do nothing;

  -- Income categories.
  insert into categories (user_id, name, icon, color, applies_to, is_system, sort_order)
  values
    (target_user_id, 'Salary',     'banknote', '#16a34a', array['income']::transaction_type[], true, 200),
    (target_user_id, 'Freelance',  'laptop',   '#0ea5e9', array['income']::transaction_type[], true, 210),
    (target_user_id, 'Gift',       'gift',     '#a855f7', array['income']::transaction_type[], true, 220),
    (target_user_id, 'Investment Income', 'trending-up', '#059669', array['income']::transaction_type[], true, 230),
    (target_user_id, 'Refund',     'rotate-ccw', '#f59e0b', array['income','refund']::transaction_type[], true, 240)
  on conflict do nothing;

  -- Two levels of grouping where it earns its keep. Coffee is the single most
  -- frequent entry for the target user, so it gets its own child category to
  -- keep "Spent $5 coffee" from landing in a generic bucket.
  select id into food_id from categories
    where user_id = target_user_id and name = 'Food & Drink' and deleted_at is null;

  select id into transport_id from categories
    where user_id = target_user_id and name = 'Transport' and deleted_at is null;

  if food_id is not null then
    insert into categories (user_id, parent_id, name, icon, color, applies_to, is_system, sort_order)
    values
      (target_user_id, food_id, 'Coffee',     'coffee', '#b45309', array['expense']::transaction_type[], true, 11),
      (target_user_id, food_id, 'Restaurant', 'utensils-crossed', '#ea580c', array['expense']::transaction_type[], true, 12),
      (target_user_id, food_id, 'Delivery',   'bike',   '#fb923c', array['expense']::transaction_type[], true, 13)
    on conflict do nothing;
  end if;

  if transport_id is not null then
    insert into categories (user_id, parent_id, name, icon, color, applies_to, is_system, sort_order)
    values
      (target_user_id, transport_id, 'Fuel',    'fuel', '#1d4ed8', array['expense']::transaction_type[], true, 21),
      (target_user_id, transport_id, 'Tuk Tuk / Grab', 'car-taxi-front', '#2563eb', array['expense']::transaction_type[], true, 22)
    on conflict do nothing;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Merchant rules behind the auto-categorisation examples in PRD Section 10.
-- -----------------------------------------------------------------------------

create or replace function seed_default_merchants(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rule record;
  category_id uuid;
begin
  for rule in
    select * from (values
      ('Starbucks',          'Coffee'),
      ('Brown Coffee',       'Coffee'),
      ('Amazon Cafe',        'Coffee'),
      ('Lucky Supermarket',  'Groceries'),
      ('Aeon',               'Groceries'),
      ('Chip Mong',          'Groceries'),
      ('Caltex',             'Fuel'),
      ('Total',              'Fuel'),
      ('PTT',                'Fuel'),
      ('Grab',               'Tuk Tuk / Grab'),
      ('Foodpanda',          'Delivery'),
      ('Nham24',             'Delivery')
    ) as t(merchant_name, category_name)
  loop
    select id into category_id from categories
      where user_id = target_user_id
        and name = rule.category_name
        and deleted_at is null
      limit 1;

    if category_id is not null then
      insert into merchants (user_id, name, normalized_name, default_category_id)
      values (
        target_user_id,
        rule.merchant_name,
        lower(regexp_replace(rule.merchant_name, '[^a-zA-Z0-9]+', '', 'g')),
        category_id
      )
      on conflict (user_id, normalized_name) do nothing;
    end if;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Wire the seeds into signup, extending the profile trigger from 0001.
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

  perform public.seed_default_categories(new.id);
  perform public.seed_default_merchants(new.id);

  return new;
end;
$$;
