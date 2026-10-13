do $$
begin
  if (select opening_balance from public.accounts where id = '20000000-0000-4000-8000-000000000001') <> 1200000 then raise exception 'KHR opening balance changed value'; end if;
  if (select opening_balance from public.accounts where id = '20000000-0000-4000-8000-000000000002') <> 10000 then raise exception 'USD opening balance changed'; end if;
  if (select amount from public.transactions where id = '30000000-0000-4000-8000-000000000001') <> -12300 then raise exception 'Native KHR not rescaled'; end if;
  if (select base_amount from public.transactions where id = '30000000-0000-4000-8000-000000000002') <> 2050000 then raise exception 'Stored KHR conversion not rescaled'; end if;
  if (select amount from public.transactions where id = '30000000-0000-4000-8000-000000000002') <> 500 then raise exception 'Native USD changed'; end if;
  if (select base_amount from public.transactions where id = '30000000-0000-4000-8000-000000000004') <> 1000 then raise exception 'Stored USD conversion changed'; end if;
  if (select amount from public.transactions where id = '30000000-0000-4000-8000-000000000005') <> -5000 then raise exception 'Deleted KHR not rescaled'; end if;
  if (select amount from public.transaction_tenders where transaction_id = '30000000-0000-4000-8000-000000000001') <> 2000 then raise exception 'Tender not rescaled'; end if;
  if (select amount from public.transaction_splits where transaction_id = '30000000-0000-4000-8000-000000000001') <> 2000 then raise exception 'Split not rescaled'; end if;
  if (select amount from public.budgets where user_id = '10000000-0000-4000-8000-000000000001') <> 1000000 then raise exception 'Budget not rescaled'; end if;
  if (select target_amount from public.savings_goals where user_id = '10000000-0000-4000-8000-000000000001') <> 2500000 then raise exception 'Goal not rescaled'; end if;
  if (select amount from public.recurring_transactions where user_id = '10000000-0000-4000-8000-000000000001') <> 50000 then raise exception 'Recurring amount not rescaled'; end if;
  if (select large_transaction_amount from public.settings where user_id = '10000000-0000-4000-8000-000000000001') <> 300000 then raise exception 'Threshold not rescaled'; end if;
  if exists(select 1 from public.telegram_logs where message_text = '500 riel' and consumed_at is null) then raise exception 'Legacy preview still active'; end if;
  if (select current_balance from public.account_balances where account_id = '20000000-0000-4000-8000-000000000001') <> 5187700 then raise exception 'Derived balance no longer reconciles'; end if;
  if public.ledger_precision_version() <> 2 then raise exception 'Wrong precision marker'; end if;
  if has_function_privilege('anon', 'public.ledger_precision_version()', 'execute') then raise exception 'Precision function exposed to anon'; end if;
  if not has_function_privilege('authenticated', 'public.ledger_precision_version()', 'execute') then raise exception 'Signed-in precision check unavailable'; end if;
end;
$$;

insert into public.transactions(id, user_id, account_id, type, amount, currency) values
  ('30000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'expense', -999355, 'KHR');
do $$
begin
  if (select current_balance from public.account_balances where account_id = '20000000-0000-4000-8000-000000000001') <> 4188345 then raise exception 'Fractional bank expense did not reconcile exactly'; end if;
end;
$$;
