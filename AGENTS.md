# AGENTS.md — Tradesmatic (home-service business SaaS app)

## Mission

Build one unified SaaS app for small home-service businesses (V1 market test: home inspectors): **Tradesmatic**. Owners run their business from a single dashboard — Sidekick overview, provider connections, AI access, AI employees, briefing schedules, business profile — and **billing & payments is one feature area inside that dashboard**, not a separate product.

There is exactly one app, one dashboard shell, one auth/org model, one Worker, one D1. Never frame or split the work as "billing portal + sidekick". Billing language from history (plans, invoices, Safepay) always refers to the billing feature of the Sidekick app.

No GoHighLevel. No HighLevel provider, OAuth, iframe, queryUrl, or wallet code remains. Do not reintroduce it.

## Product positioning (applies to every customer-facing word)

- **Tradesmatic is a decision-making platform** for owner-operated home-service businesses — never "an MCP server" in customer-facing content. The **Multi-Trades™ MCP Server** is the proprietary technology inside it (the connective engine); lead with outcomes (easier, faster, better-informed decisions), introduce the technology second. Always ™ on first Multi-Trades™ mention per page.
- One-liner: Tradesmatic makes running your home service business easier to decide, not just easier to see — connecting your business software to the AI you already use, in real time, so you get specialist advisors who know your numbers and can act on them.
- ICP (V1): home inspectors, solo or 1–5 team, on Spectora/ISN, already experimenting with ChatGPT/Claude. Roadmap: HVAC/plumbing/electrical/roofing on ServiceTitan/Housecall Pro/Jobber. Model-agnostic messaging ("the AI tool you already use").
- Trust differentiator: **no business data is stored on our servers** — live pass-through from the business's own software. Never claim storage, backup, or retention anywhere.
- Voice: plainspoken, evidence-based, outcome-first, specific over abstract. No hype ("revolutionary", "10x"), no revenue guarantees, no implied endorsements (NACHI/ASHI/vendors) without a real partnership (illustrative customer testimonials on marketing pages are permitted when owner-approved), company/team voice only (never founder identity).
- Pricing figures render from `GET /api/plans`; annual framing is "2 months free". Verify numbers against the live pricing page before publishing.
- Full brief lives in `docs/product-spec.md`. Customer copy (site, blog, dashboard, onboarding, emails) is owned by `.opencode/agents/content-strategist.md` — use it for IA, copy, and posts.

## Product surfaces

1. **Public marketing site** (unauthenticated): landing, features, and a **pricing page that renders plans dynamically from `GET /api/plans`** — never hard-code plan names, prices, or setup fees in UI copy. Signup/onboarding reads the same endpoint.
2. **App dashboard** (authenticated, org-scoped via top-left org switcher): Sidekick overview, connections, MCP access, AI employees, schedules/briefings, business profile, billing & payments, org settings, profile.
3. **Superadmin area**: all-tenant clients, invoices, usage/one-time charges, refunds, plans, coupons, portal settings.
4. **Remote MCP endpoint** `/mcp` (Streamable HTTP, MCP SDK v2): the single AI connection for Claude/AI clients, with organization-scoped bearer tokens for the V1 market test.

## Stack

- Frontend: Vite + React 19 + Tailwind CSS + shadcn + Hero Icons. Mobile-responsive shell + public marketing pages.
- API: Cloudflare Workers + Hono.
- Persistence: Cloudflare D1 + Drizzle ORM.
- Auth: Better Auth (email+password, Google OAuth, magic link via Resend). D1-backed sessions.
- Payments (billing feature): Safepay (sandbox first, USD first) via `@sfpy/atoms` CardCapture + server `fetch` adapter in `src/server/providers/safepay.ts`.
- Email: Resend for auth (verification, magic link, password reset, invitations); Brevo-first for billing (charges, invoices, subscription events, briefings) with Resend fallback; Brevo contacts list for verified new signups.
- MCP: MCP SDK v2 Streamable HTTP at `/mcp`, organization-scoped bearer tokens (`bs_mcp_<token>`, hash stored in D1).
- Secrets only via environment bindings. Never expose Safepay secret / webhook secret / Resend key / auth secrets / provider credentials to React.

## Plans are data, never code (hard rule)

- Plans are superadmin-managed (max 4 ACTIVE; API refuses a 5th), fields: name, monthly/yearly price, user limit (`maxUsers`, null = unlimited), briefings flag, description, display order, active flag, features (comma-separated bullets, single source of truth for pricing + billing). No setup fees, no plan-level trials — enforced server-side. Delete blocked while any `org_subscriptions` row references the plan; archive hides it from signup/pricing.
- Seed: Starter ($9/mo, $90/yr, 1 user, no briefings) and Pro ($14/mo, $140/yr, unlimited, briefings). Dev data, not the product.
- The pricing page, subscribe plan picker, and onboarding plan step MUST render from `GET /api/plans` (active only). No plan names, prices, or intervals in JSX copy, constants, or tests-as-fixtures presented as product truth.
- Currency: USD. No silent conversion. No tax in v1, no late fees.

## Dashboard map (target; billing section already built, Sidekick/marketing pages land per build order)

- `/` marketing landing, `/features`, `/pricing` (dynamic), `/privacy`, `/terms`, `/contact`, `/login`, `/signup`, `/onboarding` (trial flow: org → profile → Pro trial → connect; paid flow for further orgs: org → profile → plan → pay → connect).
- `/dashboard` Sidekick overview, `/connections`, `/mcp-access`, `/employees`, `/briefings-schedules`, `/business-profile`, `/billing` (invoices+PDF, pay/retry, methods, plan change, cancel), `/settings` (org), `/profile`. (Nav labels: AI Employees, Briefings & Schedules.)
- `/superadmin` clients, invoices, usage charges, refunds, plans, coupons, settings.
- Full route contract: `docs/api-contract.md`. Navigation map: `src/client/sidekick-navigation.md`.

## Billing feature — trial-first manual subscriptions

We do NOT use Safepay built-in subscriptions (`sub_`/`plan_` hosted subscribe). There is no native-subscription path.

- Trial: every first workspace starts a 30-day Pro trial — no card, no charge, no invoice. Full (Pro-tier, unlimited) access until `trial_ends_at`.
- Trial reminders: daily Cron emails org admins at 5/3/0 days left and 3/5 days overdue (each offset once per subscription). At expiry the subscription flips to `trial_expired`.
- Gating: only `trialing`/`active` (plus canceled-until-period-end) subscriptions get full access. `trial_expired`/`past_due`/none see billing + business profile only; MCP tokens and briefing Crons stop for gated orgs.
- Subscribe: converts a trial (or starts paid for orgs that never trialed) — plan + interval + coupon + card, first period charged immediately via Safepay Atoms + `unscheduled_cof`, counts as cycle 1.
- Subscribing DURING a trial (prepaid trial): charged immediately, but the workspace stays on the trial tier until `trial_ends_at`; the paid plan starts then and the renewal date follows the trial (`nextCharge = trial_ends_at + one interval`). The row keeps `status='trialing'` with `trial_prepaid=1`; the daily Cron flips it to `active` and enforces the paid plan's limits (downgrade semantics, no reactivation). No trial reminders for a prepaid trial. Plan change is 409 until the plan starts; cancel is allowed (the plan never starts, access continues to the end of the paid period). A second workspace opens once paid.
- Renewals: the Worker owns the schedule (daily Cron). Trialing subscriptions are NEVER charged (trial processor owns them). Due paid `org_subscriptions` charge in priority order (primary first, then backups by ascending `priority`); first success completes the period (invoice paid + `nextCharge` advanced, backup auto-promoted). Failed methods marked `failed`; later success returns them to `active`.
- Auto-retry cap (per card, not per invoice): the daily Cron retries every saved card — valid or failed — with at most one attempt per card per day and at most 3 attempts per card per overdue invoice (initial + 2 retries), at least 24h apart. Attempts are attributed via `transactions.payment_method_id`. A newly added card gets its own budget. When no card has budget left, the invoice waits for manual pay only (user "Retry with primary card" button or superadmin support retry — manual pay may target a failed card and reactivates it on success).
- Method removal allowed only while >1 VALID method remains; primary cannot be removed without promoting another first.
- Manual retry (org `admin` or `superadmin`): one selected method, idempotent per invoice attempt, short cooldown.
- Dunning (all methods fail for a period): invoice stays unpaid, subscription goes `past_due` (suspended, data retained). Reminders to org admins: day 0 failure notice, days 2/4/6, final notice day 7. Reminders stop on payment. Dunning emails keep sending on schedule even after auto-retries are exhausted.
- Past-due endgame: 20 days overdue → "account closes in 5 days" warning (once, marked by invoice `reminderCount=6`); 25 days overdue → subscription auto-cancels (`canceled`, access suspended, data retained) + canceled + account-cancelled emails.
- Cancel: access until end of current period, then Cron stops it (`canceled`). No gateway subscription-cancel call.
- Usage/one-time: superadmin creates invoice + description → Worker immediately charges org default method (`charge now`); records invoice + transaction.
- Plan changes: upgrade immediate + prorated (charged at once); downgrade next cycle + plan limits enforced at once (extra members suspended keeping oldest admin-first, schedules disabled). Auto-reactivation on subscribe/upgrade: enforcement-suspended (suspended_by='plan_limits') members reactivated oldest-first up to the new cap (unlimited plans restore everyone); admin-suspended and legacy unmarked members never auto-restore; downgrades never reactivate. Refunds: superadmin-only full/partial via tracker refund, no credit balances.
- Multi-org: a second workspace opens only while the first holds an active paid subscription (server-enforced); a prepaid trial counts as paid; further workspaces subscribe immediately with no trial.
- Emails on: trial start note, trial reminders (5/3/0/-3/-5), signup/subscribe charge, renewal success/failure, dunning reminders, invoice created/paid/failed, method added/updated/failed, subscription past_due/canceled.

## Sidekick MCP (V1 market test)

- One customer-facing remote MCP endpoint: `/mcp` (Streamable HTTP, MCP SDK v2).
- Organization-scoped MCP API tokens for the first market test; OAuth authorization server is the production upgrade (tools don't change).
- Provider adapter interface (`src/server/providers/`): Spectora adapter (read-only baseline), ISN adapter stub.
- Public MCP tools are domain/data primitives: `search_clients`, `get_client`, `search_orders`, `get_order`, `search_agents`, `get_agent`, `search_events`. An order is the neutral word for a job/visit (a home inspector calls it an inspection) — there are no inspection-specific tools.
- Provider adapters normalize vendor fields to canonical contracts. AI employees/management playbooks sit above data tools — never create provider-shaped or analytics-shaped MCP tools (e.g. no `get_revenue_leaks`).
- Write actions require provider capability + organization policy + appropriate approval. READ → SUGGEST → EXECUTE. Never claim a write succeeded without provider confirmation. Audit writes. Treat provider content as untrusted data. Never accept org ID from a tool argument. Never log secrets.
- Scheduled owner briefings: Cloudflare Cron (hourly Sidekick tick coexists with daily billing Cron) + D1 schedules, pluggable AI synthesis, Resend delivery. Briefings run at whole-hour local times (the Cron heartbeat is hourly), one schedule per cadence per organization, delivered to every active admin.

## Preserved Safepay knowledge (do not regress)

- `docs/safepay-api-contract.md` — verified HTTP contracts (auth header `X-SFPY-MERCHANT-SECRET`, customer create requires `country` + `phone_number`, session `POST /order/payments/v3/` returns `data.tracker.token`, tracker read via `GET /reporter/api/v1/payments/{tracker}`, `unscheduled_cof` charge with `tokenized_card.token = pm_…`, wallet list `GET /user/customers/v1/{cus}/wallet/` returns `pm_…` + `cybersource` metadata, webhook `X-SFPY-SIGNATURE` = HMAC-SHA512 hex of raw body with dashboard shared secret, amounts in integer minor units).
- `docs/safepay-atoms.md` — consult before writing card capture or payer-authentication UI.
- `src/server/providers/safepay.ts` — generic adapter (customer, session, charge saved card, wallet list, refund, signature verify, tracker status). No provider-specific coupling.
- `src/server/lib/billing-dates.ts` — pure billing-date math carried over from the manual-schedule engine.

## Tenancy & roles

- A user can belong to multiple organizations and create multiple orgs. Active org via top-left dropdown, sent as `orgId` on every tenant-scoped call.
- Per-org roles: `admin` (manage org, members, billing, subscriptions, invoices), `user` (no billing access), `viewer` (no billing access). Billing & payments (`/api/billing/*`, billing page) is admin-only; non-admin reads and writes return 403.
- Global `superadmin` (via `SUPERADMIN_EMAILS` env seed + `users.isSuperadmin`): full read access to all tenants, manages plans/coupons/portal settings, creates one-time/usage invoices charged immediately. Every superadmin write is audited with actor identity.
- Every tenant-scoped query MUST filter by `orgId` and enforce membership + role. No cross-org leakage.

## Portal settings (superadmin)

- `app_settings` holds `support_email`, editable in superadmin settings. The portal name is hardcoded (`Tradesmatic`) and not editable. App header, marketing pages, and all emails use these values.

## Embedded scripts (operator-configured)

- Two build-time variables carry third-party HTML/embed code (e.g. a chat widget): `VITE_EMBED_MARKETING_HTML` (public marketing routes) and `VITE_EMBED_APP_HTML` (authenticated app pages, excluding `/superadmin/*`). They are read from `.env` (local) or the build environment (production) and injected client-side as the last child of `<body>`.
- These are **public by definition**: a `VITE_` value is inlined into the client bundle, so it ships to every visitor of that surface and is visible in the downloaded JS. Never put a secret in a `VITE_` key, never let a tenant or org admin set it, and never expose it through a superadmin form (stored XSS across tenants). Only the build environment may set it.
- **The same snippet is escaped differently per location**: `\$` in a `.env` file (dotenv expands `$name`), a plain `$` in a Cloudflare build variable (copied verbatim).
- An empty value means "no snippet for this surface". A missing variable logs a warning in production builds, so a build machine without the key is visible rather than silent.
- Static Assets own the app HTML, so there is no server-side `</body>` injection point. Do not add one without reworking `run_worker_first` and the prerender pipeline. Scripts are recreated with `createElement` because scripts inserted as markup are inert.
- Values over 64 KB are ignored (never truncated). Adding a CSP later requires `script-src`/`connect-src` allowances for the widget vendor.

## Discounts (superadmin-managed coupons)

- Stripe-style coupons: uppercase unique code, percent or fixed-amount, duration (`once` / `repeating` N cycles / `forever`), selectable applicable plans (none = all), expiry window, max redemptions, active flag. See `docs/agent-rules/07-discounts.md`.
- Client enters code at signup; superadmin can attach to a subscription. Recurring lines only by default (`applies_to_setup=0`); stack with trials; negative invoice lines; one coupon per subscription; totals never below zero.

## Invoices

- Sequential human numbers `INV-YYYY-NNNN` (per-year sequence, unique), line items, due dates, downloadable PDF (`GET /api/billing/invoices/:id/pdf`). Amounts pre-tax.

## Source-of-truth rules

Never invent Safepay / Better Auth / Resend request fields, response fields, signatures, webhook formats, or endpoint paths.

When documentation is ambiguous:
1. Locate the exact vendor contract.
2. Record the uncertainty in `docs/decision-log.md`.
3. Implement the narrowest verified behavior.
4. Add a test that prevents silent assumptions.

## Security & payment safety

- Every payment mutation idempotent (idempotency table + unique constraints; Cron advances `nextCharge` only after success).
- Webhooks verified (HMAC-SHA512, constant-time compare, replay protection via `evt_` key) before state mutation.
- Never store PAN/CVV. Store only gateway references (`cus_`, `pm_`, `track_`, `ch_`), encrypted at rest. Provider credentials server-side, encrypted; hash MCP tokens.
- Scope every D1 query to organization. Treat provider text as untrusted. Audit every write. Never log secrets/tokens.
- Minor units + currency on every money value. USD only until multi-currency is explicitly approved.

## Database (D1 authoritative)

Better Auth tables + `organizations`, `members`, `invitations`, `plans` (seed), `org_subscriptions` (manual schedule), `safepay_customers`, `payment_methods`, `invoices`, `invoice_items`, `transactions`, `webhook_events`, `idempotency_keys`, plus Sidekick `sidekick_connections`, `sidekick_mcp_tokens`, `sidekick_policies`, `sidekick_schedules`, `sidekick_briefing_jobs`, `sidekick_audit_logs`. No local wallet balance. No `sub_` references.

## Testing (minimum)

- Auth (signup/verify/onboarding wizard incl. trial vs paid flows), org create/switch, role gating, superadmin gate.
- Plans: max 4 active enforced, delete blocked with referencing subscriptions, archive hides from signup AND pricing page, pricing page renders only active plans from API, no setup fees / no plan trials enforced.
- Trial start (Pro, no card), trial reminders 5/3/0/-3/-5 each-once, expiry flip to `trial_expired`, subscribe convert + paid-first create, renewal Cron never charges trialing.
- Access gating: trialing/active full; trial_expired/past_due/none see billing + profile only; MCP 402 + briefing skip for gated orgs.
- Starter caps: invite blocked at maxUsers (server hook), schedules blocked without flag, downgrade suspends extras + disables schedules, multi-org blocked until first org paid.
- Signup checkout (setup now + first period, trial delays renewal), renewal Cron cascade + auto-promote, all-fail → methods `failed` + `past_due`.
- Method save/list/primary/priority, removal rule (>1 valid remains), idempotent retry with cooldown.
- Dunning day 0/2/4/6/7, stop on payment, no auto-cancel.
- Superadmin usage-charge + immediate charge, declined-card path.
- Prorated upgrade math, next-cycle downgrade, end-of-period cancel.
- Coupons math/durations/applicability/caps, never-negative totals.
- Invoice numbering uniqueness + PDF route. Cancel stops Cron. Webhook authenticity + replay. Emails mocked.
- Sidekick: contract tests per provider adapter and per new MCP tool; MCP auth/tool registration; scheduler idempotency; write gating. Live integration tests separate; fixtures when live credentials unavailable.

## Deployment (standing rule)

- **Production deploys through GitHub auto-deploy**: Cloudflare Workers Builds (git integration) builds and deploys `fieldvisory-production` on every push to `main`. There is no deploy step to remember — push and it goes live. `npm run deploy:prod` is the manual fallback only.
- **Schema changes are not part of the deploy.** Apply the production migration FIRST (`npm run db:migrate:prod`, or the `migrate-prod` GitHub workflow), then push. Code that reads a column the database does not have yet breaks every query against that table.
- `VITE_*` values (GA ID, embed snippets) are **build** variables: set them in the Cloudflare build environment, and remember they only take effect on the next build.
- **`$` is escaped differently in the two places.** A `.env` **file** is dotenv-expanded (`$name` is expanded away), so a `$` in a snippet must be written `\$` there. A **build variable is copied verbatim**, so the same snippet must use a plain `$` there — the `.env` form leaves a stray backslash in the bundle and the snippet fails.
- CI (`.github/workflows/ci.yml`) runs typecheck + test + build on PRs and pushes to `main`. It deploys nothing.
- Full checklist: `docs/deployment.md`.

## Required reading

For relevant work, read `docs/architecture.md`, `docs/product-spec.md`, `docs/mcp-contract.md`, `docs/provider-adapters.md`, `docs/scheduling.md`, `docs/api-contract.md`, `docs/deployment.md` (before any deploy or migration), `docs/ui-table-conventions.md` (for any data table), and the relevant `docs/agent-rules/*.md`.

## OpenCode

Use `.opencode/agents/*.md`. Prefer `implementation-planner` first, then the specialist subagent, then `security-reviewer` and `test-engineer` for production-facing changes.

## Clarifications (standing rule)

Always ask clarifying questions before proceeding when a request is ambiguous, has more than one reasonable interpretation, or involves a tradeoff the owner should decide (scope, copy voice, irreversible or production-affecting actions). Ask via the question tool with concrete options and a recommendation — never guess on scope. Trivial, fully-specified tasks proceed without questions.

## Git (standing rule)

Never `git commit`, `git push`, amend, rebase, or reset unless the owner explicitly asks for it in that request. Finished work is left uncommitted in the working tree; report what changed and let the owner decide when it ships. A request to implement, fix, or verify is not a request to commit.

## Verification

Run:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

If live credentials are unavailable, use fixtures and clearly state what was not live-tested.

## Completion rule

An implementation may be claimed complete only after: typecheck passes, tests pass, build passes, migrations apply cleanly on a fresh local D1, no secrets committed, no hard-coded plans/prices in UI, all payment mutations idempotent, renewals run only via the manual-schedule Cron, and docs updated.
