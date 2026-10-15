-- Run immediately before 0015; after.sql verifies references and money survived.
create temporary table category_test_owner as select gen_random_uuid() as id;
insert into auth.users(id, email) select id, 'flat-categories@example.test' from category_test_owner;
insert into categories(user_id, name, applies_to)
select id, 'Coffee', array['expense']::transaction_type[] from category_test_owner;
insert into categories(user_id, name, applies_to)
select id, '☕️ Coffee', array['expense']::transaction_type[] from category_test_owner;

create temporary table category_note_cases(note text, expected text);
insert into category_note_cases values
  ('Brown Coffee','Drinks'), ('Koi Matcha','Drinks'), ('HeroTea','Drinks'), ('Coconut','Drinks'),
  ('Bingsu','Food'), ('Kuyteav','Food'), ('Malatang','Food'), ('Indy''s Steak','Food'),
  ('Fuel','Transportation'), ('Grab','Transportation'), ('Parking','Transportation'),
  ('Kampot','Trip'), ('Case and Belt','Shopping'), ('Donation','Charity'), ('Spotify','Subscription'),
  ('Movies','Social Life'), ('Water bill','Utilities'), ('Water','Drinks'), ('Grab delivery','Food'),
  ('pet food','Pets'), ('Football Betting','Betting'), ('eFootball Tournament','Game'),
  ('coffee fuel','Food'), ('Unknown note','Food');
insert into transactions(user_id, account_id, category_id, type, amount, currency, occurred_at, notes)
select o.id, a.id, c.id, 'expense', -123, 'USD', '2026-10-01T00:00:00Z', n.note
from category_test_owner o
join accounts a on a.user_id = o.id and a.name = 'ABA Dollar'
join categories c on c.user_id = o.id and c.name = 'Food & Drink'
cross join category_note_cases n;

insert into transactions(user_id, account_id, category_id, type, amount, currency, occurred_at)
select o.id, a.id, c.id, 'expense', -456, 'USD', '2026-10-01T00:00:00Z'
from category_test_owner o join accounts a on a.user_id = o.id and a.name = 'ABA Dollar'
join categories c on c.user_id = o.id and c.name = '☕️ Coffee';

insert into budgets(user_id, category_id, amount, currency, starts_on)
select o.id, c.id, 12345, 'USD', '2026-10-01' from category_test_owner o
join categories c on c.user_id = o.id and c.name = 'Coffee' and c.parent_id is null;
insert into recurring_transactions(user_id, account_id, category_id, type, amount, currency, frequency, starts_on, next_occurrence_on)
select o.id, a.id, c.id, 'expense', 333, 'USD', 'monthly', '2026-10-01', '2026-11-01'
from category_test_owner o join accounts a on a.user_id = o.id and a.name = 'ABA Dollar'
join categories c on c.user_id = o.id and c.name = 'Fuel';

-- A note on a split parent must not override the explicit allocation.
with parent as (
  insert into transactions(user_id, account_id, category_id, type, amount, currency, occurred_at, notes)
  select o.id, a.id, c.id, 'expense', -100, 'USD', '2026-10-01T00:00:00Z', 'Spotify'
  from category_test_owner o join accounts a on a.user_id = o.id and a.name = 'ABA Dollar'
  join categories c on c.user_id = o.id and c.name = 'Coffee' and c.parent_id is null returning *
)
insert into transaction_splits(transaction_id, category_id, amount, currency)
select id, category_id, -100, 'USD' from parent;

create temporary table category_money_before as
select id, user_id, account_id, amount, currency, exchange_rate, base_amount, base_currency, occurred_at, notes, type, deleted_at from transactions;
