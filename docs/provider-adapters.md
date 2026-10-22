# Provider adapters

`BusinessProviderAdapter` is the canonical boundary. It owns provider authentication, vendor requests, field mapping, capabilities, and write implementations.

Canonical vocabulary is neutral (`order`, not `inspection`) — translate vendor terms at the boundary.

Spectora V1: read-oriented adapter. Current upstream MCP documentation exposes agents, clients, inspections, attachments, events, and agent statistics; do not assume undocumented write tools. Spectora calls orders "inspections" — the adapter maps them to canonical orders at the boundary. Full contract: `docs/spectora-contract.md` (agent: `@spectora-specialist`).

ISN V1: read-only adapter against the vendored spec (`docs/isn.yaml`, distilled in `docs/isn-contract.md`), which is order-native. Full contract: `docs/isn-contract.md` (agent: `@isn-specialist`).

## Pagination per live adapter (canonical MCP `limit` ceiling: 50,000)

`limit` is a request contract, not a uniform page size: each adapter grounds it to its vendor reality, and the shared schema ceiling (`MCP_MAX_LIMIT` in `src/server/mcp/tools.ts`) is high enough not to block a whole-collection request.

- **Spectora**: page-based, `page[size]` max 200 upstream (verified against the live agents reference 2026-10-05); the adapter clamps to 200 and returns one page plus a real `nextCursor`. Callers loop.
- **ISN**: no page/limit params anywhere in the spec, so `limit` is ignored — one call returns the whole matching collection and `count` is surfaced as `totalEstimate`. The only bound is the client-side memory backstop (`DEFAULT_ISN_SAFETY_LIMIT`, 50,000, env-overridable via `ISN_SAFETY_LIMIT`); if it ever binds, `totalEstimate` stays the pre-slice count so the shortfall is disclosed as truncation.
- **Pending platforms** (ServiceTitan, Housecall Pro, Jobber — on hold): each future adapter must verify and record its max page size here before its read path goes live. If a platform caps below 200, clamp in that adapter and record it here.

Coming soon (shell only, fail-closed): ServiceTitan (`src/server/providers/servicetitan/`), Housecall Pro (`src/server/providers/housecallpro/`), Jobber (`src/server/providers/jobber`). Each stub implements `BusinessProviderAdapter` with empty capabilities and throws `ProviderCapabilityError` ("coming soon") on every data method — no fields, tools, or params are invented. The registry resolves them, but `POST /api/sidekick/connections` rejects them with 422 until a live-probed read model replaces the stub. The connections UI lists them disabled with "Coming soon" badges.
