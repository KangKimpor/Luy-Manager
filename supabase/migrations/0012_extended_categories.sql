-- Broader everyday coverage without renaming categories or moving ledger rows.
-- Existing custom/imported names win; only missing categories are inserted.
create or replace function seed_extended_categories(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.categories (user_id, name, icon, applies_to, is_system, sort_order)
  select target_user_id, defaults.name, defaults.icon,
    array[defaults.kind::public.transaction_type], true, defaults.sort_order
  from (values
    ('Travel', 'plane', 'expense', 110),
    ('Personal Care', 'sparkles', 'expense', 120),
    ('Fitness', 'dumbbell', 'expense', 130),
    ('Subscriptions', 'repeat', 'expense', 140),
    ('Insurance', 'shield-check', 'expense', 150),
    ('Taxes', 'landmark', 'expense', 160),
    ('Debt Payments', 'credit-card', 'expense', 170),
    ('Family & Kids', 'users', 'expense', 180),
    ('Pets', 'paw-print', 'expense', 190),
    ('Gifts & Donations', 'gift', 'expense', 200),
    ('Business', 'briefcase-business', 'expense', 210),
    ('Repairs & Maintenance', 'wrench', 'expense', 220),
    ('Phone & Internet', 'wifi', 'expense', 230),
    ('Savings Contributions', 'piggy-bank', 'expense', 240),
    ('Rent', 'house', 'expense', 41),
    ('Electricity', 'zap', 'expense', 51),
    ('Water', 'droplets', 'expense', 52),
    ('Clothing', 'shirt', 'expense', 71),
    ('Electronics', 'smartphone', 'expense', 72),
    ('Medical', 'heart-pulse', 'expense', 61),
    ('Dental', 'heart-pulse', 'expense', 62),
    ('Flights', 'plane', 'expense', 111),
    ('Hotels', 'hotel', 'expense', 112),
    ('Bonus', 'banknote', 'income', 250),
    ('Sales', 'store', 'income', 260),
    ('Rental Income', 'house', 'income', 270),
    ('Interest', 'trending-up', 'income', 280),
    ('Other Income', 'circle-dashed', 'income', 290)
  ) as defaults(name, icon, kind, sort_order)
  where not exists (
    select 1 from public.categories existing
    where existing.user_id = target_user_id and existing.deleted_at is null
      and lower(existing.name) = lower(defaults.name)
  )
  on conflict do nothing;
end;
$$;

-- An owner argument must remain internal, like the original seed functions.
revoke all on function seed_extended_categories(uuid) from public, anon, authenticated;

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
  perform public.seed_extended_categories(new.id);
  perform public.seed_default_merchants(new.id);
  return new;
end;
$$;
revoke all on function handle_new_user() from public, anon, authenticated;

do $$
declare owner_id uuid;
begin
  for owner_id in select id from public.profiles loop
    perform public.seed_extended_categories(owner_id);
  end loop;
end;
$$;
