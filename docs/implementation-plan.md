# Implementation plan — Tradesmatic (unified SaaS app)

> History: Phases 0–5 built the billing engine (manual Safepay schedules) as the foundation. Billing is now one feature area of the unified app — not a separate product. Phase 6 builds the Sidekick, marketing, and remaining dashboard surfaces around it.

## Phase 0 — Reset (done this pass)

- [x] Delete GHL code/routes/services/tests/migrations/docs/subagent.
- [x] Rewrite AGENTS.md + agent-rules (manual billing, tenancy, auth/email).
- [x] Fresh D1 schema + migration + seed plans (Launch/Growth, monthly/annual assumption).
- [x] Generic Safepay adapter + billing-date lib + minimal API shell + worker cron stub.
- [x] Configs (wrangler, env examples, package deps, opencode agents).
- [ ] Verify: typecheck, tests, build, fresh local D1 migration.

## Phase 1 — Auth + orgs + settings (in progress)

- [x] Better Auth (email+password w/ verification, Google OAuth conditional, magic link via Resend), per-request instance, Hono mount.
- [x] Org plugin mapped to our tables (`creatorRole: admin`), free-form roles enforced server-side, `isSuperadmin` self-heal seed.
- [x] Routes: public plans, org list/create, membership probe, superadmin settings get/patch.
- [x] Frontend: login/signup/magic/verify pages, onboarding wizard (org → plan+coupon → review; payment step in Phase 2), dashboard shell with org dropdown, invitation accept.
- [x] Tests: access helpers, email outbox, guard matrix (401/422/403/bypass), route tests with injected fakes. 44 passing.
- [x] Dev smoke (live localhost): full matrix green — see decision log 2026-09-05. Two bugs fixed en route (timestamp/boolean modes, account issuer col).

## Phase 2 — Billing core (COMPLETE, live-verified 2026-09-05)

- [x] Safepay customer ensure (`cus_`), session endpoint (server-computed amounts), Atoms save → wallet sync (`pm_`), primary + priority + failed marking + removal rules.
- [x] Signup confirm (trust chain: stored amount + tracker success; idempotent; recovery path), numbered invoices + negative discount lines, coupon attach/redeem, receipt emails.
- [x] Cron renewals (fallback cascade + auto-promote, past_due + day-0 dunning), reminder engine (0/2/4/6/7, stop on payment, no auto-cancel), manual pay/retry (single method, cooldown), plan change (prorated upgrade / next-cycle downgrade), end-of-period cancel.
- [x] Billing frontend: onboarding payment step (Atoms), billing page (invoices+PDF, pay/retry, methods, plan change, cancel).
- [x] Tests: 76 passing (math, engine cascade/dunning/idempotency/coupons/proration, routes, guards).
- [x] Live sandbox: real customer + session + client token; bogus tracker 422; run-renewals clean.
- [x] Browser smoke: test-card signup → wallet sync → forced-date renewal charge (INV-0001/0002, cycles 1→2).

## Phase 3 — Superadmin + usage charges (COMPLETE)

- [x] Client list + detail (subscription status, open balance, members, invoices, methods).
- [x] Usage/one-time invoice create → charge now via cascade (failed stays failed, no dunning/suspension); declined-card path tested.
- [x] Full/partial refunds (superadmin-only, tracker-based, no credits; full → `refunded` status).
- [x] Plans management (max 4 active enforced, delete blocked with referencing subscriptions, archive hides from signup).
- [x] Coupons management (CRUD + plan applicability + expiry/usage caps + superadmin attach).
- [x] Superadmin UI (clients/usage+refunds/plans/coupons/settings tabs) + manual renewal trigger.

## Phase 4 — Portal UX (COMPLETE)
- [x] `GET /api/me` (session profile + superadmin flag) for nav gating.
- [x] Profile page (name edit), org settings page (rename, members, invites, role changes, removals — admin-gated).
- [x] Dashboard with live data (subscription status/next charge, open invoices + balance, role card, past-due banner, gated superadmin link).
- [x] Tests: 92 passing (incl. `/api/me` gate tests).

## Phase 5 — Hardening (COMPLETE)

- [x] Webhook endpoint (`POST /webhooks/safepay`): HMAC verify, `evt_` dedupe, conservative reconcile (due→paid, due→failed, dashboard refunds; never downgrades paid). Unknown types acked+ignored.
- [x] Security audit: fixed error-detail leaks (generic 500s) + email HTML escaping; deferred in-app rate limiting to Cloudflare WAF rules at deploy.
- [x] Branded email layout (header, action buttons to /billing, footer) across all billing senders.
- [x] Full matrix: 102 passing. Fresh-DB migration check: clean. No-secrets audit: clean.
- [ ] Production deployment per `docs/deployment.md` (needs owner: Cloudflare account, domain DNS, live keys).

## Phase 6 — Unified app: marketing, dynamic pricing, Sidekick dashboard (next)

- [ ] Public marketing site in the same SPA: `/` landing, `/features`, `/pricing` rendered from `GET /api/plans` (active only). Signup/onboarding plan steps read the same endpoint. No hard-coded plans/prices in UI — add a test that fails on hard-coded plan names/prices in client copy.
- [ ] Sidekick dashboard sections reusing the existing shell + org switcher: overview, connections (Spectora OAuth/API-key, encrypted at rest), MCP access (token create/revoke), AI employees, schedules, business profile, audit log.
- [ ] Sidekick API routes per `docs/api-contract.md` (planned table) + contract tests per adapter and per new MCP tool.
- [ ] Owner experiences: Morning Briefing, Business Snapshot, Find Anything Unusual.
- [ ] Provider pagination/date windows complete before production-grade KPI claims.
- [ ] Public OAuth authorization server for MCP (tools unchanged); ISN adapter on real contract; writes only where provider + policy allow, with audit/approval tests.
