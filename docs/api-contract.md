# API contract: GrowthSnipe (unified app)

Base: same origin (Worker serves the SPA). Auth: Better Auth session cookie on every call.

## Conventions

- Tenant scope: every tenant endpoint takes `orgId` (query or body). Server resolves membership + role from the session; `superadmin` bypasses membership for reads and for usage-charge/plan/coupon writes.
- Errors: `{ "error": "<message>" }` with HTTP status. Never leak secrets, tokens, or gateway internals.
- Mutations: accept `Idempotency-Key` header; duplicates return the original result.
- Money: integer minor units + `currency` (USD). Dates: UTC seconds.
- Plans are data: the pricing page, signup picker, and onboarding plan step all render from `GET /api/plans` (active only). Never hard-code plans/prices in UI. Each plan carries `contactOnly` (0/1); contact-only plans return price fields at 0, are excluded from the max-4 active self-serve count, and are refused by checkout, signup, and plan change with a 422. Only SNIPE Intelligence™ may display a price.

## Routes (implemented)

| Method | Path | Access | Purpose |
|---|---|---|---|
| * | `/auth/*` | public/session | Better Auth (email+password, Google OAuth, magic-link via Resend) |
| GET | `/health` | public | liveness |
| GET/POST | `/api/orgs` | session | list / create orgs |
| GET/PATCH | `/api/orgs/:orgId` | admin | org profile; member/invitation sub-routes |
| GET | `/api/plans` | public (active only) | signup plan list (incl. comma-separated `features` bullets) |
| POST/PATCH | `/api/superadmin/plans` | superadmin | plans CRUD (max 4 active; delete blocked with subscribers; `features` comma-separated bullets) |
| GET/PUT | `/api/superadmin/settings` | superadmin | `portal_name`, `support_email` |
| POST | `/api/billing/signup` | session+`orgId` | plan+interval+coupon+payment-method → setup+first-period charge → subscription + invoice (legacy paid-first path) |
| POST | `/api/billing/trial/start` | user+`orgId` | start the 30-day SNIPE Intelligence™ trial, first workspace only, no card (409 otherwise) |
| POST | `/api/billing/subscribe` | user+`orgId` | convert trial (or paid-first create): plan+interval+coupon+payment-method → first-period charge → active subscription + invoice. Subscribing DURING a trial keeps the trial tier until the trial ends (`trial_prepaid`), starts the paid plan at `trial_ends_at` and anchors `nextCharge` to it; the response adds `prepaid` + `planStartsAt` |
| GET | `/api/billing/invoices` | member | invoice list for active org |
| GET | `/api/billing/invoices/:id` | member | invoice detail + items |
| GET | `/api/billing/invoices/:id/pdf` | member | invoice PDF download |
| POST | `/api/billing/invoices/:id/pay` | user+ | pay due invoice with selected method |
| GET/POST | `/api/billing/methods` | user+ | list / add (Atoms → wallet sync) |
| PATCH | `/api/billing/methods/:id` | user+ | set primary / priority |
| DELETE | `/api/billing/methods/:id` | user+ | remove (>1 valid must remain) |
| POST | `/api/billing/invoices/:id/retry` | admin/superadmin | retry ONE selected method (idempotent, cooldown) |
| POST | `/api/billing/subscription/cancel` | admin | cancel at period end (allowed during a prepaid trial: the plan never starts, access continues to the end of the paid period) |
| POST | `/api/billing/subscription/change` | admin | upgrade immediate-prorated / downgrade next cycle. 409 while a prepaid trial's plan has not started yet |
| GET | `/api/superadmin/clients` | superadmin | all orgs + subscription/invoice summary |
| GET | `/api/superadmin/clients/:orgId` | superadmin | full tenant detail |
| GET | `/api/superadmin/logs` | superadmin | platform application log: `q`/`level`/`surface`/`from`/`to`/`page`/`limit`; 50/page newest-first, 90-day retention (see `docs/logging.md`) |
| DELETE | `/api/superadmin/logs` | superadmin | bulk delete log rows: `{ ids: string[] }` → `{ deleted: number }` |
| POST | `/api/superadmin/usage-charges` | superadmin | create invoice + charge now |
| POST | `/api/superadmin/refunds` | superadmin | full/partial refund by invoice UUID or number (no credits) |
| GET | `/api/superadmin/clients` | superadmin | all orgs + subscription/open-balance summary |
| GET | `/api/superadmin/clients/:orgId` | superadmin | full tenant detail |
| GET/POST/PATCH/DELETE | `/api/superadmin/plans` | superadmin | plans CRUD (max 4 active; delete blocked with subscribers) |
| GET/POST/PATCH | `/api/superadmin/coupons` | superadmin | coupon CRUD + plan applicability |
| POST | `/api/superadmin/coupons/attach` | superadmin | attach coupon to a subscription |
| POST | `/api/superadmin/billing/run-renewals` | superadmin | manually run the renewal engine (same as Cron) |
| GET | `/api/superadmin/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD` | superadmin | system-wide KPIs (MRR, revenue, subs, AR), daily revenue/signups, subs-by-plan, trailing-12mo revenue. Defaults last 30d, max 366d. Txn timestamps are ms; subs/invoices are s |
| POST | `/api/superadmin/refunds` | superadmin | full/partial refund via gateway tracker |
| GET/POST/PATCH | `/api/superadmin/coupons` | superadmin | coupon CRUD + plan applicability |
| POST | `/webhooks/safepay` | signed | Safepay events (verify `X-SFPY-SIGNATURE` first, dedupe `evt_`) |

## Dormant routes (Sidekick + MCP, code retained, UI hidden)

Public marketing pages are served by the SPA; only the pricing content is API-driven (`GET /api/plans`, live):

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/plans` (already live) | public (active only) | pricing page + signup/onboarding plan source of truth |
| POST | `/api/sidekick/connections` | user+ | create provider connection (encrypted credentials) |
| GET | `/api/sidekick/connections` | member | list connections (no secret material) |
| DELETE | `/api/sidekick/connections/:id` | admin | disconnect provider |
| POST | `/api/sidekick/mcp-tokens` | admin | create org-scoped MCP token (one-time secret) |
| GET | `/api/sidekick/mcp-tokens` | admin | list tokens (prefix + metadata only, never hashes) |
| POST | `/api/sidekick/mcp-tokens/:id/revoke` | admin | revoke token |
| GET | `/api/sidekick/oauth-grants` | admin | list AI apps connected via OAuth (client names only, never token material) |
| POST | `/api/sidekick/oauth-grants/:clientId/revoke` | admin | disconnect an OAuth app (revokes all its tokens) |
| GET | `/api/sidekick/employees` | member | list AI employees (name, tier, entitled, active; Pro prompts inactive by default on capped plans) |
| PATCH | `/api/sidekick/employees/:name` | admin | activate/deactivate an employee (activating a Pro prompt on a capped plan is 403); deactivation hides it from the MCP roster |
| GET/POST | `/api/sidekick/schedules` | user+ | list / create briefing schedules (max one per cadence; duplicate → 409) |
| PATCH/DELETE | `/api/sidekick/schedules/:id` | user+ | update / disable schedule |
| GET | `/api/sidekick/briefings` | member | paginated delivered briefings (`limit` 1–50, `page` ≥1 → `briefings`, `page`, `limit`, `hasMore`) |
| DELETE | `/api/sidekick/briefings/:id` | user+ | delete one stored briefing row (sent email unaffected) |
| GET | `/api/sidekick/audit` | admin | write/action audit log |
| GET | `/api/sidekick/business-profile` | member | org business profile (null when unset) |
| PUT | `/api/sidekick/business-profile` | admin | create/replace business profile (name + trade required client-side) || ALL | `/mcp` | MCP bearer token | Streamable HTTP MCP (see `docs/mcp-contract.md`) |

## OAuth authorization server (MCP clients like Claude)

Public clients with PKCE (S256) only; no client secrets. Tokens are opaque, stored hashed, bound to one organization (the authorizing user's membership is enforced). Access 1h, refresh rotating 1yr, codes single-use 10min.

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/.well-known/oauth-protected-resource` | public | RFC9728 resource metadata (`/mcp` → this AS) |
| GET | `/.well-known/oauth-authorization-server` | public | RFC8414 AS metadata |
| POST | `/oauth/register` | public | RFC7591 dynamic client registration (https redirect URIs; http loopback allowed) |
| GET | `/oauth/authorize` | session+`orgId` | consent page (validates client, redirect URI, PKCE) |
| POST | `/oauth/authorize` | session+`orgId` | approve/deny → 302 with code or error |
| POST | `/oauth/token` | public | `authorization_code` (PKCE-verified) + `refresh_token` (rotating) exchange |

`/.well-known/*` and `/oauth/*` must run through the Worker (`run_worker_first`), never the SPA fallback.

## Invoice PDF

`GET /api/billing/invoices/:id/pdf` renders the invoice (number, lines incl. negative discount lines, totals, portal name + support email, paid stamp) as a downloadable PDF. Generated server-side at request time; no PDF bytes stored in D1.
