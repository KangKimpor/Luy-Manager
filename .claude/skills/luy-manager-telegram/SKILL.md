---
name: luy-manager-telegram
description: Builds and reviews chat-bot interfaces that write to a financial ledger over a webhook, covering intent parsing with confidence thresholds, sessionless authorization, retry-safe responses, and stateless account linking. Use when adding a Telegram, WhatsApp, Slack or SMS bot to an app, when a webhook endpoint must authenticate without a user session, when parsing free-text money messages, when a bot duplicates or silently drops writes, or when a webhook returns redirects instead of reaching its handler.
---

# Chat bots that write to a ledger

A bot that logs money is two hard problems wearing one coat. The first is
understanding a sentence. The second is that the component doing the
understanding has no session, no browser, and a caller that punishes you for
returning the wrong status code by replaying the request.

Every rule below comes from something that failed silently. A bot is uniquely bad
at revealing its own bugs: it answers cheerfully, the user believes it, and the
ledger disagrees a week later.

## The four things that make a webhook different

Internalise these before writing a handler. Every mistake in this document
follows from forgetting one.

1. **There is no session.** No cookie, no JWT, so no `auth.uid()`.
2. **Row Level Security is therefore inert.** It is not weakened, it is absent.
3. **A non-2xx response causes a replay.** The platform retries what it thinks
   failed.
4. **The only credential is a header** the platform echoes back to you.

## Row Level Security does not protect a webhook

This is the one that loses data. Everywhere else in the app a forgotten
`user_id` filter fails *closed*: RLS returns nothing and you notice immediately.
In a webhook handler using a service-role key, the same omission fails *open*.

```ts
// CATASTROPHIC in a webhook. Returns every user's transactions.
const { data } = await admin.from("transactions").select("*").limit(1);

// RIGHT. The filter is the only thing standing in for RLS.
const { data } = await admin
  .from("transactions")
  .select("*")
  .eq("user_id", userId)   // never optional here
  .limit(1);
```

**The user id must come from the platform's chat identifier, never from the
message body.** A chat id is asserted by the platform; anything in the text is
asserted by whoever is typing.

```ts
// The whole chain of trust, in one line.
const userId = await userIdForChat(admin, inbound.chatId);
if (!userId) return replyNotLinked();
```

Write the filter even when the query "obviously" cannot leak. `update` and
`delete` need it most, because a missing predicate there rewrites the table.

## Always return 200, even when you failed

The platform retries non-2xx. If you insert a row and then throw, the retry
inserts it again. The user gets charged twice in their own ledger and blames the
app.

```ts
// WRONG. A throw after a successful insert duplicates the transaction.
await insertTransaction(row);
await sendReply(chatId, text); // throws on a network blip -> retry -> double row

// RIGHT. Report failures in the reply and the log, not the status code.
await insertTransaction(row);
const sent = await sendReply(chatId, text);
await log({ direction: "outbound", error: sent.ok ? null : sent.error });
return Response.json({ ok: true }, { status: 200 });
```

So: **reply failures are recorded, not thrown.** A reply that did not arrive is a
far smaller problem than a duplicated ledger entry.

Return 200 for messages you cannot act on too: malformed bodies, unsupported
update types, messages from other bots. Retrying those will never succeed.

Reserve non-2xx for exactly two cases:

| Status | When | Why |
| --- | --- | --- |
| 401 | Secret header missing or wrong | Never process it, and a retry should not help |
| 503 | The bot is not configured | Operator error, and honest about it |

## Your auth middleware will eat the webhook

Budget for losing an hour to this, or read this paragraph instead.

Apps put an auth check in middleware that redirects anonymous requests to a
sign-in page. A webhook *is* an anonymous request. So every delivery gets a 307
to `/login`, the platform records a failure, retries, gets another redirect, and
eventually disables the webhook. Nothing in your handler ever runs, every unit
test passes, and the bot looks broken for no visible reason.

```ts
const PUBLIC_PREFIXES = [
  "/login",
  "/auth",
  "/api/cron/refresh",      // guarded by a cron secret
  "/api/telegram/webhook",  // guarded by the platform's secret header
];
```

**Verify it with an unauthenticated request before you debug anything else:**

```sh
curl -i -X POST https://your-app/api/telegram/webhook -d '{}'
# 401 -> the route is reachable and refusing you. Correct.
# 307 -> middleware is eating it. Nothing else you do matters yet.
# 200 -> reachable and NOT checking the secret. Worse than broken.
```

That three-way reading is the fastest diagnostic in this document.

## Authenticate with the echoed secret, in constant time

The platform sends a secret you registered. It is the only thing between the
public internet and someone writing rows into a stranger's ledger.

```ts
export function isFromPlatform(request: Request, expected: string): boolean {
  const presented = request.headers.get("x-telegram-bot-api-secret-token");
  if (!presented) return false;

  // Hash first: timingSafeEqual throws on a length mismatch, and that throw is
  // an oracle for the secret's length.
  const a = createHash("sha256").update(presented).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
```

Check it **before reading the body**, so an unauthenticated caller cannot make
you do work or reveal which subsystems are configured.

## Parse with rules, not a model

For a grammar this small, rules win on all four axes that matter:

| | Rules | Model |
| --- | --- | --- |
| Cost per message | zero | per call, on the cheapest interaction in the product |
| Latency | microseconds | hundreds of ms, and the platform retries slow webhooks |
| Determinism | same sentence, same row | may reinterpret |
| Reviewability | readable, testable | opaque component with ledger write access |

The grammar is an amount, a direction, and some words. That is a parser.

Use a model for the genuinely fuzzy part instead: mapping "brown" to a Coffee
category. Keep that **out** of the parser so the money path stays deterministic:

```ts
// Parser returns the raw words. Resolution happens against the user's own data.
{ kind: "record", type: "expense", amount: money(500, "USD"), descriptor: "coffee" }
```

That boundary means category matching can be upgraded later without touching
anything that decides an amount.

## Every inference lowers a confidence score

A bot that guesses silently is a bot that corrupts a ledger politely. Make each
guess subtract an explicit penalty, then gate writes on the total.

```ts
const CONFIRM_THRESHOLD = 0.9;

let confidence = 1;
if (unitWasInferred) confidence -= 0.35;   // largest: a 4000x error if wrong
if (directionWasAssumed) confidence -= 0.15;
if (leftoverWords > 3) confidence -= 0.05;

confidence = Math.max(0, confidence); // clamp, or penalties read as certainty
```

Never let a *read* require confirmation. "Show budget" cannot damage anything, so
prompting for it is friction with no payoff:

```ts
export function needsConfirmation(intent: Intent): boolean {
  if (intent.kind !== "record" && intent.kind !== "transfer") return false;
  return intent.confidence < CONFIRM_THRESHOLD;
}
```

## The ambiguous-unit problem

In a dual-currency economy a bare number is genuinely undecidable. `5` is $5 or
5៛, and those differ by about 4000x.

A magnitude heuristic works because real usage is bimodal: nobody messages their
bot about a $12,000 lunch, and riel amounts below ~1,000 barely exist since 100៛
is the smallest circulating note.

```ts
const unit = digits >= 1000 ? "KHR" : "USD";
```

**But it is still a guess, so it must cost confidence and trigger a prompt.** The
heuristic exists to make the *prompt* well-informed, not to avoid asking.

Say why you are asking. "I read that as $5, reply yes" teaches the syntax; a bare
"confirm?" does not.

## Confirmation needs state, and you probably already have a home for it

Confirming means remembering what you offered. Before adding a table, look at
your message log: it exists to record what the parser made of each message, which
is exactly the pending intent.

```ts
// Offer: store the intent on the inbound log row.
await log({ direction: "inbound", text, parsed: { pending: intent } });

// Accept: find the most recent unresolved offer for this chat, then consume it.
await admin.from("logs").update({ parsed: { resolved: intent } }).eq("id", row.id);
```

**Consume it before executing**, so a double-tapped "yes" cannot save twice.
Expire offers after ten minutes or so; a "yes" arriving the next morning answers a
question the user has forgotten.

Filter the JSON key in application code rather than through a clever query
operator. "This JSON key is present" is easy to get subtly wrong in a query
string, and getting it wrong fails open: you return the newest row whether or not
it holds an offer, and a stray "yes" saves something never shown to the user.

## Resolve the account by currency, not by preference

If accounts are single-currency, the currency in the message *determines* the
account, and a database trigger will reject any mismatch.

```
1. An account the user named, if its currency fits.
2. Their default account, if its currency fits.
3. The first active account holding that currency.
4. Otherwise: say so.
```

Step 4 is a real outcome, not an edge case. A user with only a USD account cannot
record a riel expense. Saying that is correct; silently converting into a currency
they never named is not.

## Link accounts with a signed token, not a stored code

The obvious design is a `link_codes` table with a six-digit code and an expiry.
That costs a migration, a write and a read per attempt, and a cleanup job.

None of it is needed, because the code does not need to be *remembered*, it needs
to be *authenticated*. An HMAC over the user id and an expiry does that with no
storage: the server verifies a token it has never seen, because only the server
could have signed it.

```ts
// 16 bytes user id + 4 bytes expiry + 10 bytes truncated HMAC = 40 base64url chars
const payload = Buffer.concat([uuidBytes(userId), expiryBE]);
const token = Buffer.concat([payload, hmac(payload, secret).subarray(0, 10)])
  .toString("base64url");
```

**Mind the platform's payload limit.** Telegram allows 64 characters from
`A-Za-z0-9_-` in a `/start` payload. A UUID alone is 36 characters, so a
delimited string with a full signature does not fit. Pack fixed-width binary and
base64url it: that alphabet is exactly what is allowed.

Verify signature **before** expiry, so an unsigned token with a plausible expiry
reveals nothing through timing. Return a reason, not a boolean: "that link
expired, get a new one" is a different message from "that is not a valid link".

## Never let a write intent fall through to a different write intent

A real bug, found by a test: the transfer branch required both a transfer verb
*and* a destination. `"Transfer $100"` has the verb and no destination, so it fell
through to the expense branch and recorded a **$100 expense**. Money left an
account and arrived nowhere.

```ts
// WRONG. Falls through when the destination is missing.
if (isTransfer(text) && hasDestination(text)) { ... }

// RIGHT. The verb alone commits to the branch; an incomplete message is refused.
if (isTransfer(text)) {
  if (!hasDestination(text)) return { kind: "unknown" };
  ...
}
```

Generalise it: **once a message names an operation, it can only become that
operation or nothing.** Reinterpreting it as a different kind of write is worse
than refusing.

## Log both directions

Store every inbound message, what the parser made of it, and every reply. Without
the original text a misparse is unreproducible: the message is gone and only the
wrong transaction remains.

```
direction, chat_id, user_id, message_text, parsed jsonb, transaction_id, error_message
```

Make it append-only for client roles. Mark the origin on rows the bot creates
(`created_via: 'telegram'`) so the audit trail distinguishes a message from a tap.

## Replies

- **Escape user text.** Merchant names contain `&` and `<`. An unescaped reply
  fails to render or drops the message entirely.
- Prefer HTML over Markdown. An underscore in a merchant name breaks Markdown
  parsing, and a parse failure means the user gets *nothing* back.
- Echo the parsed figure using the same formatter the UI uses. A user who typed
  `12000` needs to see `12,000៛`, which is also how they catch a misparse.
- Confirm what was saved and where: amount, account, category.

## Procedure

**Adding a bot**

1. Add the webhook path to the auth middleware's public list. Verify with
   `curl` that an unauthenticated POST returns 401, not 307.
2. Implement the secret header check, constant time, before reading the body.
3. Write the parser as a pure function. No I/O, no clock, no database.
4. Test it against every example message in the spec before writing a handler.
5. Resolve the user from the chat id. Filter every query by that id.
6. Gate writes on the confidence threshold.
7. Return 200 from every path that is not 401 or 503.
8. Log both directions.

**Reviewing one**

Work through `references/review-checklist.md`. Start by grepping the handler for
every `.from(` and confirming each has a `user_id` filter.

## Tests to write every time

```ts
// Every example message in the spec parses to the right intent
// Zero-decimal currency keeps its scale: "12000 riel" -> 12000 minor, not 1200000
// An explicit unit never needs confirmation
// A bare number always needs confirmation, both above and below the threshold
// A verb-less message is an expense, and asks first
// "Transfer $100" with no destination is refused, NOT recorded as an expense
// Read-only intents never ask for confirmation
// Confidence is clamped to [0, 1]
// A token signed with another secret is rejected
// A tampered user id is rejected
// An extended expiry without resigning is rejected
// The token fits the platform's payload limit and alphabet
// A word merely starting with "n" is not a cancellation
```

## Reference files

- `references/message-grammar.md` — the supported grammar, currency markers,
  and the ambiguity rules.
- `references/review-checklist.md` — line-by-line audit for a webhook handler.
- `scripts/telegram-webhook.mjs` — register, inspect and delete the webhook.
  Run: `node scripts/telegram-webhook.mjs status`

## Anti-patterns

| Do not | Because |
| --- | --- |
| Query without a `user_id` filter in a webhook | RLS is absent; it fails open, not closed |
| Trust a user id from the message body | Only the chat id is asserted by the platform |
| Throw after a successful write | The retry duplicates the row |
| Return 500 for a message you cannot parse | Guarantees an infinite retry loop |
| Leave the webhook behind auth middleware | Every delivery becomes a redirect |
| Compare secrets with `===` | Leaks length and content through timing |
| Save when confidence is low | A politely corrupted ledger |
| Ask for confirmation on a read | Friction with no payoff |
| Infer currency without a penalty | A 4000x error saved silently |
| Fall through from transfer to expense | Records money as spent that was moved |
| Store link codes in a table | An HMAC needs no storage |
| Put a UUID in a `/start` payload | Exceeds the 64-character limit |
| Reply with unescaped user text | Breaks rendering, or drops the reply |
| Convert into a currency the user did not name | Hides that the right account is missing |
