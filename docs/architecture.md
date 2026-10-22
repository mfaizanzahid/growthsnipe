# Architecture — Tradesmatic (home-service business SaaS app)

```text
PUBLIC SITE (unauthenticated, same SPA + Worker)
  /  landing   /features   /pricing (dynamic: GET /api/plans, never hard-coded)
  /login /signup → /onboarding (org → plan+coupon → card → pay)
        │ HTTPS (session cookie, orgId per tenant request)
        ▼
APP DASHBOARD (authenticated, org-scoped via top-left switcher)
  /dashboard Sidekick overview   /connections   /mcp-access
  /employees   /briefings-schedules   /business-profile
  /billing (feature: invoices+PDF, pay/retry, methods, plan change, cancel)
  /settings (org)   /profile
  /superadmin (clients, invoices, usage charges, refunds, plans, coupons, settings)
        │
        ▼
WORKER (Hono, one app)
  /auth/* (Better Auth)   /api/orgs   /api/plans (public, active only)
  /api/billing/* (feature)   /api/superadmin/*   /api/sidekick/* (planned)
  /mcp (Streamable HTTP, org-scoped bearer token, V1)
  Crons: daily billing renewals + hourly Sidekick briefing tick
        │ fetch (X-SFPY-MERCHANT-SECRET)          │ Resend
        ▼                                         ▼
     SAFEPAY (sandbox→live)                    EMAIL
  customers (cus_) / wallet (pm_) /            charges, invoices,
  unscheduled_cof charges / refunds /          briefings, auth
  HMAC-SHA512 webhooks
        │
        ▼
D1 (Drizzle, authoritative)
  Better Auth tables + organizations/members/invitations
  plans / org_subscriptions / safepay_customers /
  payment_methods / invoices / invoice_items /
  transactions / webhook_events / idempotency_keys
  sidekick_connections / sidekick_mcp_tokens / sidekick_policies /
  sidekick_schedules / sidekick_briefing_jobs / sidekick_audit_logs
```

**Deployment:** production ships through GitHub auto-deploy — Cloudflare
Workers Builds (git integration) builds and deploys `fieldvisory-production`
on every push to `main`; the CI workflow only runs checks. Schema changes are
applied separately and must land before the push. See `docs/deployment.md`.

## Sidekick MCP data flow

```text
Claude / ChatGPT / other MCP client
             │
             v
         /mcp Tradesmatic
             │
        tenant + auth (MCP principal → organizationId, never a tool argument)
             │
        canonical data tools
             │
      +------+------+
      |             |
   Spectora        ISN
   adapter         stub
      |
 vendor data

Canonical data → management playbooks → scheduler → briefing → Resend
```

The provider adapter is replaceable; the Sidekick intelligence layer is not provider-specific. The public MCP surface remains data-oriented so AI employees can compose those primitives into analytics and decisions.

## Billing feature flows (manual Safepay billing, no native subscriptions)

1. Signup: pick plan (dynamic list) + interval (monthly/annual) → Atoms card capture → ensure `cus_` → save `pm_` as default → charge setup fee + first period immediately (`unscheduled_cof`) → create `org_subscriptions` (cycle 1 done, `nextCharge` = first-billing date + 1 interval) → invoice + transaction + receipt email.
2. Renewal: daily Cron → due `org_subscriptions` → charge default `pm_` via `unscheduled_cof` → on success invoice paid + `nextCharge` advanced; on failure invoice failed, `nextCharge` stays past-due for retry + failure email.
3. Usage charge (superadmin): create invoice (amount + description) for org → immediately charge org default `pm_` → invoice paid/failed + transaction + email. Manual calculation; amount entered directly.
4. Pay invoice: client pays a due/failed invoice with default or a selected `pm_`.
5. Update payment method: Atoms save → wallet sync → set default `pm_`.
6. Cancel: subscription status `canceled`; Cron ignores it thereafter. No gateway subscription call.
7. Webhooks: verify `X-SFPY-SIGNATURE` first, dedupe on `evt_`, then reconcile payment outcome → invoice/transaction status + email.
