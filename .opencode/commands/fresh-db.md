---
description: Reset local D1 to a fresh database and re-apply all migrations with seed verification.
---

Reset the local D1 database and re-apply every migration from scratch:

1. Delete `.wrangler/state/v3/d1` (fresh local database).
2. Run `npm run db:migrate:local` and confirm every migration in `db/migrations/` applies with status ✅.
3. Verify seeds with `npx wrangler d1 execute saas-billing-portal --local --command "SELECT id, name, monthly_minor, annual_minor, setup_fee_minor FROM plans; SELECT key, value FROM app_settings;"` — expect Launch + Growth plans and `portal_name` / `support_email` settings.
4. Report the migration list and seed rows. If any migration fails, stop and show the error — do not edit migrations that have already applied to a shared/remote database; create a new migration instead.

$ARGUMENTS
