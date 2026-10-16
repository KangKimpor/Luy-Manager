-- =============================================================================
-- Performance: cover unindexed foreign keys, drop superseded indexes.
--
-- The Supabase performance advisor flagged nine foreign keys without a covering
-- index and thirty-one unused indexes. This migration addresses the ones that
-- matter:
--
--   1. Add indexes on the nine unindexed FK columns. These speed up cascading
--      deletes, referential integrity checks, and any join that follows the FK.
--
--   2. Drop the five original transaction indexes from migration 0001 that were
--      superseded by the composite partial indexes in migration 0010. The
--      advisor confirms they have never been used. Keeping them adds write
--      overhead on every insert, update and delete without serving any read.
--
-- The remaining unused indexes are on Phase 2 tables (notifications, attachments,
-- audit_logs, etc.) whose features are not yet built. They are left in place
-- because they will be needed when those features ship; dropping and recreating
-- them later would be churn for no gain.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Unindexed foreign keys: add a covering index on each.
-- -----------------------------------------------------------------------------

create index if not exists budgets_category_id_idx
  on budgets (category_id);

create index if not exists merchants_default_category_id_idx
  on merchants (default_category_id);

create index if not exists recurring_account_id_idx
  on recurring_transactions (account_id);

create index if not exists recurring_category_id_idx
  on recurring_transactions (category_id);

create index if not exists recurring_merchant_id_idx
  on recurring_transactions (merchant_id);

create index if not exists savings_goals_account_id_idx
  on savings_goals (account_id);

create index if not exists settings_default_account_id_idx
  on settings (default_account_id);

create index if not exists telegram_logs_transaction_id_idx
  on telegram_logs (transaction_id);

create index if not exists transaction_tenders_account_id_idx
  on transaction_tenders (account_id);

-- -----------------------------------------------------------------------------
-- Superseded transaction indexes from migration 0001.
--
-- Migration 0010 added composite partial indexes that cover every query path
-- the app actually uses:
--
--   transactions_user_account_occurred_idx  (user_id, account_id, occurred_at)
--   transactions_user_category_occurred_idx (user_id, category_id, occurred_at)
--   transactions_user_type_occurred_idx     (user_id, type, occurred_at)
--
-- The five single-column indexes below are a strict subset of those, so the
-- planner never picks them. The advisor confirms zero usage.
-- -----------------------------------------------------------------------------

drop index if exists transactions_user_occurred_idx;
drop index if exists transactions_account_idx;
drop index if exists transactions_category_idx;
drop index if exists transactions_merchant_idx;
drop index if exists transactions_transfer_group_idx;
