# Setup

Everything needed to run Luy Manager locally, connect it to your own Supabase
project, deploy it, and connect the Telegram bot.

Work through the parts in order. Each one leaves the app in a working state, so
you can stop after Part 1 or Part 2 and still have something usable.

| Part | You get | Time |
| --- | --- | --- |
| [1. Run it locally](#1-run-it-locally) | The whole UI on sample data, no accounts, no keys | 2 min |
| [2. Connect Supabase](#2-connect-supabase) | Your own database, real persistence | 15 min |
| [3. Sign-in](#3-sign-in) | Email magic link, and Google if you want it | 10 min |
| [4. Deploy](#4-deploy) | A public URL, daily rate job running | 10 min |
| [5. Telegram bot](#5-telegram-bot) | Log money by messaging a bot | 10 min |

---

## Prerequisites

- **Node 20.9 or newer.** Next 16 requires it. `node --version` to check.
- A **Supabase** account for Part 2 onwards.
- A **Vercel** account for Part 4. Anything that runs a Node server works, but
  `vercel.json` already defines the cron schedule.

---

## 1. Run it locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

That is genuinely all. With no Supabase configured the app runs in **demo mode**:
`isDemoMode()` is true, the data layer serves `src/lib/demo-data.ts`, and the
auth redirect is skipped entirely. You get the full interface on a realistic
Cambodian sample ledger.

Demo mode is a supported state, not a fallback that half works. Use it to explore
the UI before committing to any setup, and to develop against without touching
real data.

What you cannot do in demo mode: sign in, save anything, or use the bot. Writes
return "Connect Supabase to save..." rather than failing oddly.

---

## 2. Connect Supabase

### 2.1 Create the project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and create a
   project.
2. Pick a region close to your users. `ap-southeast-1` (Singapore) is the nearest
   to Cambodia.
3. Save the database password somewhere safe. You need it for the CLI or a direct
   connection, and it is shown once.

Wait for provisioning to finish before continuing.

### 2.2 Collect the three values

From **Project Settings > API Keys**:

| Value | Looks like | Used for |
| --- | --- | --- |
| Project URL | `https://abcdefgh.supabase.co` | Every request |
| Publishable key | `sb_publishable_...` | The browser. Safe to expose |
| Secret key | `sb_secret_...` | Server only. **Bypasses RLS** |

Legacy `anon` and `service_role` JWTs work too; both variables accept either
style. The newer keys are preferable because they rotate independently of the JWT
secret.

The secret key is the one that matters. It bypasses Row Level Security entirely,
so it must never appear in a `NEXT_PUBLIC_` variable or reach the browser. The
`npm run connect` check below fails deliberately if it does.

### 2.3 Write `.env.local`

```bash
cp .env.example .env.local
```

Fill in:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://abcdefgh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
CRON_SECRET=            # any long random string: openssl rand -hex 32
```

`.env.local` is gitignored by the `.env*` rule. Do not commit it.

### 2.4 Apply the migrations

`supabase/migrations/` holds `0001` through `0009`. They must run **in filename
order**, because each depends on the last. Pick whichever route suits you.

**Option A: the SQL editor.** No tooling needed. Open the SQL editor in the
dashboard, then for each file from `0001` to `0009` in order, paste the whole file
and run it. Slow but foolproof.

**Option B: `npm run connect`.** Needs `psql` installed and the Postgres
connection string. Add to `.env.local`:

```bash
SUPABASE_DB_URL=postgresql://postgres:[YOUR-PASSWORD]@db.[REF].supabase.co:5432/postgres
```

Then:

```bash
npm run connect
```

It applies every migration in order, runs the same schema guards CI runs, and
probes the live REST API to confirm the anon key cannot read anyone's ledger.
Re-running is safe: an already-applied migration is reported as skipped.

**Option C: the Supabase CLI.** If you have it linked, `supabase db push`.

`SUPABASE_DB_URL` is only used by `npm run connect`. Nothing in `src/` reads it,
so it is not needed in production.

### 2.5 Verify the schema

```bash
npm run connect:check
```

This skips migrations and verifies only. You want:

```
✓ Row Level Security is enabled on every table in public
✓ Every policy evaluates auth.uid() once per statement
✓ anon read of accounts returns no rows
✓ anon read of transactions returns no rows
✓ published exchange rate is readable without a session
Connected.
```

**Those anon reads returning nothing is the point.** The publishable key ships to
every browser, so RLS is the only thing standing between it and your ledger. The
published exchange rate is deliberately world-readable, because it is a fact about
the world rather than anyone's data.

You should end up with **19 tables, none without RLS**, 9 applied migrations, and
one seeded USD/KHR rate.

### 2.6 Restart

```bash
npm run dev
```

`NEXT_PUBLIC_*` variables are read at build time, so a running dev server will not
pick up a new `.env.local` on its own. Demo mode is now off, and you will be
redirected to `/login`.

---

## 3. Sign-in

The app is passwordless. There is no password field anywhere.

### 3.1 Email magic link

Already working. Nothing to configure. Go to `/login`, enter your email, click the
link.

One caveat: Supabase's built-in email service is **heavily rate limited** (a few
per hour) and intended for testing. For real users, configure your own SMTP under
**Authentication > Emails**.

### 3.2 Google sign-in (optional)

The login screen offers a Google button. Until you do this, that button fails.

**In Google Cloud:**

1. [console.cloud.google.com](https://console.cloud.google.com/) and select or
   create a project.
2. **Google Auth Platform > Overview**, click Get started. User type
   **External**. Fill in the app name and support email.
3. **Audience > Test users**, add your own Google address.

   This is the step people miss. Until the consent screen is published, only
   listed test users can sign in. Everyone else sees "Access blocked", which looks
   like a broken configuration and is not.
4. **Data Access**, ensure the scopes include `openid` (add it manually),
   `.../auth/userinfo.email` and `.../auth/userinfo.profile`. Do not add more:
   extra scopes can trigger a verification review that takes days.
5. **Clients > Create client**, type **Web application**.
   - **Authorized JavaScript origins**: `http://localhost:3000`
   - **Authorized redirect URIs**:
     `https://[YOUR-REF].supabase.co/auth/v1/callback`

   That redirect URI is **Supabase's**, not your app's. The flow goes app to
   Google to *Supabase* to app; Google never contacts your domain. Getting this
   wrong produces `redirect_uri_mismatch`, which is the single most common failure
   here.
6. Click Create. The dialog shows the **Client ID** and **Client secret**.

   Copy both now. Since June 2025 Google masks client secrets afterwards and
   shows only the last few characters, so a closed dialog means generating a new
   secret. The Client ID stays retrievable.

**In Supabase:**

7. **Authentication > Sign In / Providers > Google.** Enable it, paste the Client
   ID and secret, save. Leave "Skip nonce check" off; that is for native mobile.
8. **Authentication > URL Configuration**:
   - **Site URL**: `http://localhost:3000`
   - **Redirect URLs**: add `http://localhost:3000/auth/callback`

   The app passes an explicit `redirectTo`, and Supabase honours it only if it is
   on this list. If a nested path is rejected, use `http://localhost:3000/**`:
   `/` counts as a separator, so a single `*` will not match `/auth/callback`.

**Verify:**

```bash
curl -s https://[YOUR-REF].supabase.co/auth/v1/settings \
  -H "apikey: sb_publishable_..." | grep -o '"google":[a-z]*'
```

Must print `"google":true`. If it says false, step 7 did not save.

### 3.3 What happens on your first sign-in

A database trigger runs `handle_new_user()` and creates:

- your profile row, display name taken from your Google account
- **21 categories**, 16 top level plus 5 children such as Coffee and Fuel
- **12 Cambodian merchant rules**: Brown Coffee, Lucky Supermarket, Chip Mong,
  Aeon, Caltex, Grab, Nham24, Foodpanda and others
- a settings row

So you land on a configured app, not an empty one. The merchant rules are what let
the app suggest Coffee when you later type "brown".

---

## 4. Deploy

### 4.1 Import the project

1. [vercel.com/new](https://vercel.com/new), import the repository.
2. Next.js is detected automatically. Change no build settings.

### 4.2 Environment variables

Add these under **Settings > Environment Variables**, scoped to Production, and to
Preview as well if you want branch deploys to work:

| Variable | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | The publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Secret key. Needed by the rate job and the bot |
| `CRON_SECRET` | yes | Or the rate job refuses to run |
| `TELEGRAM_BOT_TOKEN` | for the bot | Part 5 |
| `TELEGRAM_WEBHOOK_SECRET` | for the bot | Part 5 |
| `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` | for the bot | Part 5 |
| `SUPABASE_DB_URL` | no | Only `npm run connect` uses it |

**`NEXT_PUBLIC_*` values are inlined into the bundle at build time.** Changing one
requires a **redeploy**, not just a restart. This catches everyone once.

### 4.3 Deploy, and note the URL

Deploy, then copy the production URL. You could not configure the next part
earlier because you did not have this URL.

### 4.4 Point auth at the real URL

Sign-in will not work until this is done.

**Supabase > Authentication > URL Configuration:**
- **Site URL**: `https://your-domain.com`
- **Redirect URLs**: add `https://your-domain.com/auth/callback`, and keep the
  localhost entry so local development still works

**Google Cloud > Clients**, your OAuth client:
- **Authorized JavaScript origins**: add `https://your-domain.com`
- **Authorized redirect URIs**: leave unchanged. It stays the Supabase callback.

If your consent screen is still in **Testing**, publish it when you want people
other than your test users to sign in.

### 4.5 The daily exchange rate job

`vercel.json` already schedules `GET /api/rates/refresh` at `30 1 * * *`, which is
01:30 UTC, or 08:30 in Phnom Penh. That timing is deliberate: after the upstream
providers publish, and before the day's spending.

Setting `CRON_SECRET` as an environment variable is all the wiring needed. Vercel
[sends that value as an `Authorization` header](https://vercel.com/docs/cron-jobs/manage-cron-jobs)
when it invokes a cron, which is exactly what the route checks.

Once per day also keeps you inside the Hobby plan, which is
[limited to daily crons](https://vercel.com/docs/cron-jobs/usage-and-pricing).

Test it by hand:

```bash
curl -s https://your-domain.com/api/rates/refresh \
  -H "Authorization: Bearer $CRON_SECRET"
```

Expect `"ok":true` with a status of `inserted` or `updated`. A non-2xx means the
sync failed, and the body names every provider tried plus how old the rate users
are still being served is.

Why this job matters: a stale rate looks identical to a fresh one once multiplied
into a total. The dashboard shows the rate's age and turns amber past two days
rather than quietly reporting wrong figures.

---

## 5. Telegram bot

Log money by messaging a bot: `Spent $5 coffee`. Fully implemented; it needs your
own bot.

### 5.1 Create the bot

Message [@BotFather](https://t.me/BotFather):

1. `/newbot`
2. Give it a display name, then a username ending in `bot`.
3. He replies with a token like `8123456789:AAF...`. Keep it secret.

Optional polish: `/setdescription`, `/setuserpic`, and `/setcommands` with:

```
help - What I understand
summary - Today's totals
budget - Active budgets
undo - Remove the last transaction
```

### 5.2 Environment variables

Locally in `.env.local`, and in Vercel for production:

```bash
TELEGRAM_BOT_TOKEN=8123456789:AAF...
TELEGRAM_WEBHOOK_SECRET=            # openssl rand -hex 32
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=YourBotName    # no @
```

Two notes. `TELEGRAM_WEBHOOK_SECRET` does double duty: it authenticates Telegram's
deliveries **and** signs the account-connect links, so changing it invalidates any
link handed out but not yet used. And the username is `NEXT_PUBLIC_`, so setting it
needs a redeploy.

Redeploy after adding these.

### 5.3 Register the webhook

Telegram pushes nothing until told where to push. With the variables in
`.env.local`:

```bash
node .claude/skills/luy-manager-telegram/scripts/telegram-webhook.mjs \
  set https://your-domain.com/api/telegram/webhook
```

The script registers the URL with your secret, restricts deliveries to message
updates, and drops any queued updates so a redeploy cannot replay stale messages
into your ledger.

It refuses `http://` and localhost before making any network call, because
Telegram only delivers to public HTTPS. For local testing, expose your dev server
with a tunnel and register the public URL:

```bash
cloudflared tunnel --url http://localhost:3000
```

### 5.4 Connect your account

1. Open **Settings** in the app.
2. Tap **Connect Telegram**.

That opens your bot carrying a signed token, valid for **15 minutes**. The bot
verifies the signature and links the chat to your account. Reload the settings page
for a fresh link if it expires.

### 5.5 Use it

```
Spent $5 coffee
Spent 12000 riel lunch
Salary $600
Fuel $20
Transfer $100 ABA to Wing
Summary today
Summary month
Show budget
Undo last transaction
```

**Name the currency whenever you can.** A bare `5` is either $5 or 5៛, a roughly
4000x difference, so the bot tells you what it understood and waits for `yes`
instead of guessing. The same happens when you omit the verb, as in `Fuel $20`.

Two limits worth knowing:

- `Show budget` lists your limits but not spend against them. That calculation
  lives on the budgets page, and a second implementation of the number that
  matters most is how two numbers drift apart.
- The bot cannot record a riel expense if you have no active KHR account. It says
  so rather than converting into a currency you never named.

---

## Verify the whole thing

| Check | Command or action | Expected |
| --- | --- | --- |
| Schema and RLS | `npm run connect:check` | `Connected.` with every line ticked |
| Google enabled | `curl .../auth/v1/settings` | `"google":true` |
| Sign-in | Open `/login` | Reach the dashboard, 21 categories seeded |
| Rate job | `curl` with the cron secret | `"ok":true` |
| Webhook reachable | `curl -i -X POST .../api/telegram/webhook -d '{}'` | **401** |
| Bot | Message `Spent $5 coffee` | "Saved $5.00 in ... as ..." |

That webhook check deserves explaining, because the reading is not obvious:

- **401** means the route is reachable and correctly refusing you. This is success.
- **307** means auth middleware is intercepting it. Nothing else you try matters
  until that is fixed.
- **200** means the route is reachable and **not checking the secret**, which is
  worse than broken.

---

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| App shows sample data after configuring | `NEXT_PUBLIC_*` are build-time. Restart dev, or redeploy |
| Redirected to `/login` in a loop | Site URL or Redirect URLs do not match the deployment |
| `redirect_uri_mismatch` from Google | The authorized redirect URI must be the **Supabase** `/auth/v1/callback`, not your app |
| "Access blocked, app not verified" | Consent screen is in Testing and your email is not a test user |
| "Unsupported provider: provider is not enabled" | Google not enabled in Supabase, or not saved |
| Magic links never arrive | Built-in SMTP is rate limited. Configure your own |
| Rate job returns 503 | `CRON_SECRET` or `SUPABASE_SERVICE_ROLE_KEY` missing |
| Rate job returns 502 | Every provider failed. The body names each attempt |
| Dashboard shows an amber rate warning | The rate is more than two days old. The job has stalled |
| Bot silent | Run the script's `status`. A redirect means middleware, a 401 means a secret mismatch |
| Bot says "not connected" | Connect from Settings. One chat links to one account |
| "That connect link has expired" | Links last 15 minutes. Reload Settings |
| `insert violates ... currency` | An account holds one currency. A KHR amount cannot go in a USD account |

For the bot specifically, this names the cause directly:

```bash
node .claude/skills/luy-manager-telegram/scripts/telegram-webhook.mjs status
```

---

## Environment variable reference

| Variable | Scope | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server | Publishable or legacy anon key. RLS is the boundary |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Bypasses RLS. Rate job and bot only |
| `CRON_SECRET` | server only | Guards `/api/rates/refresh` |
| `SUPABASE_DB_URL` | local only | `npm run connect`. Never needed in production |
| `TELEGRAM_BOT_TOKEN` | server only | From BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | server only | Authenticates deliveries, signs connect links |
| `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` | browser | Builds the connect deep link |

Anything named `NEXT_PUBLIC_` is shipped to the browser and inlined at build time.
Never put a secret in one. `npm run connect:check` fails deliberately if it finds a
key that bypasses RLS in a `NEXT_PUBLIC_` variable, in either the new
`sb_secret_...` format or a legacy `service_role` JWT.

---

## Rotating keys

Rotate whenever a key has been pasted anywhere it might be logged, including a
chat transcript or a CI log.

| Key | Where | Then |
| --- | --- | --- |
| Supabase secret key | Project Settings > API Keys | Update `SUPABASE_SERVICE_ROLE_KEY`, redeploy |
| Publishable key | Same page | Update the variable, **redeploy** (build-time) |
| `CRON_SECRET` | You generate it | Update the variable. Vercel picks it up |
| `TELEGRAM_WEBHOOK_SECRET` | You generate it | Update, redeploy, then re-run the webhook `set` command |
| Telegram bot token | BotFather, `/revoke` | Update and redeploy |
| Google client secret | Google Cloud | Update in Supabase. Shown once, so a lost one needs a new secret |

Rotating `TELEGRAM_WEBHOOK_SECRET` requires re-registering the webhook, otherwise
Telegram keeps sending the old secret and every delivery is refused with a 401.
