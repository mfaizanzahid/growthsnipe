---
description: Run the full billing quality gates — typecheck, tests, build, plus migration sanity.
---

Run the completion-rule gates from AGENTS.md, in order, and report each result:

1. `npm run typecheck` — must pass with no errors.
2. `npm test` — all suites must pass.
3. `npm run build` — client + worker bundles must build.
4. Confirm `db/migrations/` files are in numeric order and `db/schema.ts` matches the latest migration state (tables: users, organizations, plans, coupons, org_subscriptions, payment_methods, invoices + number, transactions, webhook_events, idempotency_keys, invoice_sequences, app_settings).
5. Confirm no secrets in tracked files (search for `sec_`, `SAFEPAY_SECRET`, `RESEND_API`, `BETTER_AUTH_SECRET` outside `.dev.vars`/examples).

If any gate fails, fix the cause and re-run from step 1. Do not claim completion until all five pass.

$ARGUMENTS
