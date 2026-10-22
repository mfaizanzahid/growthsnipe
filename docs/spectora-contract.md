# Spectora contract (authoritative local reference)

Sources: `https://developer.spectora.com/mcp-server` and `https://developer.spectora.com/api/*` (re-read 2026-09-14: `/api`, `/api/agents`, `/api/inspections`, `/api/events`). Never invent Spectora fields, tools, or params — check these docs first.

## Connection (direct REST — no MCP transport since 2026-09-14)

- REST base: `https://connect.spectora.com` + `/v2/...` paths (same host that served the old MCP endpoint; the `/mcp` suffix is transport-only, never a REST path).
- Auth: API key via `Authorization: Bearer <key>` header. Our adapter uses the API-key path (server-to-server, no browser). Credentials stored encrypted; only the key/token are kept. Stored OAuth tokens / legacy `mcpEndpoint` values keep working (a trailing `/mcp` is stripped for REST).
- The old MCP transport (`StreamableHTTPClientTransport` + `list-*-v2`/`show-*-v2` tools) is removed. Reason: the REST API is the documented stable surface with the same JSON:API payloads; the MCP gateway added envelope failure modes with no benefit server-to-server.

## REST endpoints (all read-only in our adapter) → canonical mapping

| REST | Canonical |
|---|---|
| `GET /v2/contacts` | clients |
| `GET /v2/contacts/{id}` | client |
| `GET /v2/inspections` | **orders** (Spectora calls orders "inspections") |
| `GET /v2/inspections/{id}` | order |
| `GET /v2/connections` | agents (Spectora calls agents "connections") |
| `GET /v2/connections/{id}` | agent |
| `GET /v2/events` | events |
| `GET /v2/agent-stats` | agent stats (not yet mapped — no verified need) |
| attachments endpoint | not mapped (no canonical concept yet) |

## List-call shape (verified live 2026-09-10 via MCP mirror, REST docs 2026-09-14)

Flat query string (implementation: `src/server/providers/spectora/params.ts`).

- `page[number]` (1-based, from canonical cursor), `page[size]` (default 200, max 200 upstream).
- inspections: `filter[fulltext]`, `filter[datetime_greater_than/less_than]` (ISO 8601), `filter[canceled]` (verified mapping for cancelled only).
- contacts/connections: `filter[fulltext]`.
- events: `filter[start_datetime_between][]=a&filter[start_datetime_between][]=b` (repeated-`[]` array syntax per the events reference; date-only, company timezone, inclusive), `filter[event_type]` (`radon_drop`/`radon_pickup` only).
- Unmapped inputs are dropped, never guessed (generic order status, client status, other event types). See decision log.

## Cancellations are NOT in the default listing (live-verified 2026-10-17)

`GET /v2/inspections` **excludes cancelled inspections**. A windowed query
returned 103 records, none of which carried `canceled_at`; the same window with
`filter[canceled]=true` returned 10 additional ones. Unfiltered: 6054 default vs
402 cancelled.

So `filter[canceled]=true` is a **disjoint population**, not a filter over the
default listing. Count cancellations with a separate query and **add** them to the
window total; never reconcile the count against the records you already fetched
(that understates the total and can collapse a real cancellation rate to "0,
unavailable"). See `src/server/briefing/providers/strategies.ts` (`cancelledDisjoint`)
and `briefing/analyze.ts`.

Cancelled records still carry `canceled_at`, `cancel_reason`, `quote` and the
usual order attributes, so cancel-reason analysis is possible from the filtered
query — it is just not reachable via the default listing.

## Single-record shape

`GET /v2/<resource>/{id}` (id or slug for inspections). No wrapper objects.

## Response handling (verified)

- Direct JSON:API responses — no envelope to unwrap.
- Lists return `{data[], meta.pagination{current,next,last,records}, links}`. Next cursor = `meta.pagination.next` when it advances past `current`.
- Records are `{id, type, attributes{snake_case}, relationships}` — see `fromJsonApi` + `deriveOrder`/`deriveContact`/`deriveAgent`/`deriveEvent` in `mapper.ts` for the verified derivations (status from `canceled_at`/`is_client_complete`, total from `quote`, USD default, address, relationship ids).
- HTTP errors map to `SpectoraApiError`: 401 credentials, 403 forbidden, 404 not found, 422 parameters, 429 rate limited; bodies truncated, key-free.

## Do not assume

- Our adapter stays read-only (REST has POST/PUT surfaces we deliberately do not call — no live probe, no write enablement).
- The `[]` array serialization is doc-verified but NOT yet live-probed over REST — first live call should confirm it before claiming production-grade.
- ~~Real-data pagination is unverified until a live probe with the owner's key succeeds.~~ **Superseded 2026-10-17**: list endpoints, page-based pagination (`meta.pagination.records`), the `filter[canceled]` semantics and `canceled_at` mapping WERE live-probed against a real workspace (org Jalop). `include`/`sort` passthrough is still unsent, and `/v2/agent-stats` is still unprobed.
