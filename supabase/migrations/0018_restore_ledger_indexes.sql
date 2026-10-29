-- =============================================================================
-- Restore critical ledger and trigger indexes dropped in migration 0016, and
-- index Telegram revision and report-sync lookups.
--
-- Why this migration is needed:
--
--   1. Migration 0016 dropped `transactions_user_occurred_idx`,
--      `transactions_account_idx`, and `transactions_transfer_group_idx` on the
--      assumption that the three composite indexes from migration 0010
--      ((user_id, account_id, occurred_at desc),
--       (user_id, category_id, occurred_at desc),
--       (user_id, type, occurred_at desc)) made them redundant.
--
--   2. In PostgreSQL B-tree indexes, a composite index with `account_id`,
--      `category_id`, or `type` as the second column cannot satisfy an
--      unfiltered range and sort scan on `(user_id, occurred_at desc, id desc)`.
--      The dashboard, reports, budget progress, and quick-add habit queries all
--      filter by `user_id`, `deleted_at is null`, and `occurred_at` without
--      filtering on `account_id`, `category_id`, or `type`.
--
--   3. Dropping `transactions_account_idx` left the `account_balances` view
--      (`left join transactions t on t.account_id = a.id`) and `deleteAccount`
--      without an index led by `account_id`. Including `amount` on the partial
--      index lets `account_balances` compute `sum(t.amount)`, `count(t.id)`,
--      and `max(t.occurred_at)` with an Index-Only Scan.
--
--   4. Dropping `transactions_transfer_group_idx` left the deferred constraint
--      trigger `assert_transfer_group_balanced()` (which runs on every transfer
--      insert, update, and soft delete) without an index on `transfer_group_id`.
--
--   5. Telegram report revision checks (`readLedgerRevision`) order by
--      `(user_id, updated_at desc)` and `refreshOnce` filters outbound report
--      logs by `(user_id, chat_id, created_at desc)`.
-- =============================================================================

create index if not exists transactions_user_occurred_idx
  on public.transactions (user_id, occurred_at desc, id desc)
  where deleted_at is null;

create index if not exists transactions_account_idx
  on public.transactions (account_id, occurred_at desc)
  include (amount)
  where deleted_at is null;

create index if not exists transactions_transfer_group_idx
  on public.transactions (transfer_group_id)
  where transfer_group_id is not null;

create index if not exists transactions_user_updated_idx
  on public.transactions (user_id, updated_at desc);

create index if not exists telegram_logs_outbound_reports_idx
  on public.telegram_logs (user_id, chat_id, created_at desc)
  where direction = 'outbound' and error_message is null and parsed is not null;
