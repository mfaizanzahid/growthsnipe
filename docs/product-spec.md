> **Superseded for the current release.** GrowthSnipe is a productized growth company and SNIPE Intelligence™ is the analytics product. See `docs/growthsnipe-context.md` and `AGENTS.md`. Sections below that describe Tradesmatic positioning, the MCP server, AI advisors, or briefings apply only to dormant, UI-hidden code.

# Product spec — Tradesmatic (home-service business SaaS app)

## Positioning

Tradesmatic is a **decision-making platform** for owner-operated home-service
businesses — never "an MCP server" in customer-facing content. The
Multi-Trades™ MCP Server is the proprietary connective engine inside it
(always ™ on first mention per page): one unified, secure, real-time layer
across booking/CRM platforms and trades. Lead with outcomes (easier, faster,
better-informed decisions); introduce the technology second.

One-liner: Tradesmatic makes running your home service business easier to
decide, not just easier to see — connecting your business software to the AI
you already use, in real time, so you get specialist advisors who know your
numbers and can act on them.

Built by a team with 15 years running a digital agency serving home-service
businesses — insiders solving a disconnect they kept seeing, not outsiders
guessing. Company/team voice only, never founder identity.

## What it is

One app for small home-service businesses. Owners sign up, connect their field-service platform, ask an AI about their business, get scheduled owner briefings, and manage one account — including billing — from a single dashboard.

Billing & payments is one feature area inside the dashboard, not a separate product. Marketing pages and pricing are part of the same app and the same Worker.

How it works: **Connect** (link existing software via Multi-Trades™ MCP
Server — nothing to migrate) → **Add context** (short onboarding profile:
services, team, goals, seasonality) → **Decide** (ask questions, get
briefings, take action — inside the AI they already use).

## Primary user

Owner-operator of a small home-service business who already lives in a booking/field-service platform but lacks deep management analytics.

V1 ICP: home inspectors, solo or 1–5 team, $150K–$800K revenue, on Spectora
or ISN, active in coaching/associations, doing the thinking alone, already
experimenting with ChatGPT/Claude. Roadmap ICP: HVAC/plumbing/electrical/
roofing contractors (1–15 techs, $500K–$5M) on ServiceTitan/Housecall Pro/
Jobber. NOT for: franchises with BI staff, businesses with no booking/CRM,
DIY platforms. Messaging stays model-agnostic ("the AI tool you already
use").

Pains we speak to: diagnosing a slow month beyond gut feel; data in software
vs context in head; paid AI tools that start every session from zero and
can't act; no time for analysis ("three decisions that matter today"); no
ops/finance hire; reputation risk building quietly.

UVP: "Tradesmatic turns your business software into decisions, not just data
— using the AI you already have, connected in real time through our
Multi-Trades™ MCP Server." Pillars: decision platform not connector; live
not exported (no CSVs/snapshots/copy-paste); a team not a tool; answers AND
permissioned action. Trust lead: **no business data is stored on our
servers** — live pass-through only; never claim storage, backup, or
retention.

## Voice

Plainspoken not corporate; evidence-based not hypey (no "revolutionary",
"10x"); outcome-first; respect the owner's intelligence; specific over
abstract (real numbers, real scenarios); warm but unsentimental. No revenue
guarantees, no implied endorsements without real partnerships (illustrative customer testimonials on marketing pages are permitted when owner-approved). Pricing
figures render from `GET /api/plans` (annual = "2 months free"); partner
pricing as named member benefits.

## V1 market test

Vertical: home inspectors.

Primary provider: Spectora (read-only baseline).

Secondary provider: ISN stub.

Primary AI client: Claude (any MCP client works; bearer-token auth for the market test, OAuth authorization server as the production upgrade).

## Core promise

Open your business app, see your morning briefing, ask questions about your business, and eventually take approved actions in the system — while signup, plans, invoices, and payment methods just work in the background.

## Dashboard map

Public (unauthenticated): `/` landing, `/features`, `/pricing` (dynamic — renders active plans from `GET /api/plans`), `/login`, `/signup`, `/onboarding` (org → plan+coupon → card → pay).

App (authenticated, org-scoped): `/dashboard` Sidekick overview, `/connections`, `/mcp-access`, `/employees` (AI Employees), `/briefings-schedules` (Briefings & Schedules), `/business-profile`, `/billing` (invoices+PDF, pay/retry, methods, plan change, cancel), `/settings` (org), `/profile`.

Superadmin: `/superadmin` clients, invoices, usage charges, refunds, plans, coupons, settings.

## Plans are data, never code

Plans are superadmin-managed (max 4 ACTIVE; API refuses a 5th). Fields: name, monthly/yearly price, user limit (`maxUsers`, null = unlimited), briefings flag, description, display order, active flag, features (comma-separated bullets, single source of truth for pricing + billing). No setup fees, no plan-level trials. Delete blocked while any `org_subscriptions` row references the plan; archive hides the plan from signup AND the pricing page.

Seed: Starter ($9/mo, $90/yr, 1 user, no briefings) and Pro ($14/mo, $140/yr, unlimited, briefings). Dev data, not the product.

New workspaces start a 30-day Pro trial with no card. At trial end (or anytime), subscribing picks Starter or Pro and charges the first period immediately. Expired trials gate everything except billing + business profile. A second workspace opens only while the first holds an active paid subscription, and subscribes immediately with no trial.

The pricing page, subscribe plan picker, and onboarding plan step MUST render from `GET /api/plans` (active only). No plan names, prices, or intervals in JSX copy, constants, or test fixtures presented as product truth. Currency: USD. No tax in v1, no late fees.

## Default AI employees

1. Business Owner / CEO Advisor — daily driver: priorities, changes, three decisions
2. CFO / Performance Analyst — revenue, ticket, mix, trends; never calls revenue "profit"
3. Operations Manager — scheduling health, capacity, follow-through
4. Revenue Manager — pipeline, conversion, pricing power, next dollar
5. Customer Intelligence Manager — attention, referrals, drift, with records
6. Marketing / Channel Analyst — channel and referral-source performance
7. Quality / Risk Manager — defects and risky patterns before they become reviews

AI employees share one business context and invoke the same canonical data tools.

## Example conversation

User: `How did we do this week?`

Sidekick:
- fetches orders/events/clients/agent stats
- compares with prior period
- identifies anomalies
- summarizes key numbers
- states uncertainty when data is incomplete
- recommends 3 owner priorities

User: `Which referral sources are slipping?`

Sidekick:
- searches relevant client/referral fields
- compares periods
- returns evidence and caveats

User: `Reschedule tomorrow's 10 AM job to 2 PM.`

If no write capability: explains that the connected provider is read-only.
If write capability exists but policy is SUGGEST: asks for confirmation.
If EXECUTE policy exists: verifies target, performs action, and records an audit event.
