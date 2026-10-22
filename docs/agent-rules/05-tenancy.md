# Multi-tenancy & roles

- Users can belong to multiple organizations and create multiple orgs. The active org is selected via the top-left dropdown and sent as `orgId` on every tenant-scoped API call.
- Per-org roles: `admin`, `user`, `viewer`.
  - `admin`: manage org, members, billing, payment methods, subscriptions, invoices. Billing & payments (`/api/billing/*`, billing page) is admin-only.
  - `user`: no billing access (reads and writes both return 403).
  - `viewer`: no billing access (reads and writes both return 403).
- Global `superadmin`: seeded via `SUPERADMIN_EMAILS` env into `users.isSuperadmin`. Superadmin has full read access to all tenants, manages plans, and creates one-time/usage invoices charged immediately (`charge now`). Superadmin may also operate any tenant's billing (retry/pay invoices, manage methods, change/cancel subscriptions) for support — every such write is audited with `createdBy`/actor identity.
- Every tenant-scoped query MUST filter by `orgId` and enforce the caller's membership + role. Superadmin bypasses membership for read and for usage-charge creation, but all writes are still audited with `createdBy`.
- No cross-org data leakage: invoices, subscriptions, payment methods, customers, and transactions are all keyed by `orgId`.
