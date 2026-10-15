-- Replace the nested catalog, preserving ledger amounts and all references.
lock table public.categories, public.transactions, public.transaction_splits,
  public.budgets, public.recurring_transactions, public.merchants in share row exclusive mode;
create or replace function public.default_category_catalog()
returns table(name text, icon text, kind public.transaction_type, keywords text, sort_order integer)
language sql immutable set search_path = public
as $catalog$
  values
    ('Food', 'pizza', 'expense'::public.transaction_type, 'food;meal;breakfast;lunch;dinner;restaurant;dining;bingsu;kuyteav;malatang;indy;indy s;indys;noodle;boat noodle;duck noodle;udon;banh canh;steak;burger;stable burger;burrito;pizza;spaghetti;bread;fried bread;breadtalk;marugame;trattoria;dumpling;mochi;ice cream;dq;snow yogurt;beef;ginger rice;chicken run;kaixin;foodpanda;nham24;wownow;grab delivery', 0),
    ('Drinks', 'drink', 'expense'::public.transaction_type, 'drink;drinks;coffee;cafe;latte;espresso;brown;brown coffee;koi;matcha;herotea;hero tea;coconut;tea;water;pepsi;soda;starbucks;amazon cafe;boost;baytea3', 1),
    ('Groceries', 'basket', 'expense'::public.transaction_type, 'groceries;grocery;supermarket;lucky supermarket;aeon;chip mong', 2),
    ('Transportation', 'road', 'expense'::public.transaction_type, 'transport;transportation;fuel;petrol;gasoline;grab;parking;tuk tuk;taxi;passapp;bus;caltex;ptt;total;oil change;motowash;bike repair', 3),
    ('Housing', 'home', 'expense'::public.transaction_type, 'housing;rent;mortgage', 4),
    ('Utilities', 'lamp', 'expense'::public.transaction_type, 'utilities;electricity;electric bill;edc;water bill', 5),
    ('Phone & Internet', 'wifi', 'expense'::public.transaction_type, 'internet;wifi;phone bill;mobile top up;cellcard;smart top up;metfone', 6),
    ('Shopping', 'bag', 'expense'::public.transaction_type, 'shopping;case;belt;clothing;clothes;shirt;shoes;electronics;computer;laptop;phone case', 7),
    ('Health', 'stethoscope', 'expense'::public.transaction_type, 'health;medical;doctor;hospital;pharmacy;medicine;medication;dental;dentist;antadys', 8),
    ('Personal Care', 'pipette', 'expense'::public.transaction_type, 'personal care;selfcare;haircut;salon;beauty;skincare', 9),
    ('Fitness', 'trophy', 'expense'::public.transaction_type, 'fitness;gym;football;futsal;sport', 10),
    ('Social Life', 'chat-smile', 'expense'::public.transaction_type, 'social life;entertainment;cinema;movie;movies;bowling;karaoke;selfie booth;playground;obsession ticket;supergirl ticket', 11),
    ('Game', 'gamepad', 'expense'::public.transaction_type, 'game;games;gaming;efootball;pes;card game;efootball tournament;efootball top up;efootball account;efootball league', 12),
    ('Subscription', 'refresh', 'expense'::public.transaction_type, 'subscription;subscriptions;netflix;spotify;youtube premium;icloud;chatgpt', 13),
    ('Trip', 'suitcase', 'expense'::public.transaction_type, 'trip;travel;holiday;vacation;kampot;kep;siem reap;flight;flights;airfare;hotel;hotels;accommodation;kampot trip accommodation', 14),
    ('Family & Kids', 'group', 'expense'::public.transaction_type, 'family;kids;childcare', 15),
    ('Pets', 'favorite', 'expense'::public.transaction_type, 'pets;pet;vet;pet food', 16),
    ('Gifts', 'gift', 'expense'::public.transaction_type, 'gift;gifts;present;flower;flowers', 17),
    ('Charity', 'check-ring', 'expense'::public.transaction_type, 'charity;donation;donations;wat', 18),
    ('Education', 'mortarboard', 'expense'::public.transaction_type, 'education;school;tuition;course;english book', 19),
    ('Fees & Charges', 'paper', 'expense'::public.transaction_type, 'fee;fees;bank fee;charges', 20),
    ('Insurance', 'chield-check', 'expense'::public.transaction_type, 'insurance', 21),
    ('Taxes', 'notebook', 'expense'::public.transaction_type, 'tax;taxes', 22),
    ('Debt Payments', 'credit-card', 'expense'::public.transaction_type, 'debt;loan payment;credit card payment', 23),
    ('Repairs & Maintenance', 'setting-alt-line', 'expense'::public.transaction_type, 'repair;repairs;maintenance', 24),
    ('Business', 'tie', 'expense'::public.transaction_type, 'business', 25),
    ('Savings Contributions', 'wallet-alt', 'expense'::public.transaction_type, 'savings contribution', 26),
    ('Trading', 'candlestick', 'expense'::public.transaction_type, 'trading;investment purchase', 27),
    ('Betting', 'critical', 'expense'::public.transaction_type, 'bet;betting;football betting', 28),
    ('Other', 'widget', 'expense'::public.transaction_type, 'other', 29),
    ('Salary', 'money', 'income'::public.transaction_type, 'salary;payroll;wages', 30),
    ('Freelance', 'desktop', 'income'::public.transaction_type, 'freelance;freelancing', 31),
    ('Gift', 'star', 'income'::public.transaction_type, 'gift;gifts', 32),
    ('Investment Income', 'chart', 'income'::public.transaction_type, 'investment income;dividend;dividends', 33),
    ('Refund', 'refund-back', 'income'::public.transaction_type, 'refund;reimbursement', 34),
    ('Bonus', 'sparkle', 'income'::public.transaction_type, 'bonus', 35),
    ('Sales', 'shop', 'income'::public.transaction_type, 'sales;sale', 36),
    ('Rental Income', 'key', 'income'::public.transaction_type, 'rental income', 37),
    ('Interest', 'line-up', 'income'::public.transaction_type, 'interest', 38),
    ('Allowance', 'wallet', 'income'::public.transaction_type, 'allowance', 39),
    ('Petty Cash', 'horizontal-switch', 'income'::public.transaction_type, 'petty cash', 40),
    ('Tournament Prize', 'target', 'income'::public.transaction_type, 'tournament prize;prize;winnings', 41),
    ('Other Income', 'layers', 'income'::public.transaction_type, 'other income', 42),
    ('Balance Adjustment', 'colum-up', 'adjustment'::public.transaction_type, 'balance adjustment;modified bal', 43)
$catalog$;
revoke all on function public.default_category_catalog() from public, anon, authenticated;

create or replace function public.seed_default_categories(target_user_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  insert into public.categories(user_id, name, icon, applies_to, is_system, sort_order)
  select target_user_id, d.name, d.icon,
    case when d.name = 'Refund' then array['income','refund']::public.transaction_type[] else array[d.kind] end,
    true, d.sort_order
  from public.default_category_catalog() d
  where not exists (select 1 from public.categories c where c.user_id = target_user_id
    and c.deleted_at is null and c.parent_id is null and lower(c.name) = lower(d.name))
  on conflict do nothing;

  update public.categories c set name = d.name, icon = d.icon, sort_order = d.sort_order,
    applies_to = case when d.name = 'Refund' then array['income','refund']::public.transaction_type[] else array[d.kind] end
  from public.default_category_catalog() d
  where c.user_id = target_user_id and c.deleted_at is null and c.parent_id is null and lower(c.name) = lower(d.name);
end;
$$;
revoke all on function public.seed_default_categories(uuid) from public, anon, authenticated;

-- Existing signup calls this function after the main seed; the catalog is now complete there.
create or replace function public.seed_extended_categories(target_user_id uuid)
returns void language plpgsql security definer set search_path = public
as $$ begin return; end; $$;
revoke all on function public.seed_extended_categories(uuid) from public, anon, authenticated;

create or replace function public.seed_default_merchants(target_user_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  insert into public.merchants(user_id, name, normalized_name, default_category_id)
  select target_user_id, m.name, lower(regexp_replace(m.name, '[^a-zA-Z0-9]+', '', 'g')), c.id
  from (values ('Starbucks','Drinks'), ('Brown Coffee','Drinks'), ('Amazon Cafe','Drinks'),
    ('Lucky Supermarket','Groceries'), ('Aeon','Groceries'), ('Chip Mong','Groceries'),
    ('Caltex','Transportation'), ('Total','Transportation'), ('PTT','Transportation'),
    ('Grab','Transportation'), ('Foodpanda','Food'), ('Nham24','Food')) m(name, category)
  join public.categories c on c.user_id = target_user_id and c.name = m.category and c.deleted_at is null
  on conflict (user_id, normalized_name) do nothing;
end;
$$;
revoke all on function public.seed_default_merchants(uuid) from public, anon, authenticated;

do $$ declare owner_id uuid; begin
  for owner_id in select id from public.profiles loop
    perform public.seed_default_categories(owner_id);
  end loop;
end; $$;

create temporary table category_aliases (old_name text, new_name text, kind text) on commit drop;
insert into category_aliases values
  ('food', 'Food', 'expense'),
  ('drinks', 'Drinks', 'expense'),
  ('groceries', 'Groceries', 'expense'),
  ('transportation', 'Transportation', 'expense'),
  ('housing', 'Housing', 'expense'),
  ('utilities', 'Utilities', 'expense'),
  ('phone internet', 'Phone & Internet', 'expense'),
  ('shopping', 'Shopping', 'expense'),
  ('health', 'Health', 'expense'),
  ('personal care', 'Personal Care', 'expense'),
  ('fitness', 'Fitness', 'expense'),
  ('social life', 'Social Life', 'expense'),
  ('game', 'Game', 'expense'),
  ('subscription', 'Subscription', 'expense'),
  ('trip', 'Trip', 'expense'),
  ('family kids', 'Family & Kids', 'expense'),
  ('pets', 'Pets', 'expense'),
  ('gifts', 'Gifts', 'expense'),
  ('charity', 'Charity', 'expense'),
  ('education', 'Education', 'expense'),
  ('fees charges', 'Fees & Charges', 'expense'),
  ('insurance', 'Insurance', 'expense'),
  ('taxes', 'Taxes', 'expense'),
  ('debt payments', 'Debt Payments', 'expense'),
  ('repairs maintenance', 'Repairs & Maintenance', 'expense'),
  ('business', 'Business', 'expense'),
  ('savings contributions', 'Savings Contributions', 'expense'),
  ('trading', 'Trading', 'expense'),
  ('betting', 'Betting', 'expense'),
  ('other', 'Other', 'expense'),
  ('salary', 'Salary', 'income'),
  ('freelance', 'Freelance', 'income'),
  ('gift', 'Gift', 'income'),
  ('investment income', 'Investment Income', 'income'),
  ('refund', 'Refund', 'income'),
  ('bonus', 'Bonus', 'income'),
  ('sales', 'Sales', 'income'),
  ('rental income', 'Rental Income', 'income'),
  ('interest', 'Interest', 'income'),
  ('allowance', 'Allowance', 'income'),
  ('petty cash', 'Petty Cash', 'income'),
  ('tournament prize', 'Tournament Prize', 'income'),
  ('other income', 'Other Income', 'income'),
  ('balance adjustment', 'Balance Adjustment', 'adjustment'),
  ('food drink', 'Food', 'expense'),
  ('food drinks', 'Food', 'expense'),
  ('restaurant', 'Food', 'expense'),
  ('delivery', 'Food', 'expense'),
  ('coffee', 'Drinks', 'expense'),
  ('transport', 'Transportation', 'expense'),
  ('fuel', 'Transportation', 'expense'),
  ('tuk tuk grab', 'Transportation', 'expense'),
  ('rent', 'Housing', 'expense'),
  ('electricity', 'Utilities', 'expense'),
  ('water', 'Utilities', 'expense'),
  ('clothing', 'Shopping', 'expense'),
  ('electronics', 'Shopping', 'expense'),
  ('medical', 'Health', 'expense'),
  ('dental', 'Health', 'expense'),
  ('entertainment', 'Social Life', 'expense'),
  ('subscriptions', 'Subscription', 'expense'),
  ('travel', 'Trip', 'expense'),
  ('flights', 'Trip', 'expense'),
  ('hotels', 'Trip', 'expense'),
  ('gifts donations', 'Gifts', 'expense'),
  ('internet', 'Phone & Internet', 'expense'),
  ('selfcare', 'Personal Care', 'expense'),
  ('modified bal', 'Balance Adjustment', 'adjustment'),
  ('gift', 'Gifts', 'expense');
create temporary table category_remap (old_id uuid primary key, new_id uuid not null, user_id uuid not null) on commit drop;
insert into category_remap
select distinct old.id, target.id, old.user_id
from public.categories old
join category_aliases a on a.old_name = trim(regexp_replace(lower(old.name), '[^[:alnum:]]+', ' ', 'g'))
  and a.kind::public.transaction_type = any(old.applies_to)
join public.categories target on target.user_id = old.user_id and target.name = a.new_name
  and target.deleted_at is null and target.parent_id is null
where old.deleted_at is null and old.id <> target.id;

-- Also flatten custom categories with duplicate names without losing their references.
insert into category_remap
select id, target_id, user_id from (
  select c.id, c.user_id, first_value(c.id) over(partition by c.user_id, lower(c.name)
    order by (c.parent_id is null) desc, c.created_at, c.id) as target_id
  from public.categories c where c.deleted_at is null
    and not exists(select 1 from category_remap m where m.old_id = c.id)
) duplicates where id <> target_id;

-- Two independent budget caps cannot be merged without choosing new semantics.
-- Fail atomically instead of deleting a budget or summing incompatible currencies.
do $$ begin
  if exists(select 1 from public.budgets b left join category_remap m on m.old_id = b.category_id and m.user_id = b.user_id
    where b.deleted_at is null and b.category_id is not null
    group by b.user_id, coalesce(m.new_id, b.category_id), b.period, b.starts_on having count(*) > 1)
  then raise exception 'Consolidating categories would overlap budget caps. Resolve those caps before migrating.'; end if;
end; $$;

update public.transactions t set category_id = m.new_id from category_remap m where t.category_id = m.old_id and t.user_id = m.user_id;
update public.transaction_splits s set category_id = m.new_id from category_remap m where s.category_id = m.old_id and exists(select 1 from public.transactions t where t.id = s.transaction_id and t.user_id = m.user_id);
update public.budgets b set category_id = m.new_id from category_remap m where b.category_id = m.old_id and b.user_id = m.user_id;
update public.recurring_transactions r set category_id = m.new_id from category_remap m where r.category_id = m.old_id and r.user_id = m.user_id;
update public.merchants r set default_category_id = m.new_id from category_remap m where r.default_category_id = m.old_id and r.user_id = m.user_id;
update public.categories c set deleted_at = now() from category_remap m where c.id = m.old_id and c.user_id = m.user_id;
update public.categories set parent_id = null where parent_id is not null;
alter table public.categories add constraint categories_flat check (parent_id is null);

-- Reclassify existing notes with the same complete-phrase, longest-unique-match rule.
-- Split entries keep their explicit allocations. Transfers keep their identity.
with descriptors as (
  select t.id, t.user_id, t.type, trim(regexp_replace(lower(t.notes), '[^[:alnum:]]+', ' ', 'g')) as note
  from public.transactions t where t.type in ('expense','income','refund') and t.notes is not null
    and not exists(select 1 from public.transaction_splits s where s.transaction_id = t.id)
), matches as (
  select distinct t.id, t.user_id, d.name, cardinality(string_to_array(k.phrase, ' ')) as score
  from descriptors t join public.default_category_catalog() d on d.kind = case when t.type = 'refund' then 'income'::public.transaction_type else t.type end
  cross join lateral unnest(string_to_array(d.keywords, ';')) k(phrase)
  where strpos(' ' || t.note || ' ', ' ' || k.phrase || ' ') > 0
), ranked as (
  select *, max(score) over(partition by id) as best_score from matches
), winners as (
  select id, user_id, min(name) as name from ranked where score = best_score
  group by id, user_id having count(distinct name) = 1
)
update public.transactions t set category_id = c.id from winners w
join public.categories c on c.user_id = w.user_id and c.name = w.name and c.deleted_at is null
where t.id = w.id and t.user_id = w.user_id;

-- Preserve an explicit fallback for entries without enough information to infer intent.
update public.transactions t set category_id = c.id
from public.categories c
where t.user_id = c.user_id and c.deleted_at is null and t.type in ('expense','income','refund')
  and c.name = case when t.type = 'expense' then 'Other' else 'Other Income' end
  and (t.category_id is null or exists(select 1 from public.categories prior where prior.id = t.category_id and not (t.type = any(prior.applies_to))))
  and not exists(select 1 from public.transaction_splits s where s.transaction_id = t.id);
