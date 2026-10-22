# Dashboard navigation (target map)

Public marketing site (unauthenticated):

- `/` — marketing landing
- `/features` — feature tour
- `/pricing` — pricing page, renders ACTIVE plans dynamically from `GET /api/plans` (never hard-coded)
- `/login`, `/signup`, `/magic`, `/forgot-password`, `/reset-password`, `/verify-email`
- `/onboarding` — trial: org → profile → Pro trial → connect; paid: org → profile → plan+coupon → card → pay → connect (plan step reads `GET /api/plans`)

App dashboard (authenticated, org-scoped via top-left org switcher):

- `/dashboard` — Tradesmatic overview (onboarding checklist until complete, briefing, snapshot, unusual)
- `/connections` — provider connections (Spectora / ISN)
- `/mcp-access` — Claude connection / MCP token management
- `/employees` — enable/disable AI employees (nav label)
- `/briefings-schedules` — briefings & schedules
- `/business-profile` — business profile / preferences
- `/billing` — billing & payments feature (invoices+PDF, pay/retry, methods, plan change, cancel)
- `/settings` — organization settings (members, invitations, roles)
- `/profile` — personal profile
- `/audit` — write/action audit log (may live under settings or Sidekick section)

Superadmin area:

- `/superadmin` — all-tenant overview
- `/superadmin/clients`, `/superadmin/clients/:orgId` — tenant detail
- `/superadmin/invoices` — all invoices
- `/superadmin/plans` — plans CRUD (max 4 active)
- `/superadmin/coupons` — coupons CRUD + attach
- `/superadmin/settings` — portal name, support email
