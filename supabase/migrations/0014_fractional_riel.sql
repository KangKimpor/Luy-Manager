-- KHR bank statements contain hundredths of a riel. Keep BIGINT storage, moving
-- all existing KHR amounts from whole riel to hundredths without changing value.
-- Apply in a single transaction during a coordinated maintenance deployment.

lock table public.accounts, public.transactions, public.transaction_tenders,
  public.transaction_splits, public.budgets, public.savings_goals,
  public.recurring_transactions, public.settings, public.telegram_logs
  in share row exclusive mode;

do $$
declare
  target record;
  unsafe boolean;
  khr_scale constant bigint := 100;
  safe_before constant bigint := 90071992547409;
begin
  if to_regprocedure('public.ledger_precision_version()') is not null then
    raise exception 'Fractional riel migration is already applied. Refusing to rescale twice.';
  end if;
  for target in
    select * from (values
      ('accounts', 'opening_balance', 'currency'),
      ('transactions', 'amount', 'currency'),
      ('transactions', 'base_amount', 'base_currency'),
      ('transaction_tenders', 'amount', 'currency'),
      ('transaction_splits', 'amount', 'currency'),
      ('budgets', 'amount', 'currency'),
      ('savings_goals', 'target_amount', 'currency'),
      ('recurring_transactions', 'amount', 'currency'),
      ('settings', 'large_transaction_amount', 'large_transaction_currency')
    ) as fields(table_name, amount_column, currency_column)
  loop
    execute format('select exists (select 1 from public.%I where %I = $1 and (%I > $2 or %I < -$2))',
      target.table_name, target.currency_column, target.amount_column, target.amount_column)
      into unsafe using 'KHR'::public.currency_code, safe_before;
    if unsafe then
      raise exception 'KHR amount in %.% exceeds safe precision after rescaling. No data changed.', target.table_name, target.amount_column;
    end if;
    execute format('update public.%I set %I = %I * $1 where %I = $2',
      target.table_name, target.amount_column, target.amount_column, target.currency_column)
      using khr_scale, 'KHR'::public.currency_code;
  end loop;
end;
$$;

-- A preview parsed by the old bot carries the old units. Expire it, keep its
-- original message and parsed audit record, and require the user to resend.
update public.telegram_logs set consumed_at = now()
where consumed_at is null and (parsed ? 'pending' or parsed ? 'offered');

create function public.ledger_precision_version()
returns integer language sql immutable security invoker set search_path = ''
as $$ select 2; $$;
revoke execute on function public.ledger_precision_version() from public, anon;
grant execute on function public.ledger_precision_version() to authenticated, service_role;

comment on function public.ledger_precision_version() is
  'Ledger money format v2: USD cents and KHR hundredths of a riel. Rates remain major-unit ratios.';
