# Message grammar

The complete set of messages the bot understands, and the exact rules for
resolving the ambiguous parts. Implemented in `src/lib/telegram/parse.ts`, and
every row below is asserted in `src/lib/telegram/parse.test.ts`.

## Shape

```
[verb] <amount>[unit] [description]
```

Only the amount is mandatory. Everything else is inferred, and every inference
costs confidence.

## Recognised verbs

| Direction | Words | Result |
| --- | --- | --- |
| Expense | spent, spend, paid, pay, bought, buy, expense, cost | `type: expense` |
| Income | salary, received, receive, got, earned, earn, income, deposit | `type: income` |
| Refund | refund, refunded, reimbursed, returned | `type: refund` |
| Transfer | transfer, transferred, move, moved | `type: transfer` |

**Refund is checked before income.** A refund is an inflow, but the app models it
as its own type and the more specific reading should win.

**No verb at all defaults to expense**, because that is overwhelmingly the common
case, but it costs `PENALTY_ASSUMED_DIRECTION` and therefore prompts. `Fuel $20`
is the spec's own example of this form.

## Currency markers

| Written | Unit |
| --- | --- |
| `$5`, `$ 5.25` | USD |
| `5 usd`, `5 dollar`, `5 dollars` | USD |
| `12000 khr`, `12000 riel`, `12000 riels` | KHR |
| `12000៛` | KHR |
| `12000r` | KHR |

A marker is looked for on **both sides** of the number, because `$5` and
`5 dollars` are equally common.

The bare trailing `r` only matches directly after digits, so `rice` cannot be
read as riel. Note that the matched marker has to be re-tested with a
lookbehind-free pattern: reusing the marker regex against the captured substring
alone fails, because the digits it looks behind for are no longer there. That
mistake makes `12000r` resolve to dollars.

## Amount format

- Thousands separators are ignored: `20,000 riel` is 20000.
- Up to two decimal places are accepted.
- Zero and negative figures are refused, not clamped.
- Parsing goes through `fromMajor()`, which crosses the minor-unit scale gap and
  rounds half away from zero. `$5` becomes 500 minor units; `12000 riel` becomes
  12000, **not** 1200000.

## The bare-number rule

With no marker at all, the unit comes from magnitude:

```
>= 1000  ->  KHR
<  1000  ->  USD
```

This works because real usage is bimodal. Nobody messages their own finance bot
about a $1,200 lunch, and riel amounts below roughly 1,000 barely exist because
100៛ is the smallest circulating note. The threshold sits well clear of both
clusters.

It is still a guess. It costs `PENALTY_UNIT_GUESS` (the largest penalty, because
being wrong is a ~4000x error) so a bare number **always** ends up needing
confirmation. The heuristic exists to make the prompt well-informed, not to avoid
asking.

## Confidence and penalties

| Condition | Penalty |
| --- | --- |
| Unit inferred from magnitude | 0.35 |
| Direction assumed (no verb) | 0.15 |
| More than three leftover words | 0.05 |

Confidence starts at 1, penalties subtract, and the result is clamped to
`[0, 1]`. Below `CONFIRM_THRESHOLD` (0.9) the bot describes what it understood
and waits for `yes`.

Read-only intents never prompt.

## Commands

| Message | Intent |
| --- | --- |
| `Transfer $100 ABA to Wing` | transfer, `fromHint: "aba"`, `toHint: "wing"` |
| `Undo last transaction`, `delete last`, `remove last`, `cancel last` | undo |
| `Show budget`, `budget`, `budgets` | budget |
| `Summary`, `Summary today`, `Summary month`, `report` | summary |
| `yes`, `y`, `yep`, `confirm`, `ok`, `save`, `correct` | confirm |
| `no`, `n`, `nope`, `cancel`, `stop`, `wrong` | cancel |
| `/start <token>` | link this chat to an account |
| `/start`, `/help`, `help` | help |
| anything else | unknown, with the help text |

## Ordering traps

Two orderings are load-bearing and both have tests:

1. **`undo` is matched before `cancel`.** Otherwise `cancel last` dismisses a
   pending confirmation instead of removing a transaction.
2. **The confirm/cancel patterns need `\b`.** Without it, `^n` matches `Nham24 $6`
   and a merchant name silently becomes a cancellation.

## Transfer must not fall through

The transfer branch is entered on the verb alone. If the destination is missing
the message is refused as `unknown`.

An earlier version required verb **and** destination, so `Transfer $100` fell
through to the expense branch and recorded a $100 expense: money left an account
and arrived nowhere. Once a message names an operation it can only become that
operation or nothing.

## What the parser deliberately does not do

No category resolution, no account resolution, no database access, no clock. It
returns a `descriptor` string and the caller matches it against the user's own
categories and accounts.

That boundary is what keeps the money path deterministic and exhaustively
testable, and it is where a model could later be substituted for the fuzzy
matching without touching anything that decides an amount.
