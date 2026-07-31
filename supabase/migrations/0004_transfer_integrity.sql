-- =============================================================================
-- Enforce that a transfer is always exactly two balanced legs.
--
-- Gap this closes:
--
-- Migration 0001 models a transfer as two rows sharing a `transfer_group_id`,
-- and constrains only that a transfer row has a group at all:
--
--     constraint transactions_transfer_has_group
--       check (type <> 'transfer' or transfer_group_id is not null)
--
-- Nothing stopped a group from holding one leg, three legs, two legs on the same
-- account, or two legs with the same sign. Each of those is money appearing or
-- disappearing from the ledger:
--
--   * One leg alone debits an account and credits nothing. The user's net worth
--     silently drops by the transfer amount.
--   * Two legs of the same sign debit twice, which reads as a transfer that cost
--     the user double.
--   * Both legs on one account nets to zero but reports two transactions against
--     an account that never moved money anywhere.
--
-- A partially written transfer is the failure mode that matters most here,
-- because a client can crash between two inserts. The constraint triggers below
-- are DEFERRABLE INITIALLY DEFERRED, which is what makes a two-row insert legal:
-- the check runs once at COMMIT, when both legs are present, rather than after
-- the first row when the group necessarily looks incomplete.
--
-- Conventions applied: sign convention from 0001 (outflow negative, inflow
-- positive), and the currency-per-account rule from 0003 — a cross-currency
-- transfer's legs differ in both amount and currency, so the two magnitudes are
-- deliberately NOT compared. Only the count, the signs and the accounts are.
-- =============================================================================

create or replace function assert_transfer_group_balanced()
returns trigger
language plpgsql
as $$
declare
  group_id uuid;
  leg_count int;
  outflow_count int;
  inflow_count int;
  account_count int;
begin
  -- Fires for both INSERT and DELETE, so take whichever row is present. On
  -- DELETE the group still has to be valid afterwards: removing one leg of a
  -- settled transfer would leave the other stranded.
  group_id := coalesce(new.transfer_group_id, old.transfer_group_id);

  if group_id is null then
    return null;
  end if;

  select
    count(*),
    count(*) filter (where amount < 0),
    count(*) filter (where amount > 0),
    count(distinct account_id)
  into leg_count, outflow_count, inflow_count, account_count
  from transactions
  where transfer_group_id = group_id
    and deleted_at is null;

  -- A fully soft-deleted transfer is a legitimate end state: both legs were
  -- reversed together, so there is nothing left to balance.
  if leg_count = 0 then
    return null;
  end if;

  if leg_count <> 2 then
    raise exception
      'Transfer group % has % active leg(s); a transfer must have exactly two. '
      'Insert both legs in one statement so they commit together.',
      group_id, leg_count
      using errcode = 'check_violation';
  end if;

  if outflow_count <> 1 or inflow_count <> 1 then
    raise exception
      'Transfer group % must have one negative leg and one positive leg, '
      'found % negative and % positive. A zero-amount leg is not a transfer.',
      group_id, outflow_count, inflow_count
      using errcode = 'check_violation';
  end if;

  if account_count <> 2 then
    raise exception
      'Transfer group % has both legs on the same account. Money must actually '
      'move between two accounts.',
      group_id
      using errcode = 'check_violation';
  end if;

  return null;
end;
$$;

-- A CONSTRAINT TRIGGER rather than a plain one: only constraint triggers can be
-- deferred to COMMIT, and without deferral the first of the two legs would
-- always fail its own check.
create constraint trigger transactions_transfer_group_balanced
  after insert or update or delete on transactions
  deferrable initially deferred
  for each row execute function assert_transfer_group_balanced();

-- -----------------------------------------------------------------------------
-- A group id belongs to a transfer and nothing else. Without this, an expense
-- could carry a transfer_group_id and be counted as a leg by the check above,
-- or be excluded from spending totals by the aggregators in
-- src/lib/domain/transactions.ts, which skip rows by `type`.
-- -----------------------------------------------------------------------------

alter table transactions
  add constraint transactions_group_only_for_transfers
  check (transfer_group_id is null or type = 'transfer');

-- -----------------------------------------------------------------------------
-- A transfer leg is never zero. Zero would satisfy neither the negative nor the
-- positive count above, and a transfer of nothing is a data-entry error rather
-- than a fact worth recording.
-- -----------------------------------------------------------------------------

alter table transactions
  add constraint transactions_transfer_is_non_zero
  check (type <> 'transfer' or amount <> 0);

comment on function assert_transfer_group_balanced() is
  'Deferred check that each transfer_group_id holds exactly two active legs, one '
  'negative and one positive, on two different accounts. Magnitudes are not '
  'compared because a cross-currency transfer legitimately differs on each side.';
