# GrowthSnipe

One unified SaaS app for owner-operated home-service businesses. GrowthSnipe is a productized growth company: it finds the revenue leak, fixes it, and shows the owner the booked jobs.

The authenticated product is **SNIPE Intelligence™**, the analytics and VoiceIQ dashboard with a 30-day free trial. Billing and payments is one feature area inside the dashboard, not a separate product.

## Current release

- Public site: landing, features, how it works, integrations, who we help, case studies, blog, dynamic pricing, privacy, terms, contact, login, signup, onboarding.
- Dashboard: scorecard, connections, business profile, billing, audit log, settings, profile.
- Superadmin: clients, invoices, usage charges, refunds, plans, coupons, portal settings.
- Dormant but retained in code: `/mcp`, provider adapters, AI Employees, and briefing schedules. These are hidden from the UI for this release.

## Pricing rules

- **SNIPE Intelligence™** is the only self-serve plan and the only plan that displays a price: $199/mo with a 30-day free trial and no card.
- Loop Library, Snipe Diagnostic, Snipe Blueprint, SNIPE Engine Core, and SNIPE Engine Command are contact-only. They render no price and a "Contact us for pricing" CTA to `/contact`.
- Plans are data. Load them from `GET /api/plans`; never hard-code plan names or prices in UI.
- Contact-only plans are refused by checkout, signup, and plan-change endpoints with a 422.

## Stack

- Vite + React 19 + Tailwind CSS + shadcn + Hero Icons
- Cloudflare Workers + Hono
- Cloudflare D1 + Drizzle ORM
- Better Auth (email/password, Google OAuth, magic link via Resend)
- Safepay for payments (`@sfpy/atoms` card capture plus the server adapter)
- Resend for auth email, Brevo-first for billing email with Resend fallback

## Local setup

```bash
npm ci
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

Fill `.dev.vars` with Safepay sandbox keys, `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, `SUPERADMIN_EMAILS`, and the provider keys you need. See `.dev.vars.example`.

If dependencies look partially installed (missing `better-auth` types or `pdf-lib` files), rerun `npm ci`.

## Quality gates

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

`npm run build` prerenders 16 public routes plus `robots.txt` and `sitemap.xml`.

## Deployment

Production deploys through Cloudflare Workers Builds on every push to `main`. `npm run deploy:prod` is the manual fallback.

Apply the production migration before pushing code that reads new columns:

```bash
npm run db:migrate:prod
```

`VITE_*` values are build variables and only take effect on the next build. A `.env` file needs `\$` for a literal dollar sign; a Cloudflare build variable takes a plain `$`.

## Source of truth

- `AGENTS.md`: operating rules, brand, offer ladder, billing and tenancy constraints.
- `docs/growthsnipe-context.md`: current product, offer, voice, and system brief.
- `docs/api-contract.md`: API surface.
- `docs/decision-log.md`: decisions and verification history.
- `.opencode/agents/*.md`: specialist agent instructions.

Older pre-rebrand documents describe dormant features or historical work. When they conflict with `AGENTS.md` or `docs/growthsnipe-context.md`, the current files win.

## Non-goals

- No Safepay native subscriptions (`sub_`/`plan_`).
- No second wallet or local balance.
- No card-number (PAN/CVV) storage.
- No currency conversion. USD only for v1.
- No hard-coded plans or prices in UI.
- No GoHighLevel provider, OAuth, iframe, queryUrl, or wallet code.
