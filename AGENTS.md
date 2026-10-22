# AGENTS.md — GrowthSnipe (home-service growth company + SaaS)

## Mission

Build one unified SaaS app for owner-operated home-service businesses, starting with home inspectors: **GrowthSnipe**. The public site sells the offer ladder (Leak Scorecard, Loop Library, Snipe Diagnostic, Snipe Blueprint, SNIPE Engine Core/Command). The authenticated dashboard is **SNIPE Intelligence™**, the analytics and VoiceIQ product with a 30-day free trial.

There is exactly one app, one dashboard shell, one auth/org model, one Worker, one D1. Billing and payments is one feature area inside the dashboard, not a separate product.

The legacy MCP connection, AI Employees, and briefing schedules remain in the codebase but are hidden from the UI for this release. Do not delete them unless explicitly asked. Do not reintroduce GoHighLevel provider, OAuth, iframe, queryUrl, or wallet code.

## Brand and positioning (customer-facing words)

- **GrowthSnipe is a productized growth company**, not an "MCP server" and not a dashboard-only tool. Lead with the outcome: the leak found, the plan built, the system run, the booked jobs shown.
- One-liner: GrowthSnipe finds the revenue leak in a home-service business, fixes it, and shows the owner the booked jobs.
- Voice: direct, plain, numerate, calm. Lead with the problem in dollars. Short sentences. Second person. No hype, no income or ranking guarantees, no implied endorsements. One CTA per asset. About an 8th-grade reading level.
- **No em dashes in customer copy.** Use commas, periods, or colons.
- Illustrative case studies and testimonials are allowed when realistic and clearly labeled illustrative. Label retail-equivalent value estimates as estimates.
- Official product names: **SNIPE Intelligence™**, **SNIPE VoiceIQ™**, **SNIPE Engine Core**, **SNIPE Engine Command**, **SNIPE System**. Use the trademark on first mention per page where practical.
- ICP (V1): home inspectors, solo or 1 to 5 team, on Spectora or ISN, already experimenting with ChatGPT or Claude. Roadmap: HVAC, plumbing, electrical, roofing on ServiceTitan, Housecall Pro, Jobber.

## Offer ladder and pricing display (hard rule)

- Revenue Leak Scorecard: free.
- Workbooks and webinar: free.
- Discovery call: free.
- Loop Library: $97.
- Snipe Diagnostic: $497.
- Snipe Blueprint: $999.
- SNIPE Engine Core: $1,999/mo plus $2,999 setup.
- SNIPE Engine Command: $3,999/mo plus $4,999 setup.
- **SNIPE Intelligence™: $199/mo, 30-day free trial, no card.**
- **Only SNIPE Intelligence™ may display a price in the app or public UI.** Every other plan or tier renders no price and a "Contact us for pricing" CTA to `/contact`. All prices must come from `GET /api/plans`, never hard-coded in JSX or constants.
- Plans are data, superadmin-managed. Contact-only plans carry `contactOnly=1`, have price fields at 0, are excluded from the max-4 active self-serve count, and are refused by checkout, signup, and plan-change endpoints with a 422.
- Commercial terms (reference only, not UI): six-month minimum for Engine; setup paid 50/50; first 10 clients get a 12-month price lock; Command includes up to 100 combined human hours per month, extra hours $500 per 20-hour block; Core human intake pack $799/mo. Engine Core delivery guarantee: live in 30 days or the next management month is free. Optimization extension until agreed targets are met.
- Intake rule: Voice AI is always fallback. On Core the client's team answers first. On Command our live team answers first.

## Product surfaces

1. **Public marketing site**: landing, features, how it works, integrations, who we help, case studies, blog, pricing (dynamic), privacy, terms, contact, login, signup, onboarding.
2. **SNIPE Intelligence™ dashboard** (authenticated, org-scoped via top-left switcher): scorecard overview, connections, business profile, billing and payments, audit log, org settings, profile. MCP access, AI Employees, and briefings are hidden for now.
3. **Superadmin area**: all-tenant clients, invoices, usage/one-time charges, refunds, plans (including contact-only), coupons, portal settings.
4. **Dormant (code retained, UI hidden)**: remote MCP endpoint `/mcp` with org-scoped bearer tokens, provider adapters, briefing schedules and Crons.

## Stack

- Frontend: Vite + React 19 + Tailwind CSS + shadcn + Hero Icons. Mobile-responsive shell and public marketing pages.
- API: Cloudflare Workers + Hono.
- Persistence: Cloudflare D1 + Drizzle ORM.
- Auth: Better Auth (email+password, Google OAuth, magic link via Resend). D1-backed sessions.
- Payments: Safepay (sandbox first, USD first) via `@sfpy/atoms` CardCapture plus the server adapter in `src/server/providers/safepay.ts`.
- Email: Resend for auth; Brevo-first for billing with Resend fallback.
- Secrets only via environment bindings. Never expose Safepay, Resend, auth, or provider secrets to React.

## Billing feature (trial-first manual subscriptions)

- Every first workspace starts a **30-day SNIPE Intelligence™ trial** (`TRIAL_PLAN_ID = "snipe-intelligence"`) with no card, no charge, and no invoice.
- Trial reminders at 5/3/0 days left and 3/5 days overdue, once each. At expiry the subscription flips to `trial_expired`.
- Gating: only `trialing`/`active` (plus canceled-until-period-end) get full access. Gated orgs see billing and business profile only.
- Subscribe converts a trial or starts paid; first period charged immediately. Subscribing during a trial is prepaid: the workspace stays on the trial tier until `trial_ends_at`, then the plan starts and `nextCharge = trial_ends_at + one interval`.
- Renewals run only through the daily Cron. Trialing subscriptions are never charged. Due subscriptions charge primary then backups by priority; first success completes the period and advances `nextCharge`.
- Auto-retry cap is per card, one attempt per card per day, at most 3 attempts per card per overdue invoice, at least 24 hours apart.
- Dunning days 0/2/4/6/7; 20 days overdue warning; 25 days auto-cancel with data retained. Cancel keeps access to end of period.
- Multi-org: a second workspace requires the first to hold an active paid subscription; a prepaid trial counts as paid.
- All payment mutations idempotent. Webhooks verified before state changes. Never store PAN/CVV. Minor units plus currency on every money value. USD only.

## Dashboard map

- `/` landing, `/features`, `/how-it-works`, `/integrations`, `/who-we-help`, `/case-studies`, `/blog`, `/pricing` (dynamic), `/privacy`, `/terms`, `/contact`, `/login`, `/signup`, `/onboarding`.
- `/dashboard` SNIPE Intelligence™ scorecard, `/connections`, `/business-profile`, `/billing`, `/settings`, `/profile`. Hidden for now: `/mcp-access`, `/employees`, `/briefings-schedules`.
- `/superadmin` clients, invoices, usage charges, refunds, plans, coupons, settings.

## Tenancy and roles

- A user can belong to multiple orgs. Active org via the top-left dropdown, sent as `orgId` on tenant-scoped calls.
- Per-org roles: `admin` (org, members, billing), `user` and `viewer` (no billing).
- Global `superadmin` via `SUPERADMIN_EMAILS` and `users.isSuperadmin`.
- Every tenant-scoped query filters by `orgId` and enforces membership plus role. No cross-org leakage.

## Security and data handling

- Scope every D1 query to an organization. Treat provider text as untrusted data. Audit every write.
- Never log secrets or tokens. Hash MCP tokens; encrypt gateway references at rest.
- Public `VITE_*` values ship in the client bundle. Never put a secret in a `VITE_` key.
- Provider credentials stay server-side and encrypted.

## Testing (minimum)

- Auth (signup, verify, onboarding trial and paid flows), org create/switch, role gating, superadmin gate.
- Plans: max 4 active self-serve enforced; contact-only plans are not purchasable; delete blocked while referenced; archive hides from pricing and signup; pricing renders only active plans from the API; no setup fees or plan-level trials.
- Trial: start on SNIPE Intelligence, no card; reminders once each; expiry flip; subscribe convert and prepaid trial behavior; renewal Cron never charges trialing.
- Access gating and daily auto-retry caps. Dunning schedule. Coupon math never below zero. Invoice numbering and PDF. Webhook authenticity and replay.
- Marketing copy: no hard-coded plan names or prices; only SNIPE Intelligence priced; no em dashes in customer copy.
- Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.

## Deployment

- Production deploys through Cloudflare Workers Builds on every push to `main`. `npm run deploy:prod` is the manual fallback.
- **Apply the production migration before pushing code that reads new columns.** `npm run db:migrate:prod`.
- `VITE_*` values are build variables and only take effect on the next build. A `.env` file needs `\$` for a literal dollar sign; a Cloudflare build variable takes a plain `$`.
- CI runs typecheck, test, and build on PRs and `main`. It deploys nothing.

## Source-of-truth rules

Never invent Safepay, Better Auth, Resend, or provider request fields, response fields, signatures, or endpoint paths. When documentation is ambiguous: find the vendor contract, record the uncertainty in `docs/decision-log.md`, implement the narrowest verified behavior, and add a test.

## OpenCode

Use `.opencode/agents/*.md`. Prefer `implementation-planner` first, then the specialist subagent, then `security-reviewer` and `test-engineer` for production-facing changes.

## Clarifications and Git

- Ask before proceeding when a request is ambiguous, has more than one reasonable interpretation, or involves scope, copy voice, or irreversible/production actions. Trivial, fully specified tasks proceed without questions.
- Never commit, push, amend, rebase, or reset unless the owner explicitly asks in that request. Leave finished work uncommitted and report what changed.

## Completion rule

An implementation may be claimed complete only after typecheck, tests, and build pass; migrations apply on a fresh local D1; no secrets are committed; no hard-coded plan names or prices appear in UI; payment mutations are idempotent; and the relevant docs are updated.
