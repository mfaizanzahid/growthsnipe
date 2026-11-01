# Dashboard navigation

Public marketing site (unauthenticated):

- `/` marketing home, plus offers (`/blueprint`, `/diagnostic`, `/loop-library`, `/engine`), industry pages, capability pages, `/how-it-works`, `/snipe-system`, `/case-studies`, `/resources`, `/about`, `/faq`, `/book`, `/checkout/*`, `/thank-you/*`, `/results-disclaimer`, `/blog`
- Offer prices render only from `src/lib/offers.ts` (never hard-coded); SaaS plans render from `GET /api/plans`
- `/privacy`, `/terms`, `/contact`
- `/login` (magic-link + Google, invite-only), `/magic`; `/signup`, `/forgot-password`, `/reset-password`, `/verify-email` redirect away (no public signup)
- `/onboarding` workspace setup for invited users (trial flow as provisioned)

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
