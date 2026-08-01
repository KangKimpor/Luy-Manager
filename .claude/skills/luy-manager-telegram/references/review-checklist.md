# Webhook bot review checklist

Line-by-line audit for a chat bot that writes to a ledger. Ordered by how much
damage the failure does, not by how likely it is.

## 1. Authorization (a miss here exposes every user)

- [ ] Grep the handler for every `.from(`, `.update(`, `.delete(`. **Each one has
      an explicit `user_id` filter.** RLS is absent in a webhook; a missing filter
      fails open.
- [ ] The user id is resolved from the platform's chat id, not from anything in
      the message body.
- [ ] An unlinked chat is refused before any read of user data.
- [ ] The service-role key is only used server-side and never reaches a client
      bundle.
- [ ] `update` and `delete` carry the `user_id` filter **in addition to** the row
      id, so a guessed id cannot cross accounts.

## 2. Reachability (a miss here means the bot never runs at all)

- [ ] The webhook path is in the auth middleware's public/unauthenticated list.
- [ ] `curl -i -X POST <url> -d '{}'` returns **401**, not 307 and not 200.
      - 307 means middleware is intercepting it.
      - 200 means the secret is not being checked.
- [ ] `getWebhookInfo` reports no `last_error_message`.
- [ ] `pending_update_count` is 0. A growing queue means deliveries are failing.

## 3. Retry safety (a miss here duplicates money)

- [ ] Every path returns 200 except a missing/wrong secret (401) and missing
      configuration (503).
- [ ] Nothing throws after a database write. Reply failures are logged, not
      thrown.
- [ ] Malformed bodies and unsupported update types return 200.
- [ ] A pending confirmation is consumed **before** the write executes, so a
      double-tapped "yes" cannot save twice.
- [ ] Registering the webhook drops pending updates, so a redeploy does not
      replay stale messages into the ledger.

## 4. Secret handling

- [ ] The secret header is compared in constant time.
- [ ] Both sides are hashed to a fixed width first, so a length mismatch cannot
      throw and leak the length.
- [ ] The secret is checked before the body is read.
- [ ] Failure responses do not say *why* they failed.
- [ ] No secret appears in a log line, a reply, or an error message.

## 5. Parsing and money

- [ ] The parser is pure: no I/O, no clock, no database.
- [ ] Every example message in the spec has a test.
- [ ] Amounts go through the money layer's constructor, never a bare
      `{ minor, currency }` literal, so the integer is validated and negative zero
      collapsed.
- [ ] Zero-decimal currencies keep their scale. `12000 riel` is 12000 minor units.
- [ ] Zero and negative amounts are refused.
- [ ] Every inference subtracts a documented penalty from confidence.
- [ ] Confidence is clamped to `[0, 1]`.
- [ ] A guessed currency **always** prompts.
- [ ] Read-only intents never prompt.
- [ ] No write intent can fall through into a *different* write intent.

## 6. Account and category resolution

- [ ] The account is chosen by matching the message's currency first, because a
      single-currency account will reject a mismatched insert at the database.
- [ ] "No account in that currency" is reported, not worked around by converting.
- [ ] An unmatched category saves as null rather than guessing. An uncategorised
      row is easy to fix; a wrongly categorised one is invisible.
- [ ] Cross-currency transfers write both legs in a single statement, so a
      deferred balance check sees a complete pair.

## 7. Linking

- [ ] The link token is signed and carries an expiry.
- [ ] The signature is verified before the expiry is read.
- [ ] Verification failure distinguishes expired from invalid, because the user
      action differs.
- [ ] The token fits the platform's payload limit and alphabet.
- [ ] The linking update checks how many rows it affected. An update matching
      nothing returns no error, and reporting "Connected" for an account that does
      not exist is worse than an error.
- [ ] Re-linking a chat already tied to another account is handled.

## 8. Logging and replies

- [ ] Inbound messages are stored with their original text and the parse result.
- [ ] Outbound replies are stored, including send failures.
- [ ] Rows the bot creates are marked with their origin.
- [ ] The log table is append-only for client roles.
- [ ] User-supplied text is escaped before going into a formatted reply.
- [ ] Replies echo the amount through the same formatter the UI uses, so a
      misparse is visible to the user.
- [ ] A saved confirmation names the amount, the account and the category.

## Fast greps

```sh
# Queries with no user scoping, the highest-severity smell
grep -nE "\.from\(" src/lib/telegram/*.ts | grep -v "user_id"

# Anything that could throw after a write
grep -nE "throw|\.json\(\)" src/app/api/*/webhook/route.ts

# Non-200 responses
grep -nE "status: [45]" src/app/api/*/webhook/route.ts

# Money built without the constructor
grep -nE "\{\s*minor:" src/lib/telegram/*.ts
```
