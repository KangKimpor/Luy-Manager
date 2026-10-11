-- Starter wallets are seeded at signup only, so existing users keep their wallets.
create or replace function seed_default_accounts(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.accounts (user_id, name, institution, type, currency, opening_balance, icon, sort_order)
  values
    (target_user_id, 'ABA Dollar', 'ABA', 'bank', 'USD', 0, 'landmark', 0),
    (target_user_id, 'ABA Riel', 'ABA', 'bank', 'KHR', 0, 'landmark', 1)
  on conflict (user_id, lower(name)) where deleted_at is null do nothing;

  insert into public.settings (user_id, default_account_id)
  select target_user_id, id from public.accounts
  where user_id = target_user_id and name = 'ABA Dollar' and currency = 'USD'
    and is_active and deleted_at is null
  on conflict (user_id) do update
  set default_account_id = excluded.default_account_id
  where public.settings.default_account_id is null;
end;
$$;
revoke all on function seed_default_accounts(uuid) from public, anon, authenticated;

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
  perform public.seed_default_accounts(new.id);
  perform public.seed_default_categories(new.id);
  perform public.seed_extended_categories(new.id);
  perform public.seed_default_merchants(new.id);
  return new;
end;
$$;
revoke all on function handle_new_user() from public, anon, authenticated;
