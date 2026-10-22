# Merge into `saas-billing-template` — COMPLETED

This merge is done (history preserved in git: overlay base → `Merge saas-billing-template into sidekick overlay` → integration commit).

What landed, and where it lives now in the unified app:

- `.opencode/agents/*` — merged (billing + Sidekick specialists side by side)
- `docs/agent-rules/*` — both rule sets kept
- Sidekick architecture/product docs — `docs/architecture.md`, `docs/product-spec.md`, `docs/mcp-contract.md`, `docs/provider-adapters.md`, `docs/scheduling.md`
- `src/server/providers/*` — `safepay.ts` (billing feature) beside `spectora/` + `isn/` (Sidekick)
- `src/server/sidekick/*`, `src/server/scheduler/*`, `src/server/mcp/*`
- `src/server/lib/crypto.ts` — billing AEAD kept, Sidekick JSON helpers appended
- `src/server/lib/env.ts` — merged Env (billing base + optional Sidekick fields)
- `src/server/types.ts` — base Env extended with optional Sidekick fields
- `db/migrations/0011_sidekick.sql` — Sidekick tables
- `package.json` — MCP SDK v2 deps added
- `worker/index.ts` — one Worker serving app API + `/mcp`, dual Cron (daily billing + hourly Sidekick)
- `wrangler.jsonc` — `/mcp` in `run_worker_first`, both crons registered

Do not re-split the app. Going forward, "billing" always means the billing feature of the Tradesmatic app.
