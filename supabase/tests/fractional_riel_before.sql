insert into auth.users(id, email) values
  ('10000000-0000-4000-8000-000000000001', 'precision-test@example.invalid'),
  ('10000000-0000-4000-8000-000000000002', 'precision-other@example.invalid');
insert into public.accounts(id, user_id, name, type, currency, opening_balance) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Precision KHR', 'bank', 'KHR', 12000),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'Precision USD', 'bank', 'USD', 10000),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', 'Other KHR', 'bank', 'KHR', 5000);
insert into public.transactions(id, user_id, account_id, type, amount, currency, base_amount, base_currency, exchange_rate, transfer_group_id, deleted_at) values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'expense', -123, 'KHR', null, null, null, null, null),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 'income', 500, 'USD', 20500, 'KHR', 4100, null, null),
  ('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 'transfer', -1000, 'USD', null, null, null, '40000000-0000-4000-8000-000000000001', null),
  ('30000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'transfer', 40000, 'KHR', 1000, 'USD', 0.00025, '40000000-0000-4000-8000-000000000001', null),
  ('30000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'expense', -50, 'KHR', null, null, null, null, now());
insert into public.transaction_tenders(transaction_id, account_id, amount, currency) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 20, 'KHR');
insert into public.transaction_splits(transaction_id, amount, currency) values
  ('30000000-0000-4000-8000-000000000001', 20, 'KHR');
insert into public.budgets(user_id, amount, currency, period, starts_on) values
  ('10000000-0000-4000-8000-000000000001', 10000, 'KHR', 'monthly', '2026-10-01');
insert into public.savings_goals(user_id, name, target_amount, currency) values
  ('10000000-0000-4000-8000-000000000001', 'Precision goal', 25000, 'KHR');
insert into public.recurring_transactions(user_id, account_id, type, amount, currency, frequency, starts_on, next_occurrence_on) values
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'expense', 500, 'KHR', 'monthly', '2026-10-01', '2026-11-01');
update public.settings set large_transaction_amount = 3000, large_transaction_currency = 'KHR'
  where user_id = '10000000-0000-4000-8000-000000000001';
insert into public.telegram_logs(user_id, chat_id, direction, message_text, parsed) values
  ('10000000-0000-4000-8000-000000000001', 99, 'inbound', '500 riel', '{"pending":{"kind":"record","amount":{"minor":500,"currency":"KHR"}}}');
