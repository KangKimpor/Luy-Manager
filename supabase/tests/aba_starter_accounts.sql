-- Runs only against the isolated CI database; every fixture is rolled back.
begin;
do $$
declare
  owner_id uuid := gen_random_uuid();
  dollar_id uuid;
  riel_id uuid;
begin
  insert into auth.users (id, email) values (owner_id, 'starter-wallet-test@example.invalid');
  if (select count(*) from public.accounts where user_id = owner_id) <> 2 then
    raise exception 'Signup must create exactly two starter wallets';
  end if;
  select id into dollar_id from public.accounts where user_id = owner_id
    and name = 'ABA Dollar' and currency = 'USD' and type = 'bank' and institution = 'ABA'
    and opening_balance = 0 and is_active and deleted_at is null;
  select id into riel_id from public.accounts where user_id = owner_id
    and name = 'ABA Riel' and currency = 'KHR' and type = 'bank' and institution = 'ABA'
    and opening_balance = 0 and is_active and deleted_at is null;
  if dollar_id is null or riel_id is null then raise exception 'Starter currencies or balances are wrong'; end if;
  if not exists (select 1 from public.settings where user_id = owner_id and default_account_id = dollar_id) then
    raise exception 'ABA Dollar must be the initial default';
  end if;
  if has_function_privilege('anon', 'public.seed_default_accounts(uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.seed_default_accounts(uuid)', 'execute') then
    raise exception 'Starter seed must remain private';
  end if;
  update public.accounts set opening_balance = 1234 where id = dollar_id and user_id = owner_id;
  update public.settings set default_account_id = riel_id where user_id = owner_id;
  perform public.seed_default_accounts(owner_id);
  if (select count(*) from public.accounts where user_id = owner_id) <> 2
    or not exists (select 1 from public.accounts where id = dollar_id and user_id = owner_id and opening_balance = 1234)
    or not exists (select 1 from public.settings where user_id = owner_id and default_account_id = riel_id) then
    raise exception 'Repeated seeding must preserve wallets, balances and preferences';
  end if;
end;
$$;
rollback;
