-- The ledger list always constrains results to one owner and a date window.
-- These partial indexes keep the common account, category and type refinements
-- index-backed as history grows, without indexing soft-deleted rows.

create index transactions_user_account_occurred_idx
  on transactions (user_id, account_id, occurred_at desc)
  where deleted_at is null;

create index transactions_user_category_occurred_idx
  on transactions (user_id, category_id, occurred_at desc)
  where deleted_at is null;

create index transactions_user_type_occurred_idx
  on transactions (user_id, type, occurred_at desc)
  where deleted_at is null;
