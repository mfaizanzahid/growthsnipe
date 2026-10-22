# Deployment checklist — production (Tradesmatic)

## 1. Cloudflare resources

```bash
npx wrangler login
npx wrangler d1 create saas-billing-portal-prod
```

Put the returned `database_id` into `wrangler.jsonc`
(`env.production.d1_databases[0].database_id`).

```bash
npm run db:migrate:prod
```

## 2. Production secrets (never reuse dev values)

```bash
npx auth@latest secret
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put TOKEN_ENCRYPTION_KEY
npx wrangler secret put SAFEPAY_PUBLIC_KEY
npx wrangler secret put SAFEPAY_SECRET_KEY
npx wrangler secret put SAFEPAY_WEBHOOK_SECRET
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put MCP_ENCRYPTION_KEY
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put OPENAI_API_KEY
```

Generate a FRESH `MCP_ENCRYPTION_KEY` per environment (provider credentials encrypted with the dev key cannot be decrypted in prod). Same rule applies to `TOKEN_ENCRYPTION_KEY` below.

Non-secret vars in `wrangler.jsonc` (`vars`): `SAFEPAY_ENV=live`,
`SAFEPAY_API_BASE=https://api.getsafepay.com`, `APP_BASE_URL=https://<your-domain>`,
`GOOGLE_CLIENT_ID`, `SUPERADMIN_EMAILS`, `SAFEPAY_DEFAULT_COUNTRY` (optional).

Generate a FRESH `TOKEN_ENCRYPTION_KEY` (32 random bytes, base64) — gateway
tokens encrypted with the dev key cannot be decrypted in prod.

## 3. External services

- **Resend**: verify `alerts.ostive.com` (SPF/DKIM), keep `RESEND_FROM_EMAIL` as a
  verified sender identity.
- **Google OAuth**: add `https://<your-domain>/api/auth/callback/google` to the
  OAuth client's authorized redirect URIs.
- **Safepay**: switch to live merchant keys; set the webhook endpoint to
  `https://<your-domain>/webhooks/safepay` in the Safepay dashboard and use the
  dashboard shared secret for `SAFEPAY_WEBHOOK_SECRET`.

## 4. Deploy + verify

**Production deploys happen automatically: every push to `main` is built and
deployed by Cloudflare Workers Builds** (see section 6). There is no deploy
step to remember — push, and the Worker and its assets go live a couple of
minutes later.

```bash
git push origin main   # <- this is the deploy
```

`npm run deploy:prod` is the **manual fallback** (build + `wrangler deploy`
from an authenticated machine) — use it only when the auto-deploy is broken
or you need to ship without pushing.

- **Schema changes are NOT part of the deploy.** Apply the migration first
  (section 1 / the `migrate-prod` workflow), then push. A push that ships
  code expecting a new column before the migration lands breaks every query
  against that table.
- `GET https://<your-domain>/health` → `{"ok":true,...,"environment":"live"}`
- Sign up → verify → onboard → test-card payment in live mode with a small
  amount first; refund it from `/superadmin` to prove the money loop.
- Confirm both Cron triggers show in the Cloudflare dashboard
  (Workers → Triggers → Crons: `0 3 * * *` billing renewals, `0 * * * *` Sidekick briefing tick).
- Confirm `/mcp` is served by the Worker (wrangler `run_worker_first`) and the public pricing page renders plans from `GET /api/plans`.
- Enable Cloudflare WAF rate-limiting rules for `/api/*` (no in-app rate
  limits on custom endpoints by design).

## 5. Rollback

- `npx wrangler rollback` (previous deployment) or redeploy a known-good build.
- D1 has no automatic rollback: export before risky migrations
  (`npx wrangler d1 export <db> --remote`).

## 6. GitHub auto-deploy (Workers Builds) — the production deploy path

**This is how production is deployed.** Cloudflare's Workers Builds git
integration watches the repo; a push to `main` builds and deploys
`fieldvisory-production` automatically. In the Cloudflare dashboard
(Worker → Settings → Build):

- **Build command:** `npm run build` (includes the marketing prerender step — 33 static route files + robots.txt + sitemap.xml are emitted into `dist/client` automatically)
- **Build environment** (Worker → Settings → Build → Build variables): the
  `VITE_*` values are inlined into the client bundle by Vite, so they must be
  set **in the build environment**, not in the Worker runtime:
  - `VITE_GA_MEASUREMENT_ID` (Google Analytics ID, e.g. `G-…`); when empty, no analytics loads.
  - `VITE_EMBED_APP_HTML` — third-party embed snippet for authenticated app pages (chat widget). Public by design.
  - `VITE_EMBED_MARKETING_HTML` — the same for public marketing pages; empty means "no snippet on that surface".
  - Editing a build variable only takes effect on the **next build** — push again (or run a manual build) to pick it up.
- **`$` is escaped differently in the two places.** A `.env` **file** is dotenv-expanded, so a `$` in a snippet must be written `\$` there (otherwise `window.$zoho` is expanded to `window.`). A **build variable is copied verbatim** — no expansion — so the same snippet must use a plain `$` there. Pasting the `.env` form into the dashboard leaves a stray backslash in the bundle and the snippet fails with a syntax error.
- **Deploy command:** `npx wrangler deploy --config wrangler.jsonc --env production`
  (plain `wrangler deploy` uses the Vite plugin's flattened config without
  environments — it would deploy DEV values to production)
- **Production branch:** your main branch. Secrets and non-secret vars come
  from the dashboard (production environment) + `wrangler.jsonc`, never the repo.

Caveats:

- **Secrets** must be entered in the dashboard (production environment) by hand —
  same list as section 2. They cannot come from the repo.
- **Migrations are NOT automatic.** On every schema change, run
  `npm run db:migrate:prod` from an authenticated machine, or the
  `migrate-prod` GitHub workflow (Actions → Migrate production D1 → Run
  workflow), **before** pushing the code that needs the new column.
- **The CI workflow is not the deploy.** `.github/workflows/ci.yml` runs
  typecheck + test + build on pull requests and on pushes to `main`; it
  deploys nothing. Deployment is the Workers Builds integration above.
- **Preview deployments share the production D1 binding** unless you override
  it — a PR preview can read/write prod data. Either disable previews or
  accept it for a small team.
- **Cron triggers run on production deploys only** — previews never fire them.
- Before the first push, verify no secrets are tracked:
  `git status` should show no `.dev.vars`, and `.gitignore` already excludes
  `.dev.vars`, `.env*` (except examples), `.wrangler/`, `dist/`, `node_modules/`.
