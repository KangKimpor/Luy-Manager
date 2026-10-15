do $$
declare new_user uuid := gen_random_uuid();
begin
  if exists(select * from category_money_before except select id, user_id, account_id, amount, currency, exchange_rate, base_amount, base_currency, occurred_at, notes, type, deleted_at from transactions)
    or (select count(*) from transactions) <> (select count(*) from category_money_before)
  then raise exception 'Category migration changed ledger money or history'; end if;
  if exists(select 1 from categories where parent_id is not null)
  then raise exception 'Subcategories remain'; end if;
  if exists(select 1 from transactions t join category_note_cases n on n.note = t.notes
    join categories c on c.id = t.category_id join category_test_owner o on t.user_id = o.id
    where c.name <> n.expected and not exists(select 1 from transaction_splits s where s.transaction_id = t.id))
  then raise exception 'Note classification differs from expected categories'; end if;
  if exists(select 1 from transactions t join categories c on c.id = t.category_id
    join category_test_owner o on t.user_id = o.id where t.notes is null and c.name <> 'Drinks')
  then raise exception 'Imported emoji category did not consolidate'; end if;
  if not exists(select 1 from budgets b join categories c on c.id = b.category_id
    join category_test_owner o on b.user_id = o.id where b.amount = 12345 and c.name = 'Drinks')
  then raise exception 'Budget reference or amount lost'; end if;
  if not exists(select 1 from recurring_transactions r join categories c on c.id = r.category_id
    join category_test_owner o on r.user_id = o.id where r.amount = 333 and c.name = 'Transportation')
  then raise exception 'Recurring reference lost'; end if;
  if exists(select 1 from transaction_splits s join categories c on c.id = s.category_id where c.name <> 'Drinks')
  then raise exception 'Split allocation lost'; end if;
  if exists(select 1 from merchants m join categories c on c.id = m.default_category_id where c.deleted_at is not null)
  then raise exception 'Merchant references archived categories'; end if;
  if exists(select 1 from transactions t join categories c on c.id = t.category_id where c.user_id <> t.user_id or c.deleted_at is not null)
  then raise exception 'Wrong owner or archived transaction category'; end if;
  insert into auth.users(id, email) values(new_user, 'flat-signup@example.test');
  if (select count(*) from categories where user_id = new_user and deleted_at is null) <> (select count(*) from default_category_catalog())
  then raise exception 'Signup seeded a different catalog'; end if;
  if has_function_privilege('anon', 'public.default_category_catalog()', 'execute')
    or has_function_privilege('authenticated', 'public.seed_default_categories(uuid)', 'execute')
  then raise exception 'Internal seed function is exposed'; end if;
end;
$$;
