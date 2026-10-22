# Dashboard navigation

Public marketing site (unauthenticated):

- `/` marketing landing
- `/features`, `/how-it-works`, `/integrations`, `/who-we-help`, `/case-studies`, `/blog`
- `/pricing` renders active plans dynamically from `GET /api/plans` (never hard-coded)
- `/privacy`, `/terms`, `/contact`
- `/login`, `/signup`, `/magic`, `/forgot-password`, `/reset-password`, `/verify-email`
- `/onboarding` starts the SNIPE Intelligence trial, then profile and connections

App dashboard (authenticated, org-scoped via top-left org switcher):

- `/dashboard` SNIPE Intelligence scorecard
- `/connections` provider connections (Spectora / ISN)
- `/business-profile` business profile and preferences
- `/billing` billing and payments (invoices, pay/retry, methods, plan change, cancel)
- `/settings` organization settings (members, invitations, roles)
- `/profile` personal profile
- `/audit` write/action audit log

Superadmin area:

- `/superadmin` all-tenant overview
- `/superadmin/clients`, `/superadmin/clients/:orgId` tenant detail
- `/superadmin/invoices` all invoices
- `/superadmin/plans` plans CRUD (max 4 active self-serve)
- `/superadmin/coupons` coupons CRUD + attach
- `/superadmin/settings` portal name, support email
