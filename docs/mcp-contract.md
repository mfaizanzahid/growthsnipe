# MCP Contract

Canonical vocabulary (neutral across home-service trades):

- **order** — one job/visit. A home inspector calls it an inspection; other trades call it a job, appointment, or work order. There are no inspection-specific tools or types.
- **client** — the customer record.
- **agent** — an inspector, technician, or service provider (including vendor "connections").
- **event** — dated business activity (calendar events, equipment drop-offs/pickups).

Data tools:

`search_clients`, `get_client`, `search_orders`, `get_order`, `search_agents`, `get_agent`, `search_events`.

Provider adapters translate vendor objects into these canonical records (e.g. Spectora inspections → orders). Vendor endpoint names stay vendor-shaped inside adapters only (`list-inspections-v2`, `show-inspection-v2`) — they never leak into tool names, descriptions, or canonical types.

`OrderRecord` carries first-class analytics fields (buyer/inspector/agent names, paid, confirmed, referral source, timestamps) plus a `details` bag with the full normalized vendor attributes, so no provider detail is lost without per-provider contract churn.

**Money on `OrderRecord`:** `total` is **integer minor units (cents)** and `currency` is always set. Vendor APIs report major units — Spectora `quote` (`"450.0"`), ISN `totalfee` (`"987.53"`) — so adapters convert at the boundary via `src/server/providers/money.ts`. This matches every other money value in the app (invoices, plans, transactions) and makes `formatMoney` safe on order data. ISN exposes no currency field and is US-only, so its orders are labelled USD. Do not reintroduce major units: a dollar total passed to `formatMoney` reports 100x too small.

## Authentication and billing states

Every `/mcp` request is checked before a session starts, so a client is rejected at the HTTP layer rather than inside a tool result. `authenticateMcpRequest` (`src/server/mcp/auth.ts`) accepts an org-scoped `bs_mcp_…` token or an OAuth access token (`bsoa_…`), from the `Authorization: Bearer` header or the `?apiKey=` / `?access_token=` query parameter, and then applies the billing gate.

- **401 — authentication.** Missing, malformed, revoked or expired token, or an expired OAuth grant. Body: `{"error":"…"}`, with `WWW-Authenticate: Bearer resource_metadata="<origin>/.well-known/oauth-protected-resource", scope="sidekick"` so an OAuth client can discover the authorization server. Errors: `Missing MCP bearer token`, `Invalid or revoked MCP bearer token`, `Invalid, expired, or revoked access token`.
- **402 — billing state.** The workspace is not in an access state of `trial` or `active`: an overdue subscription (`past_due`), a trial that ended without subscribing (`trial_expired`), an expired or lapsed plan, a cancellation past the period end, or no subscription at all. Body: `{"error":"Subscription required — upgrade from billing to restore AI access"}`. Every gated state answers with the same wording, so the message points the user at Billing instead of guessing the cause. The dashboard, the billing page and the business profile stay reachable — only AI access is cut.
- **409 — no provider connection.** The workspace has no platform connection configured: `{"error":"No provider connection is configured for this workspace."}`.

Rejected requests (401 and 402) are logged as `mcp.auth_failed` in the application log (`worker/index.ts`): a 401 spike means a broken client, a 402 spike is a churn signal.

Gating state comes from `orgAccess` (`src/server/billing/access.ts`), the same resolver the dashboard and the Sidekick API use — a workspace that subscribed during its trial is in state `trial` until the trial ends, so its MCP access is never cut mid-trial. The sibling Sidekick API answers the same condition with 402 and `Subscription required — upgrade from billing to restore access`; the briefing Cron skips gated orgs silently instead of erroring.

## Pagination contract (accuracy over multi-page reads)

AI readers miscount when they stop after page one, so the loop discipline lives
in protocol surfaces the model always sees — never in prompts or instructions:

- Every `search_*` tool description carries the pagination contract: for any
  aggregate claim (count, sum, average, comparison, trend), start at limit 200
  with identical filters, loop while `hasMore` is true merging items, stop only
  at `pageComplete: COMPLETE`, then reconcile merged count vs `totalEstimate`.
- Every search response carries a flat additive envelope alongside
  `items`/`nextCursor`/`totalEstimate`: `hasMore`, `pageComplete`
  (`PARTIAL`/`COMPLETE`), and a `retrievalNote` with the exact resume
  instruction (tool + cursor) or the reconcile-and-disclose reminder.
- Exploratory peeks may stop early; aggregate claims may not. Shortfalls are
  disclosed, never filled in.
- Provider quirk: ISN ignores `limit` and never returns `nextCursor`; one call
  returns the whole window, and `totalEstimate` is the pre-slice record count.
  Cursor absence alone is NOT a completeness signal — when a first (cursorless)
  call is `PARTIAL` with no cursor, the window is incomplete and the caller must
  narrow the window/filters and re-query, never report a total. Truncation is
  judged only on that cursorless call: `totalEstimate` describes the whole set, so
  a resumed final page shorter than `totalEstimate` is the ordinary end of a
  completed walk and reports `COMPLETE`. Spectora returns real page cursors plus a
  true record total.

Management tools can be added as composed read-only capabilities, but should call the data layer rather than duplicate provider API logic.

Potential write tools: `create_client`, `update_client`, `delete_client`, `create_order`, `update_order`, `cancel_order`, `delete_order`, `reschedule_order`, `create_agent`, `update_agent`, `delete_agent`, `send_message`. Register only when the organization policy allows the action (`READ` registers none); at call time the adapter method must exist or the tool answers `{success: false, supported: false}` ("not currently supported") — capability is method presence, never a throwing stub. `SUGGEST` returns proposals without acting; `EXECUTE` performs provider-confirmed actions with audit logging (success and failure).

## Prompts (AI employees as invokable entries, not tools)

Rationale: several clients (notably Claude connectors) do not surface the server `instructions` field, so playbooks shipped as instructions never reach the model. Prompts are the MCP-native fallback: invokable by name, zero server-side inference, tools surface untouched.

- `ask-owner`, `ask-cfo`, `ask-operations`, `ask-revenue`, `ask-customer`, `ask-marketing`, `ask-quality` — one per employee playbook (`src/server/sidekick/employees/*.md`), optional `focus` arg. Expands to the playbook plus data-tool guidance.
- `morning-briefing`, `business-snapshot`, `find-anything-unusual` — owner workflows expanding to an explicit tool-call plan.
- Plan-tier roster: trials and unlimited (Pro) plans get all 7 advisors; capped (Starter) plans get `ask-owner`, `ask-cfo`, `ask-operations` only. The worker resolves the tier per MCP request (`orgAccess`) and the server registers only entitled prompts — Pro prompts are hidden from `prompts/list` and refused when called directly, and advisor instructions omit them too. Tiers live in `src/server/mcp/prompts.ts` (`STARTER_EMPLOYEE_PROMPTS` / `PRO_EMPLOYEE_PROMPTS`), covered by `test/sidekick-prompts.test.ts`.

Rules: prompts never perform reads/writes themselves; every number must still come from a data-tool call. Prompt text must name only registered tools (`src/server/mcp/prompts.ts` + `PROMPT_NAMES`, covered by `test/sidekick-prompts.test.ts`).

## Resources (operating knowledge on demand)

`sidekick://instructions/core` (mission, rules, KPI framework, briefing formats, activation), `sidekick://instructions/work` (response shape, read/write discipline), and `sidekick://employees/<owner|cfo|operations|revenue|customer|marketing|quality>` (one playbook each). Markdown sources live in `src/server/sidekick/instructions/` and `src/server/sidekick/employees/`; registration in `src/server/mcp/resources.ts` (`RESOURCE_URIS`, covered by `test/sidekick-resources.test.ts`).

Rules: resources are read-only knowledge — they never execute, infer, or substitute for data-tool calls. The server `instructions` point at them so clients that read instructions can discover them.

Personalization: the served `sidekick://instructions/core` appends the requesting org's `ACTIVE BUSINESS PROFILE` (name, trade, area, owner, team, services) when one exists — the MCP server is built per request, so the injection is request-scoped with no cross-org leakage. Profiles are collected in onboarding and edited on the business-profile page.

Visibility: only `sidekick://instructions/core` is served by default; the rest stay registered-but-hidden (`enabled: false` in `src/server/mcp/resources.ts`). Re-enable via code or at runtime with `MCP_ENABLE_RESOURCES` (comma-separated names/URIs, or `*`).
