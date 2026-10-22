# Tradesmatic

One unified SaaS app for small home-service businesses (V1 market test: home inspectors): **a decision-making platform** connecting their business software to the AI they already use. Owners run their business from a single dashboard — Sidekick overview, provider connections, AI access, AI employees, briefing schedules, business profile — with **billing & payments as one feature area**, plus public marketing pages and a dynamic pricing page.

## Positioning

**Tradesmatic is a decision-making platform, not an MCP server.** It connects a
business's existing booking/CRM software (launch: Spectora and ISN for home
inspectors; roadmap: ServiceTitan, Housecall Pro, Jobber) to the AI the owner
already uses (Claude, ChatGPT) in real time, through our proprietary
Multi-Trades™ MCP Server — surfacing as seven specialist AI advisors, scheduled
email briefings, and permissioned actions. Outcome first, technology second.

- ICP: owner-operated home-service businesses — solo/small teams with no ops,
  finance, or BI staff, already experimenting with AI manually.
- Trust: **no business data is stored on our servers** — live pass-through
  from the business's own software.
- Voice: plainspoken, evidence-based, specific. No hype, no revenue
  guarantees, no implied vendor/association endorsements.
- Full product brief: `docs/product-spec.md`. Customer copy is owned by
  `.opencode/agents/content-strategist.md`.

## What it does

### For business owners (dashboard)

- **Sidekick overview**: morning briefing, business snapshot, "find anything unusual".
- **Connections**: connect Spectora (read-only baseline) / ISN (stub) with encrypted credentials.
- **AI access**: create/revoke organization-scoped MCP tokens (`bs_mcp_…`) and connect Claude to `https://YOUR_DOMAIN/mcp`.
- **AI employees & schedules**: enable management playbooks, run timezone-aware briefing schedules (daily/weekly/monthly), delivered via Resend.
- **Billing & payments** (one feature, not the product): pick a plan, pay setup + first period via Safepay, manage invoices (PDF), payment methods, plan changes, cancellation.
- **Org settings & profile**: members, invitations, roles, personal profile.

### Public site (unauthenticated)

- Landing (`/`), features (`/features`), and **pricing (`/pricing`) that renders plans dynamically from `GET /api/plans`** — plan names, prices, and setup fees are never hard-coded in UI copy. Signup and onboarding read the same endpoint.

### Remote MCP (the single AI connection)

- One customer-facing endpoint: `/mcp` (Streamable HTTP, MCP SDK v2), V1 bearer-token auth for the market test.
- Domain/data tools only: `search_clients`, `get_client`, `search_orders`, `get_order`, `search_agents`, `get_agent`, `search_events` (`order` is the neutral word for a job/visit across trades). Management intelligence composes above them — no analytics-shaped tools.

## Stack

- Vite + React 19 + Tailwind CSS + shadcn + Hero Icons
- Cloudflare Workers + Hono (one Worker: app API + `/mcp` + dual Cron)
- Cloudflare D1 + Drizzle ORM
- Better Auth (email+password, Google OAuth, magic link via Resend)
- Safepay sandbox first, USD first (`@sfpy/atoms` + server `fetch` adapter) — billing feature only
- Resend for auth email; Brevo-first for billing email (Resend fallback) + verified-signup contacts list
- MCP SDK v2 (`@modelcontextprotocol/server`, `@modelcontextprotocol/client`, `@modelcontextprotocol/hono`)

## Safepay references (authoritative, billing feature)

- `docs/safepay-api-contract.md` — verified HTTP contracts
- `docs/safepay-atoms.md` — card capture / payer-auth UI guide
- `src/server/providers/safepay.ts` — generic adapter
- `src/server/lib/billing-dates.ts` — billing-date math

## Local setup

```bash
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

Fill `.dev.vars` with Safepay sandbox keys, `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, `SUPERADMIN_EMAILS` (see `.dev.vars.example`), plus `MCP_ENCRYPTION_KEY` for Sidekick connections.

## Brand assets

Drop files into `public/` (served at the site root, already wired — no code changes needed):

- `logo.svg` — app header + dashboard sidebar (auto-hides until present, portal name always shown)
- `favicon.svg` — tab icon (modern browsers, linked in `index.html`)
- `favicon.ico` — tab icon fallback
- `apple-touch-icon.png` — iOS home-screen icon (180×180 PNG)

## Quality gates

```bash
npm run typecheck
npm run test
npm run lint
npm run build
```

## Cloudflare deployment

```bash
npx wrangler login
npm run db:migrate:remote
npm run deploy
```

Create production secrets with Wrangler/Cloudflare rather than committing them. See `docs/deployment.md`.

## OpenCode

This repository includes:

- `AGENTS.md`
- `.opencode/agents/*.md`
- `opencode.jsonc`
- `docs/agent-rules/*.md`

Recommended sequence:

1. `@implementation-planner`
2. `@portal-frontend` (dashboard shell, marketing pages, dynamic pricing)
3. `@billing-specialist` (billing feature) + `@safepay-specialist` (gateway)
4. `@mcp-engineer` / `@provider-engineer` / `@scheduler-engineer` / `@sidekick-intelligence`
5. `@cloudflare-specialist`
6. `@test-engineer`
7. `@security-reviewer`

The orchestrator can be asked to coordinate these agents.

## Non-goals

Do not implement:

- Safepay native subscriptions (`sub_`/`plan_`)
- a second wallet or local balance
- card-number (PAN/CVV) storage
- silent currency conversion (USD only for v1)
- hard-coded plans/prices in UI (plans render from `GET /api/plans`)
- provider-shaped or analytics-shaped MCP tools (e.g. no `get_revenue_leaks`)
