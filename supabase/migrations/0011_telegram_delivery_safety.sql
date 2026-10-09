-- A Telegram update can arrive twice, including concurrently. Claim its id
-- before doing any work so a retry never creates another ledger entry or undoes
-- the next transaction. Existing logs retain a null id for compatibility.
alter table telegram_logs add column update_id bigint;
alter table telegram_logs add column consumed_at timestamptz;

create unique index telegram_logs_inbound_update_unique
  on telegram_logs (update_id)
  where direction = 'inbound' and update_id is not null;

-- Confirmation uses an atomic update conditioned on consumed_at being null.
-- RLS and the append-only client guard from 0007 still apply; only the service
-- role may claim updates or consume offers.
comment on column telegram_logs.update_id is
  'Telegram delivery id. Unique for inbound updates to prevent duplicate writes.';
comment on column telegram_logs.consumed_at is
  'The instant a pending confirmation was claimed. A second claim matches no row.';
