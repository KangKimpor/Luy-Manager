-- =============================================================================
-- Enforce that a transaction is denominated in its account's currency.
--
-- Gap this closes:
--
-- `accounts.currency` and `transactions.currency` were declared independently,
-- with nothing tying them together. But the `account_balances` view computes
--
--     a.opening_balance + sum(t.amount)
--
-- and labels the result with `a.currency`. If a KHR transaction were ever
-- recorded against a USD account, that expression would add whole riel to US
-- cents and report the result as dollars. The balance would be wrong by roughly
-- 100x and nothing would raise an error.
--
-- A CHECK constraint cannot reference another table, so this is a trigger.
--
-- Multi-currency payments are unaffected: they are the reason
-- `transaction_tenders` exists. The parent transaction stays in the account's
-- currency and the tender rows carry the individual currencies tendered.
-- =============================================================================

create or replace function assert_transaction_currency_matches_account()
returns trigger
language plpgsql
as $$
declare
  account_currency currency_code;
begin
  select currency into account_currency
  from accounts
  where id = new.account_id;

  if account_currency is null then
    raise exception 'Account % does not exist', new.account_id
      using errcode = 'foreign_key_violation';
  end if;

  if new.currency <> account_currency then
    raise exception
      'Transaction currency % does not match account currency % for account %. '
      'An account is single-currency; use transaction_tenders for a payment '
      'settled in more than one currency.',
      new.currency, account_currency, new.account_id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger transactions_currency_matches_account
  before insert or update of account_id, currency on transactions
  for each row execute function assert_transaction_currency_matches_account();

-- -----------------------------------------------------------------------------
-- Splits divide the parent transaction, so they share its currency. A split in
-- a different currency could not sum to the parent amount, which is the one
-- invariant splits exist to preserve.
-- -----------------------------------------------------------------------------

create or replace function assert_split_currency_matches_transaction()
returns trigger
language plpgsql
as $$
declare
  parent_currency currency_code;
begin
  select currency into parent_currency
  from transactions
  where id = new.transaction_id;

  if parent_currency is not null and new.currency <> parent_currency then
    raise exception
      'Split currency % does not match parent transaction currency %.',
      new.currency, parent_currency
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger transaction_splits_currency_matches_parent
  before insert or update of transaction_id, currency on transaction_splits
  for each row execute function assert_split_currency_matches_transaction();

-- -----------------------------------------------------------------------------
-- A tender may be in any currency, since that is the point. But when it names
-- an account, it debits that account, so it must match that account's currency.
-- -----------------------------------------------------------------------------

create or replace function assert_tender_currency_matches_account()
returns trigger
language plpgsql
as $$
declare
  account_currency currency_code;
begin
  -- A tender with no account is cash not tracked to a specific account.
  if new.account_id is null then
    return new;
  end if;

  select currency into account_currency
  from accounts
  where id = new.account_id;

  if account_currency is not null and new.currency <> account_currency then
    raise exception
      'Tender currency % does not match account currency % for account %.',
      new.currency, account_currency, new.account_id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger transaction_tenders_currency_matches_account
  before insert or update of account_id, currency on transaction_tenders
  for each row execute function assert_tender_currency_matches_account();

-- -----------------------------------------------------------------------------
-- Document the invariant at the view, so the next reader knows why summing
-- across rows without converting is sound here.
-- -----------------------------------------------------------------------------

comment on view account_balances is
  'Derived balances. Summing transactions.amount without conversion is safe '
  'because the transactions_currency_matches_account trigger guarantees every '
  'transaction on an account shares that account''s currency.';
