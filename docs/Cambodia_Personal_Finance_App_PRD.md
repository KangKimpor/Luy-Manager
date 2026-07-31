# Luy Manager — Cambodia Personal Finance App PRD & AI Build Prompt

> **Objective:** Build a production-ready personal finance platform optimized for Cambodia with first-class support for USD and KHR, secure cloud synchronization, Telegram integration, analytics, budgeting, and scalable architecture.

## 1. Vision

Create a finance platform comparable to Monarch Money, Copilot Money, and YNAB while being designed specifically for Cambodian users.

Core principles:

- Fast transaction entry (<5 seconds)
- Mobile-first
- Secure by default
- Offline capable
- Multi-currency
- Beautiful analytics
- AI-powered categorization
- Telegram as a secondary interface

## 2. Target Users

Primary user:

- Individual living in Cambodia
- Uses USD and KHR daily
- Multiple bank accounts
- Cash, e-wallets, and bank transfers
- Wants complete financial visibility

## 3. Technology Stack

> **DECIDED: Next.js PWA.** The Flutter template library in [Section 14](#14-ui--design-system) is a visual and motion reference only, not the client framework. Rationale in [Section 17](#17-open-decisions).

### Frontend

- Next.js (App Router)
- TypeScript
- Tailwind CSS
- shadcn/ui
- React Query
- PWA: installable manifest plus a service worker for the offline requirement in [Section 1](#1-vision)

### Shared backend

Backend:

- NestJS or Next.js API
- PostgreSQL (Supabase)

Authentication:

- Supabase Auth
- Google OAuth

Storage:

- Supabase Storage

Notifications:

- Telegram Bot API

Deployment:

- Vercel
- Supabase

## 4. Authentication

Support:

- Email/password
- Google login
- Password reset
- Remember me
- Session timeout
- MFA ready

Passwords must be Argon2 hashed.

> **Superseded.** The Argon2 requirement above assumed a self-managed credential store. [Section 17](#17-open-decisions) resolves authentication to Supabase Auth, which hashes passwords with bcrypt and does not expose the algorithm as a configuration option. Argon2 becomes applicable only if authentication is later moved in-house.

## 5. Database

Core tables:

- users
- bank_accounts
- wallets
- transactions
- transaction_splits
- categories
- budgets
- savings_goals
- recurring_transactions
- exchange_rates
- merchants
- tags
- attachments
- telegram_logs
- notifications
- audit_logs
- settings

Use UUID primary keys, timestamps, soft deletes where appropriate, and foreign-key constraints.

## 6. Account Types

Examples:

- ABA
- ACLEDA
- Wing
- TrueMoney
- Cash USD
- Cash KHR
- Credit Card
- Savings
- Investment

Each account stores:

- Name
- Institution
- Currency
- Opening balance
- Current balance
- Icon
- Color
- Active status

## 7. Currency Engine

Supported:

- USD
- KHR

Requirements:

- Mixed currency transactions
- Manual exchange rates
- Automatic exchange rates
- Historical rates
- Net worth in chosen base currency

Example:

Spent:

- $3
- 20,000៛

during one purchase.

## 8. Transaction System

Types:

- Expense
- Income
- Transfer
- Refund
- Adjustment

Fields:

- Amount
- Currency
- Exchange rate
- Converted amount
- Category
- Merchant
- Notes
- Location
- Receipt
- Account
- Date/time
- Tags

Support split transactions.

## 9. Telegram Integration

Create a Telegram Bot.

Natural language examples:

```
Spent $5 coffee
Spent 12000 riel lunch
Salary $600
Received $50
Fuel $20
Transfer $100 ABA to Wing
Undo last transaction
Show budget
Summary today
Summary month
```

The bot should:

- Parse intent
- Detect currency
- Detect category
- Detect account
- Confirm before saving if confidence <90%
- Save directly to database

## 10. AI Features

Automatically categorize merchants.

Examples:

| Merchant | Category |
| --- | --- |
| Starbucks | Coffee |
| Lucky Supermarket | Groceries |
| Caltex | Fuel |

Suggest recurring transactions.

Generate monthly insights such as:

- Biggest spending increase
- Savings trend
- Unusual expenses
- Subscription detection

## 11. Dashboard

Cards:

- Net Worth
- Cash
- Savings
- Investments
- Monthly Income
- Monthly Expense
- Budget Remaining

Charts:

- Cash flow
- Category pie chart
- Spending heatmap
- Monthly trend
- Income vs Expense
- Net worth history

## 12. Security

- HTTPS
- Row Level Security
- CSRF protection
- XSS protection
- SQL injection prevention
- Audit logging
- Encrypted storage
- Daily backups

## 13. Reports

Generate:

- Daily
- Weekly
- Monthly
- Quarterly
- Yearly

Export:

- PDF
- Excel
- CSV

## 14. UI & Design System

Visual direction and component base: [Best-Flutter-UI-Templates by mitesh77](https://github.com/mitesh77/Best-Flutter-UI-Templates).

### Available templates in that repository

Verified against `best_flutter_ui_templates/lib/` on the `master` branch:

| Path | What it provides |
| --- | --- |
| `app_theme.dart` | Central colour, typography, and shadow tokens |
| `introduction_animation/` | Animated multi-step onboarding flow |
| `fitness_app/` | Card dashboard, curved charts, custom bottom bar with a centre floating action button |
| `hotel_booking/` | Filterable list + date range picker + slide-in filter sheet |
| `design_course/` | Category grid, hero-style detail transitions |
| `custom_drawer/` | Animated side drawer with shell navigation |
| `home_screen.dart`, `navigation_home_screen.dart` | Drawer + navigation shell wiring |
| `feedback_screen.dart`, `help_screen.dart`, `invite_friend_screen.dart` | Settings-adjacent secondary screens |

### Mapping to this product

| App screen | Template to adapt |
| --- | --- |
| Onboarding / first-run currency + account setup | `introduction_animation/` |
| Dashboard ([Section 11](#11-dashboard)) | `fitness_app/` — its metric cards map to Net Worth / Cash / Income / Expense, and its curved chart maps to cash flow and net worth history |
| Transaction list with date + account + category filters | `hotel_booking/` — reuse the filter sheet and date range picker |
| Category browser and budget detail | `design_course/` |
| Navigation shell + settings entry points | `custom_drawer/`, `navigation_home_screen.dart` |
| Quick-add button ([Section 15](#15-mobile-ux)) | Centre FAB from the `fitness_app` bottom bar |

### Adoption rules

Because [Section 17](#17-open-decisions) settled the client on Next.js, no Dart is copied into this project. The templates are read as a design specification and reimplemented in React and Tailwind.

- Take layout, spacing rhythm, card composition, and transition timing from the templates. Do not port Dart source.
- Define colour and type tokens once in the Tailwind theme, mirroring the role `app_theme.dart` plays upstream.
- Ignore the templates' hardcoded sample data; bind each screen to real models from the outset.

### Licence

The repository carries an [MIT licence](https://github.com/mitesh77/Best-Flutter-UI-Templates/blob/master/LICENSE), copyright © 2019 Mitesh Chodvadiya. GitHub reports it as "Other" because the file appends a paragraph asking users not to resell the work, but the operative terms are standard MIT.

Reimplementing a visual layout in a different language and framework does not copy the licensed source, so no notice is strictly required. Attribution is still recorded in `THIRD_PARTY_NOTICES.md` at the repository root, since the design lineage is real and the cost of crediting it is nil. If any Dart is later copied verbatim, retaining the MIT notice becomes mandatory.

## 15. Mobile UX

Bottom navigation:

- Dashboard
- Accounts
- Add
- Budgets
- Reports

Floating quick-add button.

## 16. Roadmap

Phase 1:

- Authentication
- Accounts
- Transactions
- Dashboard

Phase 2:

- Telegram Bot
- Budgets
- Reports

Phase 3:

- AI insights
- OCR receipts
- Forecasting

Phase 4:

- Investment tracking
- Family accounts
- Cambodian bank integrations

## 17. Open Decisions

These must be resolved before Phase 1 implementation starts. Each one changes the shape of the codebase.

### Resolved

**1. Client platform — Next.js PWA.**

The deciding factor was the development environment. Verified on the target machine: Node v24.15.0 and git 2.55.0 are installed; the Flutter SDK, Dart SDK, and Docker are not. Choosing Flutter would require installing the Flutter SDK, Android Studio, and the Android SDK before any finance logic could be written or run. Three further points align with the web choice:

- The deployment target in [Section 3](#3-technology-stack) is Vercel, which hosts a Next.js app directly. A Flutter mobile binary does not deploy to Vercel.
- The stack originally specified in this PRD was already Next.js, Tailwind, and shadcn/ui.
- A PWA satisfies the mobile-first and offline requirements in [Section 1](#1-vision) via an installable manifest and a service worker, and supports the bottom navigation and floating quick-add in [Section 15](#15-mobile-ux).

Consequence: the Flutter templates are now a design reference only. The mapping in [Section 14](#14-ui--design-system) still holds as a specification for layout, card composition, and motion, to be reimplemented in React rather than copied as Dart.

Reversibility: if native mobile becomes a hard requirement, the API, database, and Telegram layers are client-agnostic and a Flutter client can be added against the same API. Tracked as a [Phase 4](#16-roadmap) option.

**2. UI template licence — MIT, reuse permitted with attribution.** See [Section 14](#14-ui--design-system).

**3. Backend split — Next.js API routes for Phase 1.** With a web client on Vercel there is no second consumer yet, so a standalone NestJS service would add deployment surface without benefit. Revisit when either a Flutter client or a third-party integration appears.

**4. Credential ownership — Supabase Auth.** This supersedes the Argon2 requirement in [Section 4](#4-authentication); Supabase manages hashing with bcrypt. Owning the hash is not worth running a credential store for a single-user product, and Supabase Auth is what the Row Level Security policies in [Section 12](#12-security) key off via `auth.uid()`.

### Still open

| # | Decision | Options | Blocks |
| --- | --- | --- | --- |
| 5 | Exchange rate source | Which provider supplies automatic USD/KHR rates, and fallback behaviour when it is unavailable | [Section 7](#7-currency-engine), net worth accuracy |
| 6 | Telegram bot parsing | Rules-based parser vs LLM intent extraction for the commands in [Section 9](#9-telegram-integration) | Phase 2 cost and offline behaviour |

Phase 1 proceeds with manual exchange rates, which are already specified in [Section 7](#7-currency-engine), so decision 5 does not block it.

## 18. Deliverables

Generate:

1. Full database schema
2. ER diagram
3. REST API specification
4. Authentication flow
5. Telegram architecture
6. UI wireframes
7. Production-ready components
8. Docker configuration
9. CI/CD pipeline
10. Testing suite
11. Seed data
12. Security checklist
13. Deployment guide
14. Complete documentation
15. Future enhancement recommendations

---

## Sources

- UI template library and its contents: [mitesh77/Best-Flutter-UI-Templates](https://github.com/mitesh77/Best-Flutter-UI-Templates) — template inventory verified against the repository's `master` branch file listing. Content was rephrased for compliance with licensing restrictions.
