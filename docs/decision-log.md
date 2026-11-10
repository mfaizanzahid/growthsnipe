# Decision log SaaS Billing Portal (fresh project, GHL removed)

## 2026-11-10 - SNIPE Framework scoring, 30-day plan, and linked contents

The Diagnostic now assesses the five SNIPE pillars: S Size the Gap, N Net-Ticket Architecture, I Instant Capture, P Pipeline Engine, E Expand and Evaluate. Scores are deterministic backend rules (documented in the report appendix), not model output; the model explains what the score and evidence mean. Instant Capture is deliberately **Not Assessed** in Release 1 because no phone, lead, or CRM data is connected, and the prompt forbids response-time or missed-lead claims. The 90-day plan was replaced by a 30-day plan with Days 1-7, Days 8-21, Days 22-30, and every action now states what, when, and how plus an owner and success metric. The PDF added a Contents page with clickable internal links, a SNIPE Framework section with key constraints and strengths, and a pillar scoring appendix. The AI system prompt only gained four short rules so the model explains backend scores and follows the response template; the JSON schema carries the new fields.

## 2026-11-10 - Diagnostic reviews the last 12 full months; job penetration replaces service revenue

Owner direction. The window now ends at the first day of the current month (exclusive) and starts 12 months earlier, so a run in mid-November reviews November 1 through October 31 and October is always the last full month. Service enrichment is no longer capped: every ISN order is enriched from its fee detail (the same fees-first, noise-excluded logic the dashboard uses), and Spectora keeps the listing's serviceNames + serviceAddOnNames. Because Workers cap subrequests per invocation, enrichment runs in `DiagnosticWorkflow` batches of 40 orders per step against a `services_enriched` flag (migration 0046); the listing is fetched once and each batch claims only unenriched rows. The report now shows **job penetration** (share of reviewed jobs that included each service) and deliberately omits per-service revenue because Spectora has no fee-level backup; per-service revenue stays out until both providers can supply it. Customer-facing prose no longer prints internal metric refs, the revenue chart carries value labels, quick wins are required (schema min 1, prompt asks for 3 to 5), the section kicker/heading spacing was fixed, and SNIPE Diagnostic™ / SNIPE Blueprint™ are branded in the PDF and one-time emails.

## 2026-11-09 - SNIPE Diagnostic runs as a guest, on-demand PDF

The one-time Diagnostic is guest-scoped like `one_time_orders`: runs live in `diagnostic_runs` / `diagnostic_credentials` / `diagnostic_orders` (temporary) / `diagnostic_events`, never in org tables, and reuse `createProviderAdapter` directly. Spectora and ISN are pulled over a 12-month window; Spectora cancellations stay a separate disjoint population and ISN service detail is enriched from bounded per-order reads. Deterministic facts and the leak catalog (including exposure ranges and their assumptions) are computed in code; the model only selects, ranks, and writes narrative for catalog leak ids, and its output is validated against the facts. No intake form and no automated response-time test in v1 (API data only). Per owner direction the report has no "what we could not see" section and no data-gap labels; it never fabricates internally. The PDF is rendered on demand from `facts_json` + `narrative_json` and streamed from a signed report link (no R2, no PDF storage). Both Diagnostic emails use the shared `sendEmail` path (Brevo first, Resend fallback) and are link-only. Requires `DIAGNOSTIC_TOKEN_SECRET` and the `DIAGNOSTIC_WORKFLOW` binding (declared at top level and under `env.production`, same inheritance rule as `sync-workflow`).

## 2026-10-26 - Production bring-up on new account (owner decision)

New Cloudflare account (ccmohamedali, verified by switch after declining the old saas/fieldvisory account). Created fresh `growthsnipe-db-prod` (223a2e76) — the config pointed at `fieldvisory-db-prod`, fixed before anything touched it. Migrated 0000-0039, set 11 secrets from dev bring-up values (skipped keys already in prod vars so GrowthSnipe branding wins; MCP_BASE_URL pointed at growthsnipe.com; no workflow flag set, so prod runs cron-inline default). Fixed a real config bug the deploy surfaced: `workflows` is not inherited by environments, so the binding is now declared under `env.production` too. Deployed `growthsnipe-production` (v40faeae6): health OK, plans live from prod D1, all 3 crons + sync-workflow attached.

## 2026-10-26 - Workflow mode enabled in prod + observability

Set `ANALYTICS_SYNC_VIA_WORKFLOW=1` as a prod secret (seeding/enrichment bursts now run on the workflow fan-out, cron owns steady-state heads only). Added the requested `observability` block (logs + traces persisted at full sampling, issue detection) at top level AND under `env.production`, same inheritance lesson as `workflows`. First secret write raced a broken stdin pipe and stored an empty value; caught by re-checking and rewrote with an exact byte file. Redeployed (v6617b12a), health OK.

## 2026-10-26 - Workflow flag moved from secret to prod var
`ANALYTICS_SYNC_VIA_WORKFLOW=1` now lives in `env.production.vars` in `wrangler.jsonc`; the same-named secret was deleted (it would have shadowed the var). Redeployed (v11a36b64) with the flag visible as an Environment Variable, all triggers + workflow attached, health OK.

## 2026-10-31 - Status coverage counters replace the per-poll scan (free-plan CPU fix)

Prod `GET /api/analytics/status` 503d with `exceededCpu` at exactly 10ms CPU (free-plan limit): while `live`, every 15s dashboard poll ran a `COUNT(DISTINCT ...)` scan over ~31k orders plus the services join. Migration 0040 adds `orders_total` / `orders_with_services` to `org_sync_state` (backfilled server-side in D1, no Worker CPU) and the writers maintain them: `orders_total` mirrors `total_fetched` on the existing state writes (includes cancelled rows, unlike the old scan — banner denominator marginally larger by design), `orders_with_services` bumps atomically from the seed upsert (newly-served listings) and the enrichment writer (existence-probed, retry-idempotent). Status is now one indexed row read plus a clamp; the scan and its retry loop are gone. The dashboard poller already treats failures as skipped beats, so no client change. Stays on the free plan per owner decision; overview was audited (12 concurrent aggregates + up to 60k-row trend hydration is the next CPU risk) and left untouched — fix only if traces show it 503ing.

Shipped 2026-11-02 after the D1 read reset: `db:migrate:prod` applied 0040 (backfill verified live: 24,378 orders, 24,378 covered — the drain had finished during the outage) plus 0041-0043 (fresh_invites, one_time_orders, loop_library — landed from elsewhere, not this change), then `deploy:prod` v477cc25c, health OK. Note: the read outage itself proved the diagnosis — the per-poll scan was the budget killer.

## 2026-11-02 - Backlog probe answered from counters; orders_total goes delta-maintained

The status fix wasn't enough: `hasEnrichmentBacklog` still ran the same anti-join probe every minutely tick and supervisor pass (135 execs, 13.24M rows, 97.6% of runtime — the second D1 budget trip). It now reads the 0040 counters (`covered < total`, one indexed row). That forced a semantic repair: `orders_total` had mirrored `total_fetched` (includes cancelled rows, which never get services, so the boolean would stick true forever). Checkpoints/final writes no longer touch the column; `upsertOrders` maintains it with atomic deltas (new non-cancelled +1, transitions into/out of cancelled −1/+1, unchanged rows skip before counting so re-processing never double-counts). Migration 0044 recomputes the base server-side because the mirroring interlude had clobbered prod's total to 53,902 (true non-cancelled: 24,378). Manual SQL purges still bypass the writers — a reseed resets both, same as `total_fetched`.

Deployed the code as v0036be43 BEFORE 0044 could be applied (second read-budget trip blocks the migration until the next 00:00 UTC): the probe is already 1-row so nothing new can burn, but prod's `orders_total` is still the clobbered 53,902 until 0044 recomputes it — the backlog boolean reads stuck-true meanwhile, so ticks/parents will resume full claim scans at reset. 0044 must land within ~15 minutes of reset or the re-tripped burn beats it (each tick can scan ~200-300k rows against a fresh 5M budget). At reset: `npm run db:migrate:prod` only — no deploy needed.

Resolved 2026-11-03: 0044 applied at 07:26 UTC (budget survived the night — the stuck-true window never got to burn). Counters now read total 24,380 / covered 24,382: covered exceeds total by 2, which is the documented structural drift (orders cancelled AFTER enrichment keep their service rows, so they stay covered but leave the total). Backlog boolean is false, banner clamps to full, ticks are hourly-gated and no parents/claims run. Deliberately left as-is: the clamp and boolean both handle it, and "fixing" it would need a scan.
## 2026-10-26 - Parent pace must exceed leaf latency or waves re-claim in-flight rows (owner decision)

Live stall at 8,338 with a healthy-cycling parent and zero-fail leaves: claim cycles (~25-45s) ran faster than leaf latency (~60-120s), so every wave re-claimed uncommitted in-flight rows — ~80% of vendor reads duplicated, coverage crept at ~50/min. Fixed by raising default parent pace 15s to 60s (cycle period now covers worst-case leaf latency) and restarting the wasteful parent (terminate is data-safe: idempotent writes, claims recompute). Verified live: +3,723 then +3,600 per 4-6 min window (~900/min, 12-18x). Structural note: in-flight rows are fundamentally invisible to claims (uncommitted), so pacing — not smarter claiming — is the correct control; a gather would cost steps and add a second failure mode. Full gate green (686).

## 2026-10-26 - Fees-only enrichment with noise exclusion (owner decision)

Owner directed the basket mix to source exclusively from fee lines. Enrichment now writes `extractFeeItems` results (fee-name noise excluded: fee/refund/discount, case-insensitive, shared JS predicate + SQL patterns); unfetchable-fee details fall back to service names so fee-less orders stay visible instead of marking unknown. Fees-only orders with zero chargeable lines still resolve to the marker row; failed reads retry. Unchanged by design: listing path (Spectora unaffected), claim/coverage existence (row-presence), penetration (client-side off basket), change-detection fingerprints. Full gate green (686).

## 2026-10-26 - Monotonic sync-state merge; chain starts enrichment (owner decision)

Live seed parked at 24.2k behind already-completed links: concurrent runs' last-writer-wins state writes regressed the cursor (and could shrink totals or flip live back). Checkpoints and the final write now re-read and merge monotonically (min cursor, max fetched, live-guard for stale runs), pinned by unit tests. The finishing link also creates the enrichment parent directly instead of waiting for the next supervisor tick (supervisor stays the backstop). Process note: the workflow shell shipped with references that failed typecheck (vite serves without typechecking, vitest doesn't typecheck) — the finish path threw at runtime, which is exactly why this seed went live with no parent. Gates now run tsc + lint + tests + build every time.

## 2026-10-26 - Fee amounts attached by name match; units confirmed live (owner decision)

Owner saw mostly-null `amount_minor` despite `fees[].amount` existing. Root cause: fees were a fallback used only when `services[]` is empty, so the majority path (services-named rows) never saw amounts. Fix: `fees[]` is now always parsed into an amount lookup, attached by exact cleaned-name match — no new rows, no double count, unmatched/ambiguous/non-numeric/negative stay null, explicit zero stays zero (then filtered at write per the existing rule). Units uncertainty from the earlier entry is now resolved by live data, not just fixtures: Re-Inspection $99.00, CC fees $1.94–$5.89, Trip $99.00 — minor-unit readings ($0.99 re-inspections) would be absurd, so major-unit dollars stands. Honest scope: only fee-type lines carry amounts in practice; base service rows (`services[]` objects have no amount field) stay null — no verified source exists, and none is invented. Mix composition unchanged (rows existed already; only amounts filled in). Full gate green (682).

## 2026-10-26 - Workflow burst layer behind flag, cron owns steady state (owner decision)

Owner-approved reimplementation scoped to seeding/enrichment bursts on the free plan (prod is Workers Free). Verified limits driving the design: 3,000 workflow steps/day, 100 concurrent instances, 1,024 steps per workflow, 50 external subrequests per invocation, and the binding constraint — 100,000 D1 writes/day (hard-fail), which no orchestration can outrun for a one-day 25k seed. Corrected sizing from the proposal (20/instance would burn ~2,650 steps for identical work): 45-order leaves, ≤50 fan-out waves, ~1,200 steps per 25k seed (40% of budget), multi-day sleep-to-midnight pacing for the D1 wall. Architecture: `ANALYTICS_SYNC_VIA_WORKFLOW` flag (default off, cron-inline stays the path); listing-link chain (serial, self-perpetuating, deterministic ids) + enrich parent (paced fan-out, per-run nonce, cycle-scoped leaf ids) + leaves (fetch/write steps, quota sleep-and-retry); minutely supervisor ensures links/parents and runs inline hourly heads (workflows never do steady state); refresh is a pure trigger (+conditional head) with 409 on contention; connect seeds link-0; heartbeats + zombie reap retained; no schema migration (settings/logs only). Prior implementation recovered from reflog as reference and re-derived at the new sizing. Full gate green (680: 32 new workflow tests).

## 2026-10-26 - Phase 1: change detection, index/table drops, fee amounts (owner decision)

Owner-approved write-reduction package. (1) Change detection in `upsertOrders`: bulk-read stored fingerprints (90-sliced, reads are 50x cheaper than writes) and skip identical rows entirely — steady-state heads go from ~21k writes/run to reads-plus-deltas; `syncedAt` staleness on skipped rows is unobservable (write-only). Basket signature included so listing-service edits still rewrite. (2) Migration `0039`: drops `org_orders_org_status_idx`, `org_orders_org_scheduled_idx`, `org_order_inspectors_org_order_idx`, and the write-only `org_agents` table (+ its insert roll-up); every consuming query keeps a covering composite. (3) Fee amounts: `fees[].amount` mapped to minor units (major-unit basis: $389→38900 per live-probed magnitudes + `total_fee` convention; ISN spec punts on units, recorded here), unknown/negative → null (kept), explicit zero dropped; all-zero successes write a `__no_charge__` marker (counts for coverage/claim, excluded from basket/penetration); failed reads never mark. Basket revenue still comes from order totals; amounts are stored for future per-service revenue, surfaced nowhere yet. Full gate green (648).

## 2026-10-26 - Batch back to 1000 for fetch and write paths (owner decision)

Owner kept 1000 for both paths instead of 2000-fetch with chunked writes: one constant, fetch and write batches move together per run (~4.5k statements), no chunked-commit machinery. Concurrency stays 24/32. Full gate green (643).

## 2026-10-26 - Back to skip-only, batch 2000, concurrency 24/32 (owner decision)

Owner chose full revert of the floor protocol plus bigger/faster runs. Removed: floor helpers, pre-claim, tail/head floor filters, floor publish/claim plumbing, summary field, and the three partition tests (worker/refresh keep claim/skip/release with start-compare). Batch 1000 to 2000, concurrency default 16 to 24 (max 32). Live-verified: one tick delivered a full 2000 batch (+2000 coverage, zero failures). Caveat found live: the ~11k-statement writeBatch wedges Miniflare (cascading internal errors on unrelated queries) and stretches runs to ~10 min wall locally — the write path, not the vendor, is now the bottleneck; chunked commits would be the fix, left for a follow-up. Prod needs paid subrequest headroom (2000 external calls/run). Full gate green (643).

## 2026-10-26 - Manual Sync stands down on held lease with 409 (owner decision)

Owner asked that Sync clicks skip (with a visible error) when a cron run overlaps. The refresh route now claims the run lease first and answers 409 ("A scheduled sync is already running for this workspace. Wait a minute and try again.") when another tick holds it; explicit clicks toast the message via the existing error path while silent auto-driver calls stay quiet. Symmetry the other way too: the click holds the lease during its run and publishes its claim floor, so overlapping ticks partition under it instead of redoubling the batch. Full gate green (645).

## 2026-10-26 - Batch 1000 with partitioned overlap via lease floors (owner decision)

Owner asked for batch 1000 and for overlapping runs to cover the next batch instead of skipping. Shipped: default per-run 500 to 1000; lease values carry an optional claim floor (`startedMs|floorTs`) with parse/format helpers; the run publishes its floor early (pre-claim before the slow head fetch, republished at the final claim) via `onEnrichClaim`; an overlapping tick claims bare rows strictly older than the holder's floor while its own fresh-window rows stay unfiltered; release compares the holder's start prefix so a finisher never clears a successor's lease. Tie-skew at the floor is temporary (next unpartitioned claim covers it). One live subtlety found by trace: the floor must publish before the head fetch, otherwise late-tick overlaps only ever see floor-less leases and skip. Live-proven with temp traces (since removed): a partitioned run delivered a full disjoint 1000 batch, zero failures, coverage 16k to 18k across the overlap window. Caveats stated: ~2x D1 write rate per run and 1000 external subrequests per run (verified doc reading allows 10k on paid; confirm prod plan), CPU 30s per sub-hour trigger stays the binding compute budget. Full gate green (645).

## 2026-10-26 - Enrichment concurrency 16; next-batch overlap declined (owner decision)

Owner asked two things. (1) Next-batch-on-overlap instead of skip: declined with reasoning — partitioning concurrent claims needs claim markers (2x D1 writes plus stale-claim reaping) or OFFSET paging (incorrect under concurrent writes); the lease stays the mechanism. It is also less needed now: (2) concurrency default raised 8 to 16 (cap stays 16; sandbox tolerated far higher with zero failures), so a 500-order run fits inside the 60s tick and overlap goes rare with the lease as backstop. Live-verified: ticks deliver full 500-order runs back-to-back. Also broadened the status coverage retry from lock-errors-only to any transient error after a Miniflare internal error beat the lock-only matcher and 500'd a poll. Full gate green (642).

## 2026-10-26 - Claim-and-clear run lease (owner decision)

Owner rejected the start-timestamp approximation and asked for a real in-progress check. Stated constraint: stateless isolates cannot observe each other, so exact exclusion needs a Durable Object (declined as heavy); the lease is now claim-at-start plus release-at-finish, so a fresh lease means a run started and hasn't reported back. Crash backstop unchanged (120s expiry), denied ticks never delete another holder's lease, failures release in a finally. Full gate green (642).

## 2026-10-26 - Run lease against overlapping ticks (owner decision)

Owner asked whether a tick can detect in-progress enrichment and skip: it could not (state records run end only), so runs now take a start-of-run lease (`sync_run_lease:{orgId}` in app settings, no migration). A tick skips orgs with a lease fresher than 120s; stale leases from crashed runs expire by time, an unreadable lease store runs anyway, skips count toward neither the 5-org cap nor loop exit, and the residual check-then-set race window is milliseconds against a minute cadence. Billing/trials/briefings keep their own guards and are untouched. Live-verified path unchanged; full gate green (642).

## 2026-10-26 - Live tick gate honors enrichment backlog; status coverage retries locks (owner decision)

Owner ruled the hourly gate for live orgs stands only when enrichment is complete. New `hasEnrichmentBacklog` existence probe (bare non-cancelled orders, indexed, LIMIT 1): a live workspace with a backlog runs every tick until drained, then resumes hourly incrementals; the probe is skipped when the workspace is stale anyway. Live-verified on dev: ticks advanced services 15.0k to 22.6k with no analytics log rows. Also fixed the fallout the heavier write load exposed: the status coverage scan now retries lock errors 3 times instead of 500ing the poll (which stalled the tab driver and wrote unhandled-error rows). Full gate green (641).

## 2026-10-26 - Strict sync phases, zero-data cache guard (owner decision)

Owner asked for three behaviors. (1) Strict phases: a backfilling run now fetches listing windows only; enrichment engages only on finished or already-live runs, so detail reads never compete with history windows for budget. A live workspace stays live through an enrichment blackout (error recorded, no parking as backfilling). (2) The session overview cache never serves or stores zero-job snapshots: mid-seed empties refetch instead of rendering stale "no data", at the cost of refetching genuinely empty orgs per navigation. (3) The live-flip reload verified exactly-once (prev-state compare, non-overlapping polls, request guard) — no change needed; the enrichment-drained flip keeps its own single reload. Tests: enrichment cases now seed a completed seed, plus a new strict-phase test; full gate green (640).

## 2026-10-26 - Minutely analytics cron, error-only analytics logging (owner decision)

Owner asked for the seeding/enrichment tick every minute instead of every 15, and for quiet superadmin logs: no rows for empty runs, and for seeding/enrichment only failures/errors. Shipped: `* * * * *` replaces `*/15 * * * *` (top level and production); the analytics tick's `cron.analytics` info row is gone while `cron.analytics_failed` stays; briefings gated to the hourly expression (they rode every non-daily tick, which would have meant 1,440 due-checks and log rows a day). Billing, trials, retention, and other job logging untouched. Full gate green (639 tests).

## 2026-10-26 - Enrichment backlog on status; stalled tab driver fixed (owner decision)

Owner reported enrichment stalled with the tab open (400 of 24k served, driver quiet) and asked that progress show until enrichment completes. Two causes, both fixed. First, the tab driver only continued while the overview basket was completely empty, so the first landed services stood it down with tens of thousands of orders still missing detail; driving now keys off a live enrichment backlog served on the status endpoint (global distinct orders versus those with service rows, computed only while live to save the scan during backfills). Second, the banner hid on live regardless of enrichment; it now stays up with determinate progress until the backlog drains, and the charts reload once when it does (forced past the session cache, like the seed-finish reload). Also removed a contested newest-first claim from the shared progress text. Pinned by a status-backlog endpoint test. Typecheck, lint, and suites green; HMR picks it up with no restart.

## 2026-10-26 - Widget zone locks while history syncs (owner decision)

Owner asked that the whole widget area show a loading state (disabled) while historical data syncs, instead of rendering partial-seed figures as final. The charts, KPIs, and tables now render a spinner card plus dimmed non-interactive skeletons whenever the seed is backfilling and incomplete; the period card stays usable and the seeding banner above keeps live progress. Unlock pairs with the existing finish reload, so completed numbers appear in the same moment. Post-live basket enrichment still uses the basket card's own syncing state. Typecheck and lint clean; HMR picks it up with no restart.

## 2026-10-26 - Starting year always syncs in full and bases growth (owner decision)

Owner changed the partial-leading-year rule: instead of skipping to the first full year, the seed now extends back to January 1st of the cutoff year so the starting year syncs January to December and serves as the growth base. The walk's finish bound moved from the cutoff date to that Jan 1st (windows ending on or before it are never pulled; straddlers clamp to it), the run-start cursor check keys off it, and the chunk safety floor widened to 25 to fit the deepest possible walk. The base year is now simply the earliest order's year. A failing boundary test caught that clamp-to-cutoff could never fire with 90-day chunks (no window can straddle a 9-month gap); the Jan-1 bound has no such hole. Mid-year cursors parked by the old rule heal with one catch-up window on the next run. Pinned by updated walk, clamp, and base-year tests. Typecheck, lint, and suites green; HMR picks it up with no restart.

## 2026-10-26 - YoY badges cover leap-year Current Year (owner decision)

Owner confirmed Current Year math (prior period is the equal window before Jan 1; YoY is the same dates last year) and asked to cover the Dec 31 leap-year edge, where the span hits 366 days. Visibility cutoff is now 366 days. Typecheck and lint clean; HMR picks it up with no restart.

## 2026-10-26 - Monthly overlay hides the partial starting year (owner decision)

Owner asked to hide the initial partial year on the month-wise season overlay as well: its line started mid-axis with null-bridged months, implying a full-year shape. The year chips and lines now follow the growth series, which starts at the first full year, instead of deriving years from the raw monthly buckets. Typecheck and lint clean; HMR picks it up with no restart.

## 2026-10-26 - Previous-year deltas hidden past one year (owner decision)

Owner asked to hide vs Previous year on durations over a year: the shifted comparison window overlaps the selected range almost entirely there, so the delta reads near zero against itself. The Revenue and Jobs KPI cards now render the YoY badge only when the selected span is up to 365 days; the per-year growth table (already full-year based) carries the long view. Typecheck and lint clean; HMR picks it up with no restart.

## 2026-10-26 - Cap-aware seed progress plus one reload on finish (owner decision)

Owner asked whether seed progress accounts for the 5-year scope (it did not: percent divided 5-year rows by the vendor all-time total, so it stalled below 100% with a bogus ETA) and for one automatic overview refresh when feeding finishes. Progress is now walk-based: new `backfillProgress` in `sync.ts` reports chunks done of the fixed 21-chunk walk from the cursor (live is complete), served on the status endpoint; `seedingStats` prefers it and drops the time-left ETA, keeping the rows line plus elapsed. The driver watches the last-seen sync state and forces one cache-bypassing overview reload on the backfilling-to-live flip only (mount-live and error states excluded, ref reset per org). Pinned by progress-unit, status-endpoint, and seeding-math tests. Typecheck, lint, and suites green; HMR picks it up with no restart.

## 2026-10-26 - Raw vendor payload column dropped (owner decision)

Owner approved removing `org_orders.raw_json` after the pass-through review showed it was the dominant share of warehouse storage (up to 20KB per order) with zero readers anywhere in the codebase. Migration `0038_drop_org_orders_raw_json.sql` drops the column; the sync no longer serializes vendor details per order and the Drizzle schema drops the field. Canonical columns plus live detail re-reads cover every current use; per-service fee amounts stay out until a vendor exposes them with verified units. Applied to local D1 with no restart. Typecheck, lint, and analytics suites green.

## 2026-10-25 - Stuck backfill cursor at the 5-year clamp plus preset overlap fix (owner decision)

Owner reported the ISN seed re-fetching one window forever (same 1,815 rows and frozen `cursorDate` every 15s) and the dropdown check overlapping the long All-time label. Root cause of the loop: the 5-year clamp rewrote the boundary chunk's start to the cutoff, and the stored cursor (exactly the cutoff) recomputed to the same chunk index on the next run, so the seed fetched `[cutoff, boundary]` endlessly, never flipped live, and inflated `totalFetched` past the estimate with duplicates. Fix: a run whose start cursor already reaches the cutoff finishes immediately, and a successfully stored clamped chunk finishes the seed in the same run (empty clamped chunks too). Pre-cap seeds parked at 2014 also finish on the next run instead of re-walking. Pinned by two regression tests (aged cursor, clamped boundary with no refetch on the follow-up run). Enrichment itself was never stuck: 500 per run through a 21k backlog is the designed rate. Label fix: dropdown items reserve right padding for the check indicator and the preset trigger widened for the long All-time text. Typecheck, lint, and sync suites green; HMR picks it up with no restart.

## 2026-10-25 - All-time label format plus partial-first-year growth base (owner decision)

Owner asked for `All time (Oct-2021 onwards)` labeling and, after a misread that briefly excluded the current year (corrected same session), for the year-wise revenue chart plus table to ignore only the incomplete leading year with the first full year as base. The label renders Mon-YYYY from the warehouse history start via `allTimeLabel`. Growth math moved to new pure helpers: `firstFullYear` (earliest order on Jan 1st keeps its year, anything later starts the next year; unknown keeps every year) and `annualGrowthFullYears` (base row first full year with null growth, chained after, current in-progress year included like any other). Both overview builders feed them from an indexed `min(scheduled_at)` lookup. The monthly season-overlay is untouched. Old `annualGrowthRate` stays tested but unused. Pinned by bounds, growth, and label tests. Typecheck, lint, and suites green; HMR picks it up with no restart.

## 2026-10-25 - All-time preset shows its start year (owner decision)

Owner asked for the All-time label to carry its dynamic start year. The dropdown now renders `All time (starting 2021)` via a tested `allTimeLabel` helper in `period.ts`, falling back to plain `All time` until the history bounds load or when the warehouse is empty. Typecheck, lint, and period tests green; HMR picks it up with no restart.

## 2026-10-25 - All-time preset starts at the first order (owner decision)

Owner asked that All time begin at the first order date instead of 2000. New `GET /api/analytics/range` returns the warehouse min/max `scheduled_at` per org in one indexed scan (NULL dates excluded, nulls when empty). `presetRange` takes an optional history start and floors it to its UTC day for All time, keeping the 2000 fallback until the bounds load or when the warehouse is empty; all other presets are untouched and keep byte-identical custom round-trips. The dashboard fetches the bounds on mount and on explicit Sync clicks (silent auto runs skip it, so a deepening seed never triggers chart reloads by itself). Pinned by endpoint and preset tests. Typecheck, lint, and suites green; HMR picks it up with no restart.

## 2026-10-25 - Overview latency fixed by concurrent reads (owner decision)

Owner measured overview at 10 to 20 seconds versus about 4 before the warehouse aggregation change. Diagnosis: the rewrite ran eleven D1 queries strictly sequentially (3 totals, 60k-row trend fetch, 2 leaderboards, targets, inspector stats, service count, coverage, basket), and nearly every one scans the full date range server-side. Indexes find the range without a table scan, but each aggregate still reads every row in it, one HTTPS round trip at a time. Fix: all eleven reads now fire in one `Promise.all`, so latency is the slowest single query instead of the sum. Numbers and shapes are byte-identical (pure restructure, no query changes), covered by the existing parity suites. If it is still slow after this, the next lever is fewer range scans (prev/YoY totals and the 60k trend fetch dominate), not more indexes. Typecheck, lint, and analytics suites green; HMR picks it up with no restart.

## 2026-10-25 - Basket penetration replaces share; tooltip name fixed (owner decision)

Owner corrected the denominator again: penetration (share of period orders containing each service), not share of service volume, and flagged the tooltip naming the service twice. Basket `jobs` is now `count(distinct order_id)` in both overview builders with the same ordering, so the card divides by `serviceCoverage.orders` (no new API field; the one-day-lived `basketTotal` was removed). The seeding fallback dedupes service names per order to match. Tooltip now reads `Jobs: N jobs (P%)` under the single axis-title service name. Known invariant: per-service revenue still sums per row, which equals per-distinct-order only because the sync dedupes names at write time; dirty pre-dedupe rows would double-count revenue but never jobs. Pinned by a penetration test (duplicate Big rows on one order still count one order; 10 of 11 services shown over 3 orders). Typecheck, lint, and basket suites green; HMR picks it up with no restart.

## 2026-10-25 - Basket shares divide by all service jobs, top 10 only displayed (owner decision)

Owner challenged the basket share math: it divided by the displayed top 10, so shares always summed to 100% and the long tail was invisible. The overview now returns `basketTotal` (one extra indexed count of every in-range, non-cancelled service row; the seeding fallback sums its own rows) and the card divides each service by that total while still displaying only the top 10. Deliberate denominator choice: total service occurrences, not total orders, since one order carries several services and an order-based denominator would sum past 100%. Pinned by a long-tail test (11 services, 15 occurrences: 10 rows shown, total 15). Typecheck, lint, and basket suites green; HMR picks it up with no restart.

## 2026-10-25 - Aggressive session cache for dashboard overview (owner decision)

Owner asked that the overview never refetch on page reload within a session and only refetch on the Refresh button. New `src/react-app/lib/overview-cache.ts` (storage-injected, since the repo has no DOM test env): one sessionStorage entry per org and exact range with a versioned key prefix, 25-entry LRU cap, quota recovery that drops our entries and retries once, corrupt entries treated as a miss, and null-safe access when storage is blocked. `loadOverview` is cache-first with a `force` flag; Refresh, Sync click, and target save force, while mount, preset switches, and org switches render instantly from cache (switching back to a seen range is also instant). The seeding banner still live-updates through the cheap status read. Pinned by 6 unit tests. 626 tests green, typecheck and lint clean; HMR picks it up with no restart.

## 2026-10-25 - Name healing on re-sync; basket card goes jobs-only bars (owner decision)

Owner asked whether selling agents sync (rarely: Spectora exposes only an agent ID, ISN a likely UUID) and why service `amount_minor` is always empty (hardcoded null; `extractBasket` drops amounts and nothing reads the column). Agreed fixes: the sync conflict-update set now heals `buyerName`, `buyingAgentName`, and `sellingAgentName` on re-sync (previously insert-only, so late-arriving names never landed), pinned by a renaming test; no selling-agent lookups and no fee amounts for either provider until Spectora exposes per-service prices. Basket card drops the Jobs/Revenue toggle and pie: top 10 services by jobs as a descending horizontal bar chart with share of top-10 jobs on each bar and in tooltips, revenue returns with fee amounts later. Typecheck, lint, and analytics suites green; HMR picks it up with no restart.

## 2026-10-25 - Review of warehouse aggregation plus agent and inspector keys: four fixes (owner decision)

Owner asked for a comprehensive correctness review of the new aggregation layer, `agent_key`, and inspector keys. Review verdict: design sound, four defects found and fixed. (1) Inspector junction had no history backfill: pre-0036 rows would have stayed invisible to the SQL inspector card until re-synced, silently undercounting inspectors on existing warehouses. New migration `0037_org_order_inspectors_backfill.sql` replays the fan-out with `json_each` over the stored `inspector_names` (already `splitPeople`-normalized at write time, so the replay is exact), `INSERT OR IGNORE` for re-runnability, pinned by a test. (2) Utilization denominator used a grouped day fetch capped at 2000 rows, inflating utilization on ranges wider than about 5.5 years (All time spans 26); replaced with an exact single-row `COUNT(DISTINCT day)` aggregate, pinned by a 2100-day test. That test also documented a real comparison edge: millis-bearing ISOs sort before bare-seconds bounds on the same instant, so production bounds always use `toISOString` on both sides. (3) Junction fan-out skipped the delete when an order carried no inspectors, leaving ghost credit after upstream removals; the delete is now unconditional (services keep their conditional delete because ISN enriches them from detail reads). (4) Phone backfill in 0035 stripped too few separators, which would have split phone-only agents across two keys permanently on old rows; extended the strip set (sync still heals each row canonically on re-upsert). Verified clean: only two date-window request sites exist (90-day head plus the cutoff-enforced walk), totals/leaderboard/inspector SQL pinned equal to the JS helpers, keyset pages exact, org scoping on both join sides, full 0000..0037 chain applies fresh, local D1 migrated to 0037 with no restart. 619 tests green, typecheck and lint clean. Deliberately kept: superseded `(org, scheduled_at)` and `(org, status)` indexes stay until prod proves the composites cover (drop in a later migration); `getMonthlyTotals` stays as tested query-layer API for the future SQL monthly path; `org_agents` stays a best-effort directory.

## 2026-10-25 - Overview-only refresh button; warehouse history capped at 5 years (owner decision)

Owner asked for a charts-only refresh next to the period selector and why the backfill cursor sat at 2014. The period card now has a Refresh button that reloads the overview for the selected range with no provider sync and no D1 writes; the 15s auto-driver was already overview-free, so silent runs only advance sync state plus the banner. History: the walk previously ran 60 ninety-day chunks (about 15 years), which is why ISN backfills reached 2014. `sync.ts` now enforces a 5-year calendar cutoff (windows ending on or before it are never pulled, straddling windows clamp to it, `MAX_BACKFILL_CHUNKS` is 21 as the safety floor), so cursors older than the cutoff flip to live on the next run instead of pulling decade-old rows. Pre-cutoff rows already in a warehouse stay visible under long ranges; deleting them is a follow-up only on explicit approval. Pinned by a new endless-vendor test (no window older than the cutoff, seed finishes live). Typecheck, lint, and the analytics suites green; dev HMR picks both changes up with no restart.

## 2026-10-25 - Warehouse hardening follow-up: local reset, tmp removal, four security fixes (owner decision)

Owner asked to reset local D1 state, remove the temp diag test, fix the four security findings, and restart dev. Local `.wrangler/state/v3/d1` was deleted and all 34 migrations (0000..0036) re-applied cleanly from zero, clearing the stale `0035_agent_keys.sql` journal entry. `test/diag-jalop9.tmp.test.ts` (committed live-diag leftover) removed. Fixes in `routes/analytics.ts`: PUT layout/period/targets now write the authorized org and 403 on body mismatch; refresh enforces its 2-minute cooldown with a 200 `{ summary: null, cooledDown: true }` (seconds-unit bug in the draft fixed before shipping); basket joins constrain `org_orders` to the org on both sides; overview and orders validate `from`/`to` (ISO, ordered, 40y cap) with 422. Five new regression tests in `analytics-perf.test.ts` pin each fix. Full gate green: 616 tests, typecheck, lint.

## 2026-10-25 - Warehouse reads move to composite indexes plus ranged SQL (owner decision)

Owner asked whether D1 fetching can be optimized with single and composite indexes for org-scoped date-range queries at millions of rows. Shipped: migrations `0035_org_orders_perf_idx.sql` (`agent_key` column plus best-effort backfill, `org_orders_org_sched_id_idx (organization_id, scheduled_at DESC, id DESC)`, `org_orders_org_status_sched_idx (organization_id, status, scheduled_at)`, `org_orders_org_agent_sched_idx (organization_id, agent_key, scheduled_at)`, `org_order_services_org_name_idx`, drop of the dead `org_agents` email/phone indexes) and `0036_org_order_inspectors.sql` (new `org_order_inspectors` junction with `(organization_id, inspector_name, order_id)` and `(organization_id, order_id)` indexes, because `inspector_names` JSON cannot be indexed). Sync materializes `agent_key` (same email-first rule as the leaderboard) and junction rows in the existing batched upsert; `org_agents` stays a best-effort directory, not a leaderboard source, since leaderboards are windowed and it only holds all-time counts. New `src/server/analytics/queries.ts` runs totals, leaderboard, inspector, monthly, and keyset-list aggregates, all leading with `organization_id` and bare-column `>= / <` ranges; overview uses them plus a narrow 6-year trend projection for the pure-JS monthly/repeat helpers, and a new `GET /api/analytics/orders` serves true keyset pages (opaque base64url cursor, limit clamped 1..100, 422 on tampered cursors). Pre-0035 warehouses fall back to the legacy scan on `no such table/column` only. Verified: full 0000..0036 chain applies on a fresh DB; `EXPLAIN QUERY PLAN` shows `SEARCH` with no `SCAN org_orders` on the hot queries (asserted in tests); SQL totals/leaderboard/inspector pinned equal to the JS helpers; keyset pages cover a window with no dup or miss; org scoping tested. 611 tests green (11 new in `analytics-perf.test.ts`), lint clean, typecheck clean, build plus prerender clean. One pre-existing tmp diag test (`diag-jalop9.tmp.test.ts`, needs a live local D1 file) still fails environmentally and was left untouched.

Not shipped, recorded for follow-up: prod D1 sits at migration 0029 (read-only check, no writes), so `db:migrate:prod` for 0030..0036 stays an owner-approved step; local `.wrangler` state holds a stale journal entry from a reverted experiment (`0035_agent_keys.sql`, never committed, added `agent_key` plus `inspector_keys`) that blocks `db:migrate:local` until that state is reset, which is why fresh-apply was verified on an independent DB instead. Security review of this diff passed reads (org-first predicates, bound params only, cursor cannot cross orgs) with pre-existing findings left out of scope: PUT layout/targets/period handlers write body `orgId` instead of the authorized query org, refresh has no real 2-minute throttle, basket joins rely on org-prefixed ids instead of an explicit org predicate, and `from`/`to` are unvalidated.

## 2026-10-24 - Analytics responses are cache-busted end to end (owner decision)

Owner watched seeding/basket counters sit frozen while the warehouse moved underneath. Root cause: the shared fetch helper used default cache semantics and the API sent no Cache-Control, so browsers could serve identical polling URLs from heuristic cache — every layer underneath (checkpoints, enrichment, tail coverage) was advancing correctly, as proven by direct database reads. Now the client sends `cache: no-store` on all API calls and the analytics routes answer `Cache-Control: no-store`, each pinned by a test. Lint and typecheck clean.

## 2026-10-24 - Enrichment blackouts now reported instead of silent zeros (owner decision)

Owner watched basket coverage sit at zero while enrichment seemingly ran. Live instrumentation showed the machinery healthy (40/40 concurrent detail reads with data), but one earlier run enriched 0 of 500 with no error recorded anywhere — per-order detail failures were swallowed one by one, making a total vendor-side stall indistinguishable from "nothing to do". Enrichment now returns done/failed/attempted counts; a run that attempts detail reads but lands none records `service detail unavailable for N orders (...)` (non-terminal, retried next run) instead of silent zero. Likely cause of the observed stall was a transient vendor throttle burst under sustained hammering (tab driver plus clicks plus scripts); the same rows enrich fine minutes later. 599 tests green (new blackout-visibility test), lint and typecheck clean.

## 2026-10-24 - Old ISN orders carry services only in fees[]; enrichment tail unblocked (owner decision)

Owner reported basket coverage frozen at zero despite syncing. Live probe of a 2016 order showed why: ISN returns `services: []` and `packages: []` on old detail reads while `fees[]` still names the work, so enrichment found nothing on exactly the oldest rows it serves first and coverage never climbed. `extractBasket` now falls back to fee names when services are absent (never merged alongside them, which would double-count and drag financing fees into clean mixes), with unit tests for both shapes. Verified live on jalop5: 5,278 to 45,536 service rows with oldest-served reaching history start. 598 tests green, lint and typecheck clean.

## 2026-10-24 - Onboarding Back buttons removed; resume skips Pay when billed (owner decision)

Owner iterated on Back buttons (walk steps, then exit to dashboard) and finally had them removed outright: no step renders one anymore, footers reflowed, the workspace-step Cancel stays. Revisits resolve through a shared resumeOrg helper: billed workspaces (trialing/active/canceled) with no platform connected land on Connect, with one connected leave for the dashboard, and only unbilled workspaces see profile/plan/pay — so Pay never shows for already-paid workspaces. Trialing resumes in the trial flow (trial end recovered) rather than the paid flow. 592 tests green, lint and typecheck clean.

## 2026-10-24 - Basket card shows service coverage, not order-sync progress (owner decision)

Owner noted the basket loading panel parroted overall order progress rather than enrichment state. The overview now returns per-range `serviceCoverage` (distinct non-cancelled orders versus those already carrying service rows, via a left-join aggregate), and the basket card renders its own determinate bar ("X of Y orders have service detail, newest first") while backfilling with an empty pie; ranges with no orders keep the plain empty message. Pinned by a route test. Lint and typecheck clean.

## 2026-10-24 - Refresh 500 from D1's 100-parameter limit; enrichment hardened (owner decision)

Owner hit 500s on manual refresh for jalop5 plus a basket that looked over-counted. Root cause of the 500: the enrichment existence check passed ~700 ids in one `IN (...)` query and D1 caps bound parameters at 100 per statement. The failure also skipped the final state write, so cursors, totals, and the live flip were lost with it — seeds looked parked. Fixed by slicing the check into 90-id queries, making enrichment failure non-fatal (recorded, state still written), and making service inserts conflict-proof for overlapping runs (tab driver plus cron). Verified live on jalop5 (refresh clean, services flowing, basket serving). The basket "over-count" is correct behavior, now labeled: one order carries several services, so the mix counts service occurrences, not orders. 591 tests green (new 120-id chunking regression test), lint and typecheck clean.

## 2026-10-24 - Dashboard tab carries seeds home as the third engine (owner decision)

Owner asked for a way to finish seeds beyond manual clicks and cron (local dev has no cron, so tails stalled between clicks). While a workspace is backfilling, the open dashboard tab now fires a silent refresh per poll when no other worker is active (stale heartbeat) and chains its own runs, visible tabs only; charts reload only when the fetched count moved. Overlaps are idempotent-safe by construction. Typecheck and lint clean.

## 2026-10-24 - jalop3 stuck seed: precise ISN totals, count-complete hiding, heartbeat-gated Sync now (owner decision)

Owner reported jalop3 stuck at 40,110 orders synced. Investigation showed a healthy seed at 87%, not a stuck one: status backfilling, cursor 2016-06, no errors — it only looked stuck because dev has no cron and each manual Sync now advances 2 chunks. TwoUX changes followed. First, the seeding section now hides as soon as the data is demonstrably complete (live, or fetched count covering the vendor total) instead of waiting on the status flip. That rule needed an exact ISN total: a probe of unfiltered `/rest/orders` showed index rows carry only id/modified/show, so `estimateTotal` now counts live rows (45,891 vendor count minus 4,895 soft-deleted = 40,996, matching the ~39.7k stored rows modulo id-less drops), with unit tests. Second, Sync now disables while a seed is actively heartbeating (checkpoints refresh it every chunk) but stays enabled for stalled backfills and briefly after your own click, so dev seeds without a cron can always be rescued manually; rules live in `lib/sync-progress.ts` (`isSeedComplete`, `isSyncDisabled`) with unit tests. jalop3 verified live end to end after the change (tail completed, precise estimate stored). 590 tests green, lint and typecheck clean.

## 2026-10-24 - Seeding headline with honest ETA plus basket loading panel (owner decision)

Owner asked for a better seeding headline with an estimated completion time, and proper basket loading instead of skeletons. An honest ETA needs a start time and a total, both previously absent: migration 0034 adds `seed_started_at` and `total_estimate` to `org_sync_state`, and adapters gained an optional `estimateTotal` (Spectora: one tiny unfiltered call reading the pagination total, which excludes the disjoint cancelled set; ISN: one unfiltered `/rest/orders` count read, rows discarded, since no cheaper count exists). The dashboard headline reads "Syncing your inspection history" with live counts, elapsed time, rate, and "about N min left" only when a total exists — otherwise the rate alone; the bar is determinate with a total, gliding shimmer without one, all wording hedged as approximate and clamped at 100%. The basket card shows a spinner with live service counts while backfilling instead of skeletons or a premature empty message, fed by a new service-row count on the overview response. 580 tests green (7 new ETA-math tests), lint and typecheck clean.

## 2026-10-24 - Honest seeding progress: per-chunk checkpoints, textless progress bar, basket skeleton (owner decision)

Owner reported the seeding banner showing zero orders while jalop2's warehouse already held 39,660 rows, and asked for a progress bar with no text plus a loading state on the basket card. Root cause of the zero: progress (cursor, total, timestamp) was written only at run end, so a killed run — here a dev-server restart mid-seed, which drops in-flight `waitUntil` work while per-batch writes stay committed — left zeros behind. Progress is now checkpointed after the head and every chunk (preserving run-start status), with a unit test pinning the contract. The seeding banner is now a textless indeterminate progress bar (seed totals are unknowable up front, so no determinate fill would be honest; screen-reader text carries the count), and the basket card shows skeletons while backfilling instead of "no service mix". jalop2's stale sync row was repaired to its true cursor and count so the next run finishes instead of re-walking history. 571 tests green, lint and typecheck clean.

## 2026-10-23 - Faster service fills: bigger cap, parallel reads, quarter-hour analytics tick (owner decision)

Owner asked how to increase the frequency of service-detail fills. Three levers, all shipped: per-run enrichment cap 150 → 500 (tunable via `ANALYTICS_ENRICH_PER_RUN`), detail reads now run in a bounded worker pool of 8 concurrent fetches (tunable via `ANALYTICS_ENRICH_CONCURRENCY`, capped at 16; per-order failures still isolated), and a new `*/15 * * * *` trigger runs the analytics pass every 15 minutes. Billing, briefing, and retention semantics are untouched: `planCron` gained a `runAnalytics` flag that is true on every non-daily tick, while briefings keep their hourly cadence and dedupe. Live workspaces stay throttled to hourly incrementals by their own last-synced check, so the extra ticks only accelerate backfills and enrichment — roughly 500 orders × 96 ticks/day at full tilt, a 39k history in about a day. Tests: quarter-hour plan case plus wrangler trigger-consistency check, and an enrichment test pinning newest-first order with the per-run cap. 570 tests green, lint and typecheck clean. Note: `npm run db:migrate:prod` must run before deploy only if migrations are pending; this change adds none.

## 2026-10-23 - ISN service mix via per-order detail enrichment (owner decision)

Owner asked why basket mix was empty on the ISN account. Root cause: ISN `/json` windows carry no service fields at all (all 39,650 rows stored with null serviceType), so there was nothing to aggregate — not an extraction bug. A single-order probe of `/rest/order/{id}` showed the detail carries `services[]` (base names), `packages[]` (bundle names), and `fees[]`; there is no bulk endpoint, so history-wide backfill of services is infeasible and the enrichment is incremental instead.

What shipped: `extractBasket` unifies Spectora (`serviceNames`/`serviceAddOnNames`) and ISN detail (`services`→base, `packages`→package, `show:"no"` skipped) shapes with unit tests; upsert leaves existing service rows alone when a listing carries none (previously the hourly head re-sync would have wiped enriched rows); each sync run enriches up to 150 serviceless ISN rows via detail reads, newest first, tolerating single-order failures; the overview basket now aggregates `org_order_services` in SQL (top 10 in period, cancelled excluded) with a serviceType-split fallback while seeding. Live on jalop1: basket serves General Home Inspection 581, Wind Mitigation 471, 4 Point 451, WDO 350, plus bundles. Companion fix in the same pass: hourly head-only runs no longer flip a live workspace back to backfilling (status stays live when the cursor didn't move), pinned by a regression test. 568 tests green, lint and typecheck clean.

## 2026-10-23 - ISN seed hardened end to end on jalop1: retries, resume, batching, head-first incremental (owner decision)

Owner connected ISN on jalop1@yopmail.com and hit `ISN /json/orders returned a non-JSON response (HTTP 200)` plus a very slow dashboard after onboarding. Live investigation found four distinct issues, all fixed and verified against the real account (read-only GETs):

1. Transient vendor failure killed the whole seed. ISN intermittently answers HTTP 200 with a non-JSON body (re-requesting the same window minutes later returns a valid ~3 MB JSON array). Each chunk now retries up to 3 times with backoff, and a still-failing chunk keeps status `backfilling` with the error recorded instead of parking the seed in terminal `error` — the cursor never advances past the failed window, so the next run retries it. Only 401/403 (rejected credentials) are terminal, sending the owner to check the connection. 9 new tests in `test/analytics-sync.test.ts` pin retry, resume, cursor discipline, head-fallback, and auth-terminal behavior.
2. Missing ISN agent contacts. Extraction looked for invented key names and yielded zero agents; a one-window probe pinned the real `/json` keys (`agent_email`, `agent_mobile`, alongside `agent_display`/`agency_display`), now read by `extractAgentContact` with unit tests. jalop1 warehouse now holds 7,555 referring agents (top: 235 jobs / $122k) and 29,789 orders with email.
3. Hourly sync never fetched new orders. Runs only advanced the backfill cursor, so live workspaces re-read ancient windows forever. Every run now syncs the latest 90-day head window first (idempotent upserts also heal rows whose mapping improved), then continues the backfill with remaining budget.
4. Seed throughput. Per-statement D1 writes made busy chunks take minutes; writes are now D1-batched (200-statement slices, sequential fallback where batch is unavailable). Full jalop1 seed: 39,650 orders (30,513 completed / 9,137 cancelled, $15.1M completed revenue, history to 2016) in ~3 minutes; overview answers in ~750 ms on the full warehouse, so the API was never the slow part.

Verified live: resume from the poisoned cursor completed to `live` with stable row counts (no duplicates), leaderboard and agent tables populate. Local-dev note: seeding scripts that open miniflare's D1 file directly need `PRAGMA busy_timeout` while the dev server holds it; prod D1 has no such lock. 564 tests green, lint and typecheck clean.

## 2026-10-23 - Dashboard period persisted per user (owner decision)

Owner asked for the selected period to persist. New `user_dashboard_prefs` table (migration 0032, user plus org primary key) stores preset plus custom dates behind `GET`/`PUT /api/analytics/period`, keyed by session user so members keep separate choices; an absent row falls back to the org layout default. The dashboard applies the saved choice on mount and saves silently on every preset or custom-date change. 555 tests green (6 new route tests), lint and typecheck clean.

## 2026-10-23 - Dashboard YoY overlay, pie basket, sticky period select (owner decision)

Owner asked for four dashboard changes. The trend chart is now a metric selector (revenue, jobs, average ticket, repeat % of total) over a single January to December axis with one line per year in unique colors and toggleable year chips; repeat % needed per-month repeat counts, so `monthlySeries` now emits `repeatJobs` per bucket (trailing-12m agent frequency ending at each month end, both window bounds enforced after a test caught future-month leakage). Basket mix table became a pie chart with share labels. The period selector card is sticky below the app header (`top-14`, under the `h-14 z-30` shell header). Preset buttons became a dropdown with current month, previous month, last year, and all time added; the monthly/quarterly toggle was removed with the overlay design. 541 tests green, lint clean, typecheck clean, build plus prerender clean.

## 2026-10-23 - Seed-on-connect runs the full backfill in one go; Spectora agent/addon keys live-probed (owner decision)

Owner asked for seed data to sync immediately and automatically after connecting, in one go rather than spread over hourly ticks. `POST /api/sidekick/connections` now marks `backfilling` and fires `runFullBackfill` (up to 60 ninety-day chunks, one continuous run) via `executionCtx.waitUntil`, returning the connection response immediately while the dashboard polls `analytics/status` and shows the seeding banner. The hourly cron is unchanged as the resume path if a run is cut short, plus hourly incrementals once live.

Live verification against jalop@yopmail.com (Spectora, read-only GETs): one run seeded 37 chunks, 6,467 orders (5,996 completed, 67 scheduled, 404 cancelled), $2,747,572.47 completed revenue, $458.23 average ticket, 1,395 referring agents, 12,411 service rows, history back to 2018, status live. Matches the vendor's known totals (6,054 listed plus 402 cancelled).

Two bugs found by the live run and fixed: (1) agent email/phone extraction used invented key names (`agentEmail`) and yielded zero agents; a one-record probe pinned the real Spectora keys (`buyingAgentEmail`, `buyingAgentPhone`, plus `sellingAgent*` and `referralSource`), and extraction now tries camelCase and snake_case spellings. (2) basket kind was positional (first service equals base); Spectora returns `serviceNames` (base) plus `serviceAddOnNames` (addons, string or array), and the sync now stores them with verified kinds. ISN still has no verified service or agent-contact fields, so those stay partial with the existing dataQuality disclosure. 540 tests green, lint clean, typecheck clean.

## 2026-10-22 - Analytics warehouse V1: local order copy, hourly sync, D1 dashboard (owner decision)

Owner asked for a signup-to-dashboard analytics platform: connect Spectora/ISN, seed all order history into our D1, show a seeding state, then keep it fresh hourly plus a manual Sync now button, with a customizable date-range dashboard (YoY 5-year month/quarter revenue and growth, jobs, ticket, basket mix, pending/completed, agent leaderboard plus drop offs, repeat vs one-off, period vs last year, inspector performance and utilization).

What shipped: migration `0031_analytics_warehouse.sql` (`org_sync_state`, `org_orders` upserted by org/provider/order, `org_order_services`, `org_agents`, `org_inspector_targets`, `org_dashboard_layouts`); `src/server/analytics/sync.ts` walks 90-day chunks backwards from now (4 per run, Spectora merges the disjoint cancelled listing, ISN reads `/json/orders` windows and drops `show:no`); `src/server/analytics/metrics.ts` ports briefing math to stored rows; `src/server/routes/analytics.ts` serves status/refresh/overview/layout/targets from D1 only; connect marks backfilling, the hourly cron advances backfills and hourly incrementals; `Dashboard.tsx` adds presets (30d/90d/12m/YTD/5y/custom), monthly/quarterly trend, KPI and YoY cards, agent and inspector tables with inline capacity targets, basket mix, per-org widget visibility, and a seeding banner. Owner rules applied: all history backfill, repeat defined by same agent email/phone, utilization by owner-set jobs-per-day, layout persisted per org.

Known gaps: ISN service/addon split is partial until a live fee-detail probe lands (disclosed in dataQuality); overview reads the newest 60k rows per org; no live provider sync verified yet, only unit plus contract tests. 540 tests green, lint clean, build plus prerender clean, 0031 applies on local D1.

## 2026-10-17 - ISN briefings now compare two windows (owner decision)

Owner asked for period-over-period comparison on ISN, same as Spectora, overriding the earlier recommendation to keep it single-window. `isnStrategy().supportsComparison` is now `true`, so `collectBriefingFacts` fetches the previous period for every ISN cadence.

Risk accepted deliberately: ISN `/orders` returns the **full collection** for a window (observed 45,124 records unfiltered) and the adapter slices client-side, so comparison doubles the payload per briefing. That risk is carried by the existing per-window item cap (5,000) plus the truncation caveat rather than by silently dropping comparison.

New disclosure, because the comparison is not a clean split: ISN date filters accept **whole days only**, and briefing windows are local-midnight aligned, so consecutive windows share a boundary date that is counted in both. Every ISN report now says so in its data limits. That is why the periods stay equal-length and contiguous rather than being separated by a gap day (a gap would make the two windows different lengths and break per-day rate comparisons).

Unchanged for ISN: no per-inspector metrics (person fields hold UUIDs), and cancellations still derived from row status because there is no verified server-side cancel filter.

**Not tested live** — no ISN connection exists in local or production D1. Verified by unit/contract tests only (two distinct windows requested, boundary-day disclosure present). 421 tests green.

## 2026-10-17 - Monthly briefing verified on Jalop; two accuracy bugs fixed (live)

Tested the monthly review end-to-end against org Jalop (Spectora, Pro/active). The report reads correctly and every number traced back to the computed facts (`113 orders = 103 completed + 10 cancelled`, revenue `$66,047` = `6604700` minor, average ticket `$641`, revenue/day `$2,202`, cancel rate `10/113 = 8.8%`, orders `-14.4%`, revenue `-13.3%`). Testing surfaced two more bugs:

- **Multi-inspector jobs were mis-attributed.** Spectora packs several inspectors into one `inspector_name` (`"Alex Bruhl, Jim Reynolds"`) and marks provisional assignments `"Alex Bruhl (requested)"`. Grouping on the raw string reported **6 inspectors for 3 real people** and split one person's load across two rows. New `splitPeople()` splits the field, strips the `(requested)` suffix, drops UUIDs, and de-dupes within a job. Corrected live: Taylor Reynolds 46, Alex Bruhl 44, Jim Reynolds 15. Because a team job legitimately counts for each person involved, a new `teamJobs` metric discloses the overlap ("2 completed job(s) list more than one inspector") so the column is never mistaken for exclusive load.
- **A blank AI completion was delivered as a successful report.** The run returned `status: delivered, error_text: null` with `briefing_text` of length **0** — `?? 'No briefing generated.'` only catches null/undefined, so an empty or whitespace-only completion passed straight through and would have emailed the owner an empty report. `requireBriefing()` now throws on blank output in both the OpenAI and Anthropic paths, and `runBriefingJob` re-checks before the delivery stage, so the job fails visibly instead. Live re-run afterwards produced a full 1,758-character report.

Also de-duplicated the "Data limits" section, which printed the disjoint-cancellation caveat twice (once as an omission, once as a provider limit) — it is now stated once.

420 tests green (5 new for multi-inspector attribution, 2 for the blank-completion guard).

## 2026-10-17 - Briefing page budget derived from platform limits (owner decision: option 1)

Owner asked why briefings have a cap when MCP tools do not, and why it can't simply be removed. Answer: the MCP loop is driven by the *client* — each `search_orders` call is a separate request with its own budget, so nothing in one invocation can run away. A briefing has no client; `runBriefingJob` must read both analysis windows, synthesize and send mail inside one invocation, so its loop must terminate itself. It is not "capped vs uncapped" — it is *bounded by the platform either way*, and the bound should be a real one.

Checked the actual limits (Cloudflare docs) instead of assuming: **50 (Free) / 10,000 (Paid) subrequests per invocation** (D1 queries count too), **CPU 30s per Cron Trigger** when the interval is under an hour, and Spectora's own `page[size] <= 200`. The 5-minute Sidekick tick means every workspace due in a tick shares one 30s budget — that, not subrequests, is the real constraint.

The old value was a hardcoded `5` (~1,000 orders) inherited from the dashboard snapshot, roughly **6x more conservative than necessary** and, worse, duplicated in two places that disagreed (briefings used 200/page x 5 = 1,000; the dashboard used 100/page x 5 = 500).

Now: single module `src/server/lib/retrieval-limits.ts` holds the derivation and both budgets. Briefings default to **50 pages/window (10,000 orders, ~90x the largest production window)**; `BRIEFING_MAX_PAGES` overrides per deployment and nonsense values fall back to the default rather than silently disabling the truncation disclosure. The dashboard keeps its deliberately smaller 5 x 100, with comments warning against merging the two. `SPECTORA_PAGE_MAX` is now imported from the adapter instead of being duplicated as `SPECTORA_PAGE_SIZE`.

Tests: a 6,000-order window (30 pages) is now read **completely** with `truncated: false` — the case that previously under-reported revenue while claiming completeness — plus budget-exhaustion still truncating *and* disclosing, and the override parsing. 415 tests green.

Not verified: whether Spectora rate-limits or bills per `page[size]` call. The contract documents a 429 but no quota, so page count is treated as cheap; worth confirming before a workspace reaches thousands of orders/month.

## 2026-10-17 - Spectora excludes cancelled inspections from its default listing (live-verified bug)

Owner asked why a briefing said "0 cancellations… the provider reported more than were retrieved". Probing Spectora directly (decrypted the stored connection and ran the queries) explained it and exposed a real bug in the metric model:

| Query | Records |
|---|---|
| `GET /v2/inspections` (no dates) | 6054 |
| `GET /v2/inspections?filter[canceled]=true` (no dates) | 402 |
| Cancelled records **inside** a 103-record windowed listing | **0** |
| `GET /v2/inspections` (window) | 103 |
| `GET /v2/inspections` + `filter[canceled]=true` (window) | 10 |

**Spectora's default listing excludes cancelled inspections.** `filter[canceled]=true` returns a *disjoint* population (10 more), not a subset. We had modelled it as a subset and reconciled the provider count against the fetched rows, which turned a clean 8.8% cancellation rate into "0 cancellations, rate unavailable, bounded estimate" — the briefing's most alarming sentence was an artifact of our own arithmetic, not a data limit.

Fix: `WindowData.cancelledDisjoint` (set on the Spectora strategy, with the probe evidence in a comment). When set, `analyze.ts` counts the window as **listed + cancelled**, takes completed/open from the listing only, and computes the cancel rate against the full total. The "bounded estimate" path is now reserved for providers whose cancel filter returns a genuine subset that cannot be reconciled. Data quality states the disjoint source explicitly so the number is auditable.

Live re-run after the fix (Jalop, 30-day review): **113 orders = 103 completed + 10 cancelled**, **8.8% cancel rate** (+0.5 points vs prior 30 days), $66,047 revenue, −14.4% orders / −13.3% revenue vs the previous period — and the model turned the cancel rate into priority #1 instead of a caveat. 410 tests green (5 new regression tests mirroring the probe).

Also confirmed for the record: the cancelled records DO carry `canceled_at`, `cancel_reason` and `quote` (e.g. "client emailed to cancel no reason given"), so cancel reasons are available for future analysis — they are simply absent from the default listing.

## 2026-10-17 - Decision-grade briefings (owner decision: useful, per-platform, data-backed)

The briefing was reporting the same five numbers for every cadence, over a fixed 30 days, from one prompt. Five gaps were found and fixed, plus five more surfaced while reading both provider contracts.

**Cadence is now analytical.** `briefing/cadence.ts` gives each type its own window, lens and prompt: daily = yesterday vs the day before, weekly = 7 vs prior 7, monthly = 30 vs prior 30. Windows align to **local midnight in the schedule's timezone** (`briefing/windows.ts`), so a 07:00 briefing describes a completed day and ISN's day-precision filters map cleanly.

**Scheduling honors the wall clock (gap 3).** `localTime` + `timezone` were validated, stored, displayed — and then ignored: `next_run_at` was seeded with creation time and advanced by fixed offsets, so a "07:00 Asia/Karachi" schedule fired whenever it happened to be created (Jalop's fired at 12:54 PKT). `lib/local-time.ts` now resolves the local wall clock via fixed-point iteration against `Intl`, giving DST-correct instants (spring-forward gaps, fall-back overlaps, monthly day clamping). Schedule creation computes the real next run and rejects unknown zones. Migration `0026` marks existing enabled schedules due immediately so they adopt the correct time after one run (1 prod, 1 local).

**Money is minor units (gap 8).** Canonical `OrderRecord.total` was major units (dollars) while every other money value in the app is cents — the dashboard only avoided a 100x error by using raw `Intl` instead of `formatMoney`. `providers/money.ts` converts at the adapter boundary (Spectora `quote` "450.0", ISN `totalfee` "987.53" → 45000), always sets `currency`, and returns undefined rather than guessing so a missing total can't become $0. ISN has no currency field and is US-only → labelled USD (documented assumption). Dashboard switched to `formatMoney`. Documented in `mcp-contract.md` as a contract change.

**Provider-specific collection.** `briefing/providers/strategies.ts` uses only each platform's verified endpoints. **Spectora**: windowed + paged orders (200/page, max 5 pages), exact cancellations via the verified `filter[canceled]=true`, events, real names. **ISN**: single window, capped at 5000, no per-inspector metrics.

**Metrics are deterministic.** `briefing/analyze.ts` computes every number — volume, cancel rate, revenue, average ticket, revenue/day, paid vs unpaid, overdue, referral and service mix, inspector load, per-day series, and deltas with a null (not Infinity) zero baseline. The model narrates these and nothing else; uncomputable metrics land in `dataQuality.omissions` and are stated in the report.

Bugs found and fixed along the way:
- **`allowBriefings` was only checked at schedule creation** (gap 5) — a downgrade kept producing Pro briefings. Now re-checked at run time (`skippedNotEntitled`).
- **The unconfigured fallback hardcoded "MORNING BRIEFING"** (gap 4) for every cadence. Now uses the real label.
- **`recentAgents` counted UUIDs on ISN** (gap 7) — `inspector1`/`buyersagent` are identifiers, so 106 orders reported "148 agents". Now skipped in both the briefing and the dashboard snapshot.
- **An unreconcilable provider cancel count could erase a real open order.** Now in-set evidence is preserved and the rate is flagged bounded rather than inflated.
- **`providerLimits` duplicated** the same line once per window; deduped.

Verified live against org Jalop (Spectora). Monthly review over real data: 103 orders, $66,047 completed revenue, $641 average ticket, orders −14.9% / revenue −13.3% vs the prior 30 days, all 103 paid, top referral source 65 orders / $42,795 — and it correctly disclosed the bounded cancellation count instead of reporting 0%. 405 tests green.

## 2026-10-17 - Briefings now deliver by email + superadmin "run now" trigger (owner decision)

- `runBriefingJob` never sent anything: it collected facts, synthesized with AI, stored the text and marked the job `delivered` with no recipient. Delivery is now a real stage — new `briefingContent` template, sent through the existing Brevo-first/Resend-fallback transport to active org admins, from `BRIEFING_FROM_EMAIL`. Job statuses gained `delivering`, and the text is persisted *before* the send so a mail outage never loses the briefing. Briefings are AI-written prose, so the template escapes everything and only injects `<br/>` for newlines (provider text is untrusted).
- New `POST /api/superadmin/briefings/run` (superadmin-only; actor recorded in the response) runs a pass on demand with `{ orgId? }`, `force: true` (ignores the schedule clock — a support "send it now" shouldn't wait) and `rerun: true` (resets the period's existing job row instead of hitting the `(schedule, period)` dedupe index, which the Cron still treats as skip). Needed because the Vite dev server never dispatches cron events, so nothing could be verified locally. Mirrors the existing `/api/superadmin/billing/run-renewals` precedent. Gated workspaces are still skipped, exactly as the Cron skips them.
- Scheduler refactor: `runDueSchedules(env, now, opts)` is now a thin wrapper over `runBriefings(env, db, now, opts)` so a route can pass its request D1 handle instead of `env.DB`; the pass returns a summary (`ran/failed/skippedGated/skippedDuplicate/jobs`) rather than `void`, and per-job running moved into `runOne`.
- **Bug found while testing end-to-end (Jalop):** the provider was read as `schedule.ruleJson ? JSON.parse(ruleJson).provider : 'spectora'`. Schedules store `ruleJson = '{}'`, which is truthy, so the adapter was queried with `provider = undefined` and the connection lookup threw — every briefing for a schedule without a pinned provider failed. New `scheduleProvider()` parses defensively and falls back through `ProviderKeySchema.catch('spectora')`; covered by `test/sidekick-scheduler.test.ts`.
- Verified live against org Jalop (`mzEjqc3MNzpzlH5JBw2ZfVBXspps9uss`, Pro/active, Spectora): `ran: 1, status: delivered`, real synthesis over 106 orders / $67,697 completed revenue / 0 open orders, email accepted by Brevo. 346 tests green.

## 2026-10-11 - Payment methods moved beside Subscription (owner decision)

- Billing page order is now Subscription | Payment methods as a two-column grid (`lg:grid-cols-2`, `lg:items-start` so the shorter card doesn't stretch), with Invoices full-width below. Reason: the plan and the card that gets charged belong on one screen — an owner upgrading needs to see both, and the two questions ("what am I on", "what will be charged") are one decision.
- Purely a layout move; no card content, endpoint, or state changed. Below `lg` the grid collapses to a single column, so mobile keeps the original vertical order (Subscription, Payment methods, Invoices).
- Row height is shared: the grid uses `lg:items-stretch`, so both boxes match the taller one (Subscription with one card, Payment methods with several) instead of leaving a ragged bottom edge. Card is already `flex flex-col`, so it stretches cleanly.

## 2026-10-11 - Plan change moved behind a modal (owner decision)

- The Subscription card no longer shows the Plan/Billing dropdowns and an inline "Apply" button — that was the loudest control on the page for an action most owners take zero or one times. It now shows a single outline "Upgrade / downgrade" button directly under the current-plan line, above "Cancel subscription", which opens a modal.
- The modal owns everything the inline block had: Plan select, Billing interval select, the live price line (incl. the "2 months free" annual note and the upgrade-proration / downgrade-next-cycle explanation), plus "Keep current plan" and "Apply change". Opening it seeds the selects with the current plan + interval, so the dialog opens on today's state instead of a stale/empty default. Applying closes the modal (only on success, so a failure keeps the user's choice on screen).
- Same endpoints and math as before (`POST /api/billing/subscription/change`); still admin-only, still only offered while `active`/`past_due`. Trialing keeps its separate "End trial early" action.

## 2026-10-11 - Billing mutations must invalidate the shell (bug: stale trial banner + lock overlay)

- Bug: after paying/subscribing, the Pro-trial notice bar and the subscribe lock overlay stayed on screen until a manual refresh. Cause: `AppShell`'s `billingNotice` effect and `useActiveOrg`'s membership probe were keyed only on `activeOrgId`, so they never re-read server state. Only `Billing.tsx`'s own `refresh()` ran — the shell and the access gate had no idea the entitlement had changed.
- Fix: a tiny in-tab pub/sub, `src/react-app/lib/billing-events.ts` — `notifyBillingChanged()` / `useBillingRevision()`. `Billing.tsx` fires it after every entitlement-changing mutation (invoice paid, subscribe confirmed, plan change, cancel); `useActiveOrg` (access probe) and `AppShell` (trial notice) take the revision as an effect dependency. Deliberately not fired on card add/remove/primary changes — those don't change access.
- Known gap (pre-existing, not introduced here): the trial notice bar reads the admin-only `/api/billing/subscription`, so non-admin members never see the bar (403 → notice null). They do get the lock overlay via the member-readable access probe. Left as-is; the member-visible path is the gate, not the banner.

## 2026-10-11 - Trial notice bar escalates by urgency (owner decision)

- Owner ask: the Pro-trial banner was always brand blue, so urgency was invisible. It now escalates — brand blue above a week left, orange (`bg-orange-500 text-orange-950`) at < 7 days, red (`bg-red-600 text-white`) at < 1 day left and once the trial shows as expired. Thresholds line up with the server's trial-reminder cadence (5/3/0 days) so the bar never contradicts the emails.
- Tones live in `src/react-app/lib/trial-notice.ts` (`noticeTone`) rather than inline JSX so the boundaries are unit-testable — `test/trial-notice-tone.test.ts` pins 30/8/7 → blue, 6/5/1 → orange, 0 and `expired` → red, plus unknown `daysLeft` staying blue.
- `past_due` was escalated to red as well (owner follow-up): an unpaid invoice is at least as urgent as an ending trial.
- No server/schema change; the banner still reads `/api/billing/subscription` and `daysLeft` is already clamped to >= 0, so "less than 1 day" can only be the final 24h.

## 2026-10-11 - Gated-workspace lock screen (owner decision: lock + UI prompt)

- Why: gated screens only surfaced a raw toast — gated APIs return 402 with a slowapi plain-text body (no app-level Hono `onError`), and the client `api()` helper does `res.json().catch(() => null)` → `Request failed (402)`. Owners saw a cryptic error over empty content instead of "your trial ended — subscribe".
- Member-readable signal: `GET /api/orgs/:orgId/membership` (already member-scoped, no billing role needed) now returns `access: { state: "trial"|"active"|"expired"|"none", status, trialEndsAt, proTier } | null`, computed from `orgAccess()` in the membership probe (try/catch → null on failure). Chosen over reading `GET /api/billing/subscription` because billing is admin-only and a `user`/`viewer` member would get 403 and stay stuck. The probe is the SAME request the hook already made (role), so no extra fetch.
- Client: `useActiveOrg` exposes `access`; `AppShell` wraps `<Outlet/>` in a new `BillingGate`. When gated it deliberately does NOT mount the gated children (they would fire 402s and re-spam raw toasts) — it renders a static `blur-[6px]` skeleton mock with a centered lock card. Admin → "Subscribe & restore access" CTA to `/billing`; non-admin → "ask a workspace admin" (billing is admin-only). The `billingNotice` banner is suppressed while the gate shows (no duplication).
- Gate condition: `!superadmin && access !== null && access.state not in {trial, active} && route not exempt`. Exempt (always open): `/billing`, `/business-profile`, `/settings`, `/profile`, all `/superadmin*`. `access === null` NEVER gates (a loading/failed lookup must not lock a paying workspace out); `/onboarding` and `/accept-invitation` already live outside `AppShell` in `App.tsx`.
- Verified: typecheck + lint clean, 329 tests (3 new in `orgs-routes.test.ts`: gated-state reported, live-trial = Pro-tier, missing-billing-store → `access: null`), full build + prerender (33 routes).
- Follow-up (same day): residual 402s (e.g. an action fired before `access` loads, or a route the gate doesn't cover) still toasted a generic "Request failed (402)". `api()` in `lib/sidekick.ts` now reads the body as text, JSON-parses when it can, and surfaces the server's own words — JSON `error` first, then the plain-text gate sentence — falling back to the status line only for empty bodies or when the body is an HTML error page (never leaked into a toast). Covered by `test/sidekick-api-client.test.ts` (6 cases).

## 2026-10-11 - Signup exists-check, state codes, misc UI (owner decisions)

- `POST /api/account-exists` is a deliberate enumeration oracle for the signup form (Better Auth returns generic success for existing emails, stranding users on verify). Returns true only for VERIFIED accounts → signup shows "already exists, please sign in" and routes to login; unverified keeps the resend-link flow. Owner-accepted enumeration tradeoff.
- Billing state field: 2-letter code enforced (uppercase, letters-only, max 2) for US/CA only; free text elsewhere. Applies to all card forms via shared `BillingAddressFields`.
- AI Employees Activate/Deactivate buttons → toggle Switch (new `@radix-ui/react-switch` dep + `ui/switch.tsx`); Pro-gated upsell button unchanged. Verify page "Continue to onboarding" button removed; superadmin client "← All clients" now points at `/superadmin/clients`.

## 2026-10-10 - gtag stub must push `arguments`, never a real array

- Live debugging showed the tag loading, claiming the queue, and emitting lifecycle events — yet zero hits. Headless A/B probes (blank vs our exact init, stub shape × consent × injection method) isolated it: queue entries pushed as real arrays (`...args`) are silently dropped by the tag runtime; `arguments` objects fire normally. Other-websites-work was consistent all along — they use the standard snippet. `analytics.ts` now mirrors Google's snippet verbatim (with an eslint exception + comment so nobody "modernizes" it), verified by a clean-profile headless run firing real `page_view` hits.

## 2026-10-10 - Google Analytics via env measurement ID (owner decision)

- gtag.js loads only when the `VITE_GA_MEASUREMENT_ID` build-time env var is set; otherwise everything is a no-op and no third-party request fires. SPA pageviews tracked via a router subscription in `main.tsx` (covers marketing, auth, and app pages; initial load included). No consent banner — Privacy Policy §3 already discloses GA/Meta Pixel with browser-level opt-out. Production builds need the var set in the dashboard build environment; local dev via `.env`.

## 2026-10-08 - Billing address required for card payments (live Cybersource failure)

- Live failure on a real payment: Cybersource 400 VALIDATION_ERROR `city/state/street_1 cannot be blank`. Root cause: `SafepayPayment` sent `billing={{ street_1: "", city: "", country }}` (empty strings, no state) to PayerAuthentication. Note the Atoms `Billing` type marks `state` optional, but the gateway demands it — live behavior wins over the type.
- Fix (owner decisions: every card-input surface, strict street/city/state minimum, no server persistence): new shared `BillingAddressFields` (street + city + state/ province, required) + `SafepayPayment` takes a `billingAddress` prop passed straight through to payer auth. Collected on onboarding review (paid flow), Billing subscribe card, and the Add-card dialog (setup mode runs payer auth too — it also had an empty `country`, now a selector defaulting to the org country). Address is pass-through browser → Safepay only, never sent to our server or stored.

## 2026-10-05 - MCP pagination accuracy (owner decision: descriptions + envelope, strict for claims)

- AI clients miscounted across pages because nothing enforced loop-until-complete. Fix lives in always-visible protocol surfaces (no prompts/instructions): the pagination contract is appended to all four `search_*` tool descriptions, and every search response carries flat additive `hasMore` / `pageComplete` / `retrievalNote` fields (`paginatedResult` in `src/server/mcp/tools.ts`). Aggregate claims require full loop + count reconciliation; exploratory peeks may stop early.
- Rejected: `fetch_all_*` tools (duplicate stable primitives, unbounded context), pagination resource (weak client reach), server-side chaining (stateless protocol).
- Noted: ISN `totalEstimate` = records returned with no cursor — cursor absence is the stop signal. Spectora `nextCursor` verified never empty-string (numeric page or undefined); envelope guards `""` anyway. Covered by `test/mcp-pagination.test.ts` (5 tests).
- Follow-up (owner rule: uniform limit 100 unless a platform serves fewer): verified against live vendor docs 2026-10-05 — Spectora `page[size]` max 200 (agents reference), so 100 is mid-range; ISN has no page params anywhere in the vendored spec, `limit` is a client-side slice with vendor `count` as the truncation detector. Schema stays `max(100)` (the earlier raise-to-200 is superseded — context safety wins on fat order records). Cursorless truncation now emits a narrow-filters hint (tested). Pending platforms explicitly on hold; future adapters must record max page size in `provider-adapters.md` before going live.
- Follow-up (owner decision: use 200 unless a platform serves fewer): canonical `search_*` limit raised to `max(200)` (schema, contract text, morning-briefing plan); ISN slice bound raised to 200; Spectora already pages natively to 200. Both live platforms serve the full 200, so no per-platform clamp below it. Internal snapshot bounds (`SNAPSHOT_PAGE_LIMIT`, briefing retrieval caps) deliberately untouched — provider-load controls, not the MCP surface.

## 2026-09-20 - Coming-soon platform shells (owner decision)

- ServiceTitan, Housecall Pro, Jobber ship as fail-closed adapter shells (`src/server/providers/<name>/adapter.ts`): empty capabilities, every data method throws "coming soon", no write methods, no invented fields. Registry resolves them; `POST /api/sidekick/connections` rejects them with 422. Connections UI shows them disabled ("coming soon" in the picker, "Coming soon" badge section). Live probing replaces each stub method by method.

## 2026-09-20 - Plan features move to the database (owner decision)

- `plans.features` (comma-separated, `0023_plan_features.sql`) is the single source of truth for feature bullets on the pricing page and the billing subscribe picker; both render via `parsePlanFeatures`. Superadmin sets it on plan create and per-plan Features edit. Individual features must not contain commas, so the seed AI-tools bullet reads "Connect with any AI tool like Claude / ChatGPT / Gemini and more" (`0024_plan_features_wording.sql`).

## 2026-09-16 - Rebrand Fieldvisory -> Tradesmatic (owner decision)

- Product-visible strings renamed repo-wide (UI, emails, MCP names, docs, agent files, tests, knowledge sources + regenerated `knowledge.ts`). Portal default follows via `PORTAL_NAME` const + `0019_portal_name_tradesmatic.sql` (verified on local D1).
- Deliberately UNCHANGED: worker/D1/package names (`fieldvisory`, `fieldvisory-db-prod`), GitHub repo, Ostive sender identities, historical migration files. Brevo list #8 rename is owner-done in the dashboard (code holds only the ID). Production domain swap pending owner-provided domain (APP_BASE_URL + OAuth origins + DNS).

## 2026-09-16 - Reprice plans + signup/marketing polish (owner decisions)

- Plans repriced via `0018_plan_prices.sql` (Starter $9/mo $90/yr, Pro $14/mo $140/yr). Plan rows are what renewals/new subscribes price from, so future charges use the new values. Seed docs (`AGENTS.md`, `product-spec.md`) updated; no prices are hard-coded in UI (verified: no `1900|2900` in `src`). Local D1 verified; production still needs `npm run db:migrate:prod`.
- Signup ToS/Privacy links open in a new tab; auth logo (`AuthBrand`) links home on all logged-out auth pages.
- Follow-up (owner decision): superadmin BCC commented out on ALL sends (lines kept as comments + `superadminBcc` helper retained for easy re-enable); all auth emails (verification incl. re-signup resend, magic link, password reset, both invitation paths) reverted to Resend-only. Billing mail + contact form stay Brevo-first; verified-signup subscribe to Brevo list 8 unchanged.

## 2026-09-16 - Verify-email page: address display, resend + 30s timer, change email

- Page (`/verify-email`) now shows the address from signup navigation state (session email as fallback, manual input as last resort), a resend button via `authClient.sendVerificationEmail` with a visible 30s client cooldown, and an inline change-email form.
- Change email needs a custom `POST /api/pending-email` because no session exists pre-verification (Better Auth `changeEmail` requires one). Scoped narrowly: unverified accounts only, new address must be unused, 60s per-address cooldown from the `verifications` table, old tokens invalidated, credential `accounts.accountId` kept in sync (password sign-in looks it up by email). Unknown addresses get generic `{ok:true}` (no enumeration oracle).
- Residual risk (accepted, narrow): retargeting a known pending address to an attacker's inbox within the verification window would hand them the auto-sign-in session. Mitigated by the unverified-only guard + cooldown + short window; no broad fix exists without a pre-verification credential. Revisit if abused.
- Follow-up: re-signup with a pending address now auto-resends the link via `onExistingUserSignUp` (verified source: `sign-up.mjs` returns a generic success and sends nothing). Unverified-only + 60s cooldown from the `verifications` table; never throws (signup must succeed regardless).

## 2026-09-16 - Brevo primary email + "Tradesmatic New Signup" list (owner decision)

- Transport: all sends go through `src/server/lib/email.ts` -> Brevo first (`POST https://api.brevo.com/v3/smtp/email`, `api-key` header), Resend fallback on failure or when Brevo is unconfigured. Sender resolves from `BREVO_SENDER_EMAIL`/`BREVO_SENDER_NAME`, falling back to parsing legacy `RESEND_FROM_EMAIL`. No secrets logged.
- New-user subscribe: `databaseHooks.user.create/update.after` in `src/server/auth.ts` calls best-effort `subscribeVerifiedUserToBrevo` — verified emails only (owner-confirmed 2026-09-16), all signup methods (email+password, Google OAuth, magic link, invited members), never blocks auth. Contact upsert uses `POST /v3/contacts` with `listIds: [<BREVO_NEW_SIGNUP_LIST_ID || 8>]` + `updateEnabled: true`, falling back to `POST /v3/contacts/lists/{id}/contacts/add` on duplicate errors.
- Owner-confirmed scope: no backfill of existing users (new signups only); Resend stays as automatic fallback. Contract tests in `test/brevo.test.ts` (10 tests, mocked fetch).
- NOT yet live-probed: needs `BREVO_API_KEY` + verified `BREVO_SENDER_EMAIL` set in production secrets before transactional sends actually flow through Brevo.
- Follow-up (owner decision): superadmin BCC commented out on ALL sends (lines kept as comments + `superadminBcc` helper retained for easy re-enable); all auth emails (verification incl. re-signup resend, magic link, password reset, both invitation paths) reverted to Resend-only. Billing mail + contact form stay Brevo-first; verified-signup subscribe to Brevo list 8 unchanged.

## 2026-09-14 - Spectora transport: MCP -> direct REST (owner decision)

- Rewrote `spectora/client.ts` as a direct REST client (`GET https://connect.spectora.com/v2/...`, Bearer API key, `SpectoraApiError` on non-2xx); removed the MCP SDK transport + `unwrapToolResult`. Adapter/mapper untouched (same JSON:API payloads); params now return flat query objects (the `{queryParams}/{pathParams}` wrappers were MCP-envelope artifacts).
- Verified from the live REST reference (developer.spectora.com re-read 2026-09-14): same host, same paths/filters, Bearer auth, array syntax `filter[start_datetime_between][]=a&...[]=b` (client serializes arrays as repeated `key[]`), date-only company-timezone event windows (matches our `toEventDate`), single-record `GET /v2/<resource>/{id}`.
- Back-compat: stored OAuth tokens still accepted (preferred, as before); legacy stored `mcpEndpoint` values work with a trailing `/mcp` stripped. Adapter stays read-only (REST POST/PUT surfaces deliberately uncalled).
- NOT yet live-probed over REST (no Spectora key on hand): the `[]` serialization and single-record shapes are doc-verified only. Needs one live call with the owner's key before production-grade claims. Contract + agent-rule docs updated.
- LIVE-PROBED 2026-09-14 using a stored dev API key (decrypted locally from local D1 + `.dev.vars`, never printed/stored; probe script deleted): all five REST reads return HTTP 200 with exactly the JSON:API shapes the mapper handles (`data/meta.pagination/links`; single inspection identical to the documented attribute set); the events `[]` date-range syntax works; bad key -> HTTP 401 JSON:API errors array (mapped). REST transport is now production-grade; probe artifacts removed.

## 2026-09-13 - Plan-tier marketing + employee gating

- Pricing page: cards centered (flex-wrap justify-center), feature bullets derived from plan fields (seats → users line, briefings flag → briefings line; capped vs unlimited tier → 3 vs 7 employees, Standard vs Priority support), no organizations bullet, annual badge "Get 2 months free!" computed (annual ≤ 10× monthly), CTA "Start 30-day free trial" → /signup. Setup-fee/trial-days bullets removed (no setup fees, no plan-level trials by hard rule). `GET /api/plans` now also returns maxUsers/allowBriefings.
- Billing subscribe/change-plan surfaces show the same computed annual badge. Marketing header CTA is "Start free trial".
- Dashboard: title "Overview", snapshot revenue as USD currency (major units — NOT formatMoney minor-unit helper), AI access "Via Tradesmatic MCP Server".
- AppShell renders a persistent trial/expired/past-due notice bar with Subscribe button on all org pages (superadmin console exempt).
- AI employees gated by plan: MCP prompts carry a starter/pro tier; worker resolves per-request entitlement (trial or uncapped = full roster) and registers only entitled prompts — Pro prompts hidden + refused for Starter, advisor instructions filtered too. Employees page greys out Pro cards with upgrade CTA driven by the org subscription.

## 2026-09-13 - Auto-reactivation on upgrade

- `enforcePlanLimits` gained `{ reactivate }` (subscribe + upgrade only): after suspending over-cap actives, free seats are filled by reactivating suspended members oldest-first; unlimited plans restore everyone. Downgrades never reactivate. The upgrade path (`changePlan` kind `upgrade`) now runs enforcement too — previously only downgrades did. Note: reactivation cannot distinguish enforcement-suspended from admin-suspended members (status column only), so upgrading restores those as well; admins can re-suspend.
- Follow-up: `members.suspended_by` (migration 0017, NULL for legacy rows) records provenance — `plan_limits` on enforcement suspends, `admin` on manual suspends via `setMemberAccess`, cleared to NULL on any reactivation. Auto-reactivation now restores only `plan_limits` rows; admin-suspended and legacy unmarked rows stay suspended (fail closed).

## 2026-09-03 Full reset (GHL deleted)

- Deleted all GoHighLevel code: provider, OAuth, query/webhook routes, checkout iframe, provider-resolution, checkout-session, subscription fallback, GHL tests, GHL migrations, `ghl-specialist` subagent.
- Preserved Safepay knowledge verbatim: `docs/safepay-api-contract.md`, `docs/safepay-atoms.md`, generic HTTP adapter pattern, wallet `pm_` + `unscheduled_cof` charge flow, webhook HMAC-SHA512 verify, billing-date math (now `src/server/lib/billing-dates.ts`).
- New model: manual subscriptions ONLY. No Safepay native `sub_`/`plan_` path, no hosted subscribe, no subscription webhook reconcile. Worker Cron owns renewals.
- Stack locked: Vite React 19 + Tailwind + shadcn + Hero Icons, Hono Workers, D1 + Drizzle, Better Auth (email+password, Google OAuth, magic link via Resend), Safepay sandbox/USD first, Resend emails.
- Tenancy locked: multi-org membership, top-left active-org dropdown, per-org roles admin/user/viewer, global superadmin via `SUPERADMIN_EMAILS` seed `users.isSuperadmin`.
- Renewals locked: daily Cron auto-charges org default `pm_` via `unscheduled_cof`.
- Usage charges locked: superadmin creates invoice charge now against org default `pm_`.

## Carried-over verified Safepay facts (from prior sandbox probes, do not regress)

- Auth: `X-SFPY-MERCHANT-SECRET` for server calls; never expose to browser.
- Customer create `POST /user/customers/v1/` requires `country` (ISO alpha-2) + `phone_number`; returns `data.token = cus_`.
- Session `POST /order/payments/v3/` returns `data.tracker.token = track_`; amounts integer minor units; modes `payment` / `unscheduled_cof` / `instrument`.
- Tracker read: `GET /reporter/api/v1/payments/{tracker}` (v3 path is POST-only). `TRACKER_ENDED`/`TRACKER_CHARGED` = succeeded.
- Saved-method charge: `POST /order/payments/v3/{tracker}` with `{ payload: { payment_method: { tokenized_card: { token: "pm_" } } } }`.
- Wallet list `GET /user/customers/v1/{cus}/wallet/` returns `pm_` tokens + `cybersource` metadata (bin, last_four, expiry).
- Client token `POST /client/passport/v1/token` (empty body) `{ data: "<tbt>" }` for Atoms.
- Webhook signature: header `X-SFPY-SIGNATURE` = HMAC-SHA512 hex of raw body with dashboard shared secret (`SAFEPAY_WEBHOOK_SECRET`); replay protection on `evt_` token.
- Currency: uppercase ISO 4217 at Safepay boundary; USD first; no silent conversion.

## Open / confirm with owner

- Annual pricing ASSUMED as 10x monthly (2 months free): Launch $1,990/yr, Growth $2,990/yr, setup fee unchanged. Confirm display prices before building checkout UI.
- Trial period: assumed none for v1 (signup charges immediately). Confirm if a trial is needed.
- Dunning: assumed Cron retries every daily run while `nextCharge` stays past-due (no backoff cap for v1). Confirm retry/backoff + past-due grace expectations.
- Refunds: assumed superadmin-only via Safepay tracker refund. Confirm who may refund.
- Better Auth org plugin vs custom org tables: to be decided at auth implementation time against installed better-auth version; schema below is compatible with either.

## 2026-09-04 Dynamic plans, portal settings, signup-first, fallback + dunning (owner-confirmed)

- Plans are dynamic, superadmin-managed (name, monthly price, yearly price, setup fee, trial days, description, order, active). Max 4 ACTIVE plans enforced in the API. Delete blocked while any `org_subscriptions` references the plan; archive hides it from signup. Existing subscriptions keep stored prices.
- Yearly price is an explicit field (no formula). Seed keeps Launch/Grrowth assumed annuals ($1,990 / $2,990) until owner confirms display prices.
- Portal settings: `app_settings` table with `portal_name` + `support_email`, editable in superadmin settings; header and emails read from it.
- Signup starts at account creation: verify email forced wizard (create org pick plan add card pay). Setup fee charges immediately even with a trial; the trial delays only the first recurring charge; full access during trial.
- Payment methods: multiple per org, one primary, backups ordered by `priority`. Cron tries primary backups ascending; first success wins and a succeeding backup is auto-promoted to primary. Failed methods marked `failed` (UI-visible); later success restores `active`. Removal allowed only while more than one VALID method remains; primary cannot be removed without promoting another first.
- Manual retry: org `admin` or `superadmin` presses retry on ONE selected method for a due/failed invoice. Single-method charge, idempotent per invoice attempt, short cooldown.
- Dunning: all-methods-fail invoice unpaid, subscription `past_due` (suspended, data retained). Reminders to org admins day 0, 2, 4, 6 + final day 7; stop on payment; no auto-cancel after day 7.

## 2026-09-04 Discounts, invoice essentials, plan-change policy, refunds, scaffold additions

- Discounts: Stripe-style coupons ASSUMED (owner left the mechanics question unanswered confirm before building checkout UI): percent/fixed, duration once/repeating-N/forever, selectable applicable plans (none = all), expiry + max redemptions, client-entered at signup + superadmin-attachable, recurring-lines-only by default, stack with trials, negative invoice lines, one coupon per subscription. Tables: `coupons`, `coupon_plans`, `subscription_coupons`.
- Tax: none in v1 (pre-tax amounts, subtotal = total).
- Invoices: sequential `INV-YYYY-NNNN` (per-year sequence table, unique), line items, due dates, downloadable PDF from `GET /api/billing/invoices/:id/pdf`. No late fees.
- Plan changes: upgrade immediate + prorated (price difference Ã— remaining cycle time, charged at once); downgrade next cycle; cancel keeps access to period end.
- Refunds: superadmin-only, full or partial via Safepay tracker refund. No credit balances.
- Scaffold: added `billing-specialist` + `portal-frontend` subagents, `07-discounts.md` rule, `docs/api-contract.md`, slash commands `fresh-db` + `verify-billing`. Restart opencode after pulling for new agents/commands to register.

## 2026-09-04 Phase 1 (auth + orgs + settings + onboarding shell)

- Better Auth 1.7.2 via docs MCP: Hono mount `app.all("/api/auth/*")`, `drizzleAdapter` with explicit plural-table mapping, org plugin with `creatorRole: "admin"`. Instance created per request (D1 binding is per-request).
- Bumped `drizzle-orm` 0.44.7 0.45.2 (better-auth 1.7 adapter requires ^0.45.2). Installed `@better-auth/drizzle-adapter`.
- Org tables rebuilt (migration 0003) to plugin-compatible shapes: `logo`/`metadata` on organizations, `expires_at`/`inviter_id` on invitations, `active_organization_id` on sessions; `updatedAt` nullable where the plugin never writes it.
- Roles: plugin default role vocabulary is owner/admin/member with no verified custom-role config, so member rows carry free-form `admin`/`user`/`viewer` enforced ONLY server-side (`roleAtLeast`). Unknown roles authorize nothing (deny by default). ASSUMPTION to verify in dev smoke: the plugin stores/accepts `user`/`viewer` invite roles as-is. Fallback if rejected: invite as `member`, then downgrade the row via our own update.
- Superadmin: `users.isSuperadmin` maintained by OUR code (session-create hook best-effort + `requireSuperadmin` self-heal from `SUPERADMIN_EMAILS`), never part of the auth schema.
- Email: Resend wrapper with in-memory outbox (captured when no key or in tests). Verification required for password signup; magic link 5-min default; invitation links point at `/accept-invitation/:id`.
- `better-sqlite3` has no usable build on this machine (node-gyp fails on Node 23), so route/guard tests use dependency-injected fakes (session resolver + member store + services) instead of a SQL driver. Real SQL paths are covered by fresh-DB migration checks + a manual dev smoke (below).
- Auth tables use drizzle `timestamp`/`boolean` modes (storage stays INTEGER): Better Auth sends JS Dates/booleans and D1 rejects them as raw values (proven by live 500 + `D1_TYPE_ERROR`). No DDL change needed. Our own writes to those tables must use `Date` objects.
- Better Auth 1.7 requires an `issuer` column on `account` (migration 0004). Staying in 1.7 compat (issuer identity) mode the unverified `account.identityStrategy` location was dropped after it broke type inference (it also hid plugin endpoints from `auth.api` types).
- Dev smoke still to run (needs `.dev.vars`: `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, Google creds): signup verify email create org (creator is admin) invite `viewer` accept membership probe roles superadmin settings gate Google OAuth round-trip.

## 2026-09-05 Dev smoke findings (server running, localhost:5173)

- Auth tables use drizzle `timestamp`/`boolean` modes (storage stays INTEGER): Better Auth sends JS Dates/booleans and D1 rejects them as raw values (proven by live 500 + `D1_TYPE_ERROR`). No DDL change needed. Our own writes to those tables must use `Date` objects.
- Better Auth 1.7 requires an `issuer` column on `account` (migration 0004). Staying in 1.7 compat (issuer identity) mode the unverified `account.identityStrategy` location was dropped after it broke type inference (it also hid plugin endpoints from `auth.api` types).
- Email verification links are STATELESS (signed token, no `verifications` row). Verification must be completed by clicking the emailed link cannot be pulled from D1.
- `.dev.vars` is read at worker startup: editing secrets requires a dev-server restart. First smoke run silently captured emails locally (no key at boot) and had no Google provider.
- Better Auth 1.7 API notes: social sign-in is `POST /api/auth/sign-in/social {provider, callbackURL}` (per-provider GET 404s); all `/api/auth/*` calls require an `Origin` header (`MISSING_OR_NULL_ORIGIN` otherwise); unverified login fails closed as 401 `INVALID_EMAIL_OR_PASSWORD` (no account-oracle).
- Google OAuth wiring verified: `/sign-in/social` returns a well-formed `accounts.google.com` URL with our client_id + `redirect_uri=http://localhost:5173/api/auth/callback/google` (must be registered in Cloud Console).
- Smoke artifact (no code impact): the pre-fix 422 signup left a user row WITHOUT its credential account row (better-auth does not roll back across tables on adapter failure); the follow-up "200" was a duplicate-address synthetic success. Login then fails closed as `INVALID_EMAIL_OR_PASSWORD` with a misleading `User not found` warning. Fresh signups after the fix write both rows. Junk row deleted; smoke uses fresh addresses.

## 2026-09-05 Custom org roles verified live (smoke complete)

- The plugin VALIDATES invite roles (`ROLE_NOT_FOUND: viewer` for free-form strings). Fix: `src/shared/permissions.ts` defines `admin` (= default `adminAc`), plus `user`/`viewer` as read-only custom roles via `defaultAc.newRole`, passed as `ac` + `roles` to BOTH server and client plugins. Verified: invite `viewer` accept member row `viewer` probe returns it.
- Drizzle adapter schema map must contain BOTH singular and plural keys: core calls use `member`, the plugin queries `members` (proven by live `model "members" was not found` 500).
- No `owner` role exists: org deletion through the plugin is impossible (no role grants it). Revisit only if org deletion becomes a feature.
- `ac`/`roles` need casts to the generic base types (variance only, runtime untouched).
- Full live matrix on localhost:5173: health, plans, signup, stateless verify (click), pre-verify login rejected, post-verify login, org create (creator `admin`), invite/accept `viewer`, superadmin settings 200 vs user 403, settings PATCH persistence, Google `/sign-in/social` URL. Smoke renamed local `portal_name` to "Ostive Billing" confirm real name + support email.
- Google signup initially failed with `unable_to_create_user`: the 1.7 account model also requires `scope`, `accessTokenExpiresAt`, `refreshTokenExpiresAt` (password flows never write them, so only the first OAuth sign-in surfaced it). Fixed in migration 0006 + schema timestamp modes. Lesson: password-only smoke does not cover the OAuth write path.

## 2026-09-05 Phase 2 billing engine (services + routes + Atoms UI)

- Test seams: `BillingStore` interface (drizzle impl prod, in-memory impl tests) + `IdempotencyBackend` (failed keys RELEASE so legitimate retries proceed; cooldowns enforced separately, e.g. 5-min pay retry window). `better-sqlite3` still unbuildable here; no SQL driver in tests.
- Percent discounts apply PER LINE (rule-corrected after a test caught pooling); fixed spreads recurring-first.
- Signup anchors to the `now` parameter (`utcMidnight`), not wall-clock, for determinism.
- Manual pay and admin retry are ONE endpoint (`POST .../invoices/:id/pay`, single method, user+): recovery of past_due flips status but never moves the schedule (Cron collects the next period normally).
- Live sandbox proof: real customer + `track_` session + client token minted for $696 signup total; bogus tracker rejected 422; `run-renewals` clean on empty schedule.
- Safepay customer create requires first AND last name server splits the display name (single word reused for both).
- Manual renewal trigger `POST /api/superadmin/billing/run-renewals` (same routine as the Cron; idempotent per period).
- Awaiting browser smoke: real test-card signup via Atoms UI (wallet `pm_` sync), then a forced-date renewal charge.

## 2026-09-05 Browser + renewal smoke PASSED (live sandbox)

- Real test-card signup (4242/2030) via Atoms UI: `INV-2026-0001` paid $696 (setup 497 + first period 199, correct lines), subscription active cycle 1, `nextCharge` anchored Oct 5, card saved as default `pm_`.
- Forced-date renewal via `run-renewals`: real `unscheduled_cof` $199 collected `INV-2026-0002` paid, cycles 2, schedule advanced, tracker recorded. Sequential numbering confirmed.
- Phase 2 complete. Remaining: Phase 3 (superadmin clients/usage-charges/refunds/coupons/plans APIs + UI), Phase 4 (portal UX polish), Phase 5 (hardening: webhooks, templates, audit).

## 2026-09-05 Security audit (Phase 5 start)

- Clean: no frontend secret exposure, no `dangerouslySetInnerHTML`, no server secret logging, all SQL via parameterized drizzle, all tenant routes membership-gated, superadmin gates on all admin routes, amounts always server-computed, no user-controlled server-side fetches (SSRF surface: none).
- Fixed: unexpected errors returned raw gateway/DB messages (now generic "Request failed"; domain errors keep curated messages); user-controlled names (org/plan) now HTML-escaped in emails; invoice PDF shows org name instead of org id.
- Deferred to deploy: in-app rate limiting absent on custom endpoints use Cloudflare WAF rate rules (Workers isolates make in-memory limiting unreliable). Better-auth's own routes have built-in limits.

## 2026-09-05 Phase 3 (superadmin billing management)

- Usage charges use the same method cascade as renewals (first success wins + promote); a failed usage invoice stays failed with NO dunning and NO suspension dunning/past_due belong to the subscription schedule only. Manual pay recovers them.
- Refunds: partial keeps `paid` + negative refund transaction; full flips invoice to `refunded` (new status, no DDL text column). No credit balances anywhere.
- Plan delete cascades coupon-applicability rows only (delete itself is blocked with referencing subscriptions).
- Superadmin UI at `/superadmin` (client-gated by trying the endpoints; APIs enforce). Settings tab reuses the settings API local `portal_name` currently "Ostive Billing" from smoke.

## 2026-09-05 Smoke-driven fixes (live D1 review)

- Refund form asked for an internal UUID the UI never shows, so the first refund attempt 404'd. Refunds (and only refunds other flows pass IDs internally) now resolve by UUID OR human number (`INV-YYYY-NNNN`); the form labels the expected format.
- Live dunning lifecycle fully proven: staged `past_due` + failed invoice Run renewals sent reminder #2 via Resend user paid from the billing page invoice paid, subscription recovered to active, `pastDueSince` cleared.
- Live refund proven: partial $5.00 refund on `INV-2026-0005` via the real Safepay tracker-refund call negative refund transaction recorded, invoice correctly stays `paid`.

## 2026-09-05 Phase 5 (webhooks, audit, email polish, deployment guide)

- Webhook reconcile is deliberately conservative: only dueâ†’paid (late confirmation), dueâ†’failed (+dunning start), and refund recording. Paid/refunded/void rows are never touched; subscription.* events are acked and ignored (no native subs). Replay-safe via `webhook_events` unique key.
- Audit fixes: generic 500s, escaped email content, org name (not id) on PDFs.
- `docs/deployment.md` holds the production checklist (fresh secrets, live keys, Resend DNS, Google prod URI, Safepay webhook URL, Cron check, WAF rate rules, D1 export before risky migrations).

## 2026-09-05 Superadmin console overhaul (tables, bulk, profiles)

- Shared `DataTable` (instant search, column sort, pagination, bulk select) drives Clients + Invoices tables.
- Superadmin may operate any tenant's billing via the member billing endpoints (`allowSuperadmin` bypass); every superadmin-initiated write carries actor identity (`by email (superadmin)` on transaction notes, `createdBy` on invoices).
- Bulk ops run sequentially client-side with per-row results + summary toasts; bulk refund is full-only, bulk retry uses each invoice's default method, destructive bulks confirm with affected names listed.
- Duplicate opens the Create form prefilled (amount/description/org) no blind clone endpoint.
- Refunds resolve by UUID or human number (both API + form label).

- Preset replaced the theme (fonts: Public Sans + Inter, mist base, `.dark` vars present but no toggle app stays light) and all primitives.
- Kept: Heroicons in app code (preset uses phosphor glyphs inside primitives only part of its design, negligible bundle impact via tree-shaking), `cn` paths fixed to `@/react-app/lib/utils`, sonner fixed to light without next-themes, Safepay iframe `overflow-x` guard restored.
- Committed locally as `6cb3f4b`, NOT pushed pushing triggers the production auto-deploy.

## 2026-09-05 - Portal UI overhaul (shadcn shell + default org, pre-preset baseline)

- shadcn new-york primitives vendored under `src/react-app/components/ui` (button, card, dialog, dropdown-menu, avatar, badge, skeleton, tooltip, tabs, input, label, select, separator, sheet, sonner, table, alert); lucide/next-themes imports swapped for Heroicons/fixed light theme; `cn` import paths fixed to `@/react-app/lib/utils` (`@` `src` in tsconfig + vite).
- Default org: `users.default_org_id` (migration 0007) + `GET /api/me` (now includes it) + `PATCH /api/me/default-org` (membership-validated). Login auto-activates default first-created org; dropdown changes persist to the session; star toggles the persistent default.
- Shell: desktop sidebar + mobile drawer, portal-name header, org switcher (switch/default/create), avatar profile menu (role + superadmin badges), sonner toasts at app root, skeletons, confirm dialogs for destructive actions, tooltips on icon buttons. All pages restyled.

## 2026-09-05 Production deployment (sandbox-first)

- Worker live: `https://saas-billing-portal-production.mfaizanzahid.workers.dev` (health + plans verified against prod D1). Cron `0 3 * * *` attached.
- Prod D1 `saas-billing-portal-prod` (`e5ce52f0-`) with migrations 0000“0006; all 7 secrets set (fresh auth/encryption secrets, sandbox gateway keys, Resend, Google secret).
- Gotcha: plain `wrangler deploy` uses the Vite plugin's flattened config (dev values) prod deploys MUST use `--config wrangler.jsonc --env production` (`deploy:prod` script). Migration script needed `--env production` too.
- Pending owner actions: custom domain in dashboard, Google prod redirect URI, Resend domain verification, Safepay webhook URL + eventual live keys.

## 2026-09-05 Renewal double-charge review (user-caught, test artifact)

- The forced $199 renewal re-collected an ALREADY-PAID period: signup had set `nextCharge` to Oct 5 for the paid Sept“Oct cycle, and the smoke rewound it into the past. In real billing the engine would have stayed quiet (nothing due until Oct 5). Sandbox test money only no real funds moved.
- Real gap exposed and fixed: collection relied solely on `nextCharge` advancement, so overlapping executions could double-collect. Renewals now run under the per-period key `renew:{subscription}:{nextCharge}` (concurrent losers skip via `DuplicateIdempotencyError`; failures release the key for normal retry). Proven by a concurrent-run test (exactly one invoice).
- Local D1 reset to clear smoke artifacts (users must re-sign up for future browser tests).

### Suggestions applied from best practices

- Archive-not-delete for plans with history (audit trail + invoice references stay intact).
- Explicit yearly price instead of a discount formula (avoids rounding drift and lets superadmin set charm prices).
- Setup-fee-now + trial-delays-renewal (trials that waive setup fees get abused; charging setup filters intent while keeping the trial meaningful).
- Priority-ordered fallback with auto-promote (prevents billing the same dead card every cycle while keeping a human-readable order).
- Single-method manual retry with idempotency + cooldown (cascade retries risk surprise multi-charges; the Cron already covers cascade).
- Dunning ends in suspend-not-cancel (auto-cancel destroys data and recovery; suspension preserves it).

## 2026-09-06 - Member access status + green active badges

- members.member_status (migration 0008, fixed by 0009 - first cut named the column status, mismatching the schema; renamed, values carried over). Suspended members get 403 from tenant guards (superadmin identity bypass unaffected); last active admin can be neither suspended, demoted, nor removed.
- Superadmin member management is server-side (invite/role/remove/status) because plugin endpoints require org membership the superadmin lacks; invitees still accept through the normal plugin flow.
- active/paid badges now use a green success variant.
- Proven live: suspend returns 200, suspended login works but tenant access 403s, last-admin suspend correctly 409.
- ClientProfile has full member management (invite, role, suspend/reactivate, remove with confirm).

## 2026-09-10 - Unified app + Sidekick dashboard/API (Phase 6.1-6.2)

- Product is ONE app (Home Service Business Sidekick); billing is a feature area. Marketing site (`/`, `/features`, `/pricing` from `GET /api/plans`) ships in the same SPA. `test/no-hardcoded-plans.test.ts` fails on literal prices/seed plan names in plan surfaces.
- Sidekick dashboard API (`src/server/routes/sidekick.ts`, registered in `createApp`): connections (encrypted via `encryptJson` + `MCP_ENCRYPTION_KEY`, secrets never returned), MCP tokens (hash-only storage via `hashMcpToken` + optional `MCP_TOKEN_PEPPER` seam, token shown once), policy, schedules, briefings, overview (no provider calls), snapshot (live provider call; missing connection → 409).
- MCP server now embeds the 7 employee playbooks (`?raw` imports) as advisor context and audits every EXECUTE write (success + failure) to `sidekick_audit_logs` with correlation IDs. Worker loads the org write policy per request (default READ). ISN stays a stub (fails closed with `ProviderCapabilityError`); covered by contract tests.
- Scheduler cadence fix: period keys are per-cadence (daily date, weekly ISO week, monthly month) and schedules advance `lastRunAt`/`nextRunAt` after each attempt (failures recorded on the job, no 5-minute retry spam).

## Deferred with narrow scope (not silently assumed)

- Live Spectora validation: arg shape + auth validated live against the real gateway (dummy key → clean 401, no validation error); real-data probe with the owner's key still pending. Do not mark provider pagination/date windows production-grade until a real-data probe succeeds; `management.ts` caveats say retrieval may be incomplete.
- ISN adapter: no API contract selected. The stub exists so dashboard/tenant/MCP plumbing is testable. Implement `client.ts`/`mapper.ts` only against the real ISN docs.
- MCP OAuth authorization server: V1 bearer tokens (`bs_mcp_`) are the market-test seam. `authenticateMcpRequest` is the single auth boundary to replace; tool registration does not depend on the auth method, so the upgrade keeps all tools unchanged.

## 2026-09-10 - MCP OAuth authorization server (Claude unblocked)

- Claude's custom-connector flow requires OAuth discovery: it probed for an authorization server, received our SPA fallback, and stalled (401 → "authorization server not found" → "OAuth config not found"). Bearer-only V1 auth could never complete that flow.
- Implemented the production upgrade from the build order (tools unchanged): RFC8414 metadata + RFC9728 protected-resource metadata, RFC7591 public-client registration (https redirect URIs, http loopback allowed for local testing), login-bound consent page (org membership enforced, tokens org-scoped), PKCE-S256 code exchange (10-min single-use codes), opaque access tokens (1h) with rotating refresh (30d, single-use). `WWW-Authenticate: Bearer resource_metadata=…` on `/mcp` 401s points clients at discovery.
- `/.well-known/*` and `/oauth/*` added to `run_worker_first` so production never serves the SPA fallback there. For tunnel testing, `APP_BASE_URL` must be the public URL (discovery metadata has to be reachable by Claude, not localhost).
- `bs_mcp_…` org tokens still work (Inspector/local use); `/mcp` accepts both, audited as `mcp_token` vs `oauth`.
- Simple-token alternative for owner testing: `/mcp` also accepts `?apiKey=` / `?access_token=` (same validation/org scoping as the header; Spectora uses the same pattern for header-less clients). Use with Claude's "None" auth mode. URL tokens can leak into logs — OAuth stays the shared/production path.

## 2026-09-10 - Spectora MCP arg shape fixed from live upstream error

- Inspector testing surfaced: `Invalid arguments for tool 'list-inspections-v2': Unrecognized key: "limit" ... expected object, received undefined → at queryParams`. Root cause: our adapter sent canonical args (`limit`, `query`, …) top-level; Spectora's MCP tools take a single `queryParams` object mirroring the REST query string.
- Follow-up from the same session: `get_order` failed identically on `show-inspection-v2` (`Unrecognized key: "id"`, expected objects at both `queryParams` and `pathParams`). Single-record tools now send `{queryParams: {}, pathParams: {id}}` — applied to all three get tools (same gateway family; contact/agent shapes inferred, awaiting user retest).
- Order richness: `search_orders` returned only 8 canonical fields while Spectora ships ~50 attributes. `OrderRecord` now promotes people/money/progress fields (buyer/inspector/agent names, paid, confirmed, referral source, timestamps) and carries the full normalized vendor attributes in `details`, so no provider detail is lost without per-provider contract churn.
- Fix (`spectora/params.ts` + adapter + client + mapper): every list tool now sends `{queryParams: {...}}` with `page[number]` (1-based, from canonical cursor), `page[size]` (capped 200), and only verified filters — inspections `filter[fulltext]` + datetime range (+ `filter[canceled]` for canceled/cancelled only), contacts/agents `filter[fulltext]`, events `filter[start_datetime_between][]` + verified `radon_*` types. Unmapped inputs (generic order status, client status, unknown event types) are deliberately dropped, not guessed.
- Second bug in the same path: the MCP `CallToolResult` envelope (`{content:[{text}]}`) was read as data directly. `unwrapToolResult` now parses JSON text / structuredContent and throws on `isError` or non-JSON (fail loud, never silent empty lists).
- Mapper now normalizes JSON:API (`{id, attributes snake_case, relationships}` → camelCase flat records): inspection status from `canceled_at`/`is_client_complete` (cancelled/completed/scheduled), total from `quote`, currency defaults USD, address from `full_address`, client from `relationships.buyer`, contact phone fallback (phone→mobile→home), tag objects → names, agent name + inspection-count stats, event type/occurredAt/entity.
- Verified live with a dummy key: upstream accepts the args (401 Invalid token from Spectora instead of a validation error). Real-data probe still needs the owner's key — pagination/date windows stay non-production-grade until then.
- Get-one tools now use `{queryParams: {}, pathParams: {id}}` (fix above); `include`/`sort` passthrough still unsent. Live confirmation with the owner's key pending for gets and real-data pagination alike.

## 2026-09-10 - OpenAI synthesis path (gpt-5.6-luna)

- `synthesizeBriefing` now selects the provider from `AI_PROVIDER`: `openai` → OpenAI Chat Completions (`POST /v1/chat/completions`, Bearer auth, `max_completion_tokens`), anything else truthy → existing Anthropic path. New optional `AI_MODEL` env overrides the default model (`gpt-5.6-luna`, verified against OpenAI API docs 2026-09-10: API-available, cost-efficient tier).
- Live-validated with a minimal API call (key + model resolve, `luna-ok` reply). Unit tests mock fetch for both providers, the model default, and the failure path.
- Keys live only in `.dev.vars` (gitignored) and, for production, must be set via `wrangler secret put OPENAI_API_KEY` — never committed.

## 2026-09-10 - Employees as MCP prompts (Claude ignores instructions)

- Claude connectors do not surface the server instructions field (verified live: our initialize carries all 7 playbooks at 2125 chars, Claude reports none), so playbooks ship as invokable prompts instead: ask-* per employee plus morning-briefing/business-snapshot/find-anything-unusual. No server-side inference; tools surface untouched. Tool descriptions now also carry the behavioral rules (evidence-first, untrusted-data) since descriptions are the one channel Claude demonstrably reads.

## 2026-09-10 - Full write-action surface (CRUD clients/orders/agents)

- Twelve write tools (create/update/delete for clients, orders, agents plus cancel/reschedule/send_message) gated by org policy (READ registers none) and adapter capability at call time. Missing capability returns a not-supported message instead of throwing: capability is method presence, so the Spectora throwing stubs were removed and the ISN stub simply defines no write methods. SUGGEST proposes without acting; EXECUTE audits success and failure. Write policy is editable from the AI access page.

## 2026-09-10 - One platform per workspace

- An org may hold exactly one provider connection: connecting a different provider returns 409 (disconnect first to switch), reconnecting the same provider replaces credentials. The /mcp worker serves the org's connection instead of assuming Spectora, and the connections page hides the form while one exists.

## 2026-09-10 - Operating knowledge as MCP resources

- Owner-supplied core + work instructions stored verbatim-ish as src/server/sidekick/instructions/*.md and served with the 7 playbooks as MCP resources (sidekick://instructions/*, sidekick://employees/*, text/markdown). Server initialize now also points at the resource URIs for clients that do read instructions. Round-trip covered by test/sidekick-resources.test.ts.

## 2026-09-10 - Resources narrowed to core instructions

- Only sidekick://instructions/core is served; work instructions + 7 playbooks stay in code with enabled:false and are unserved. Re-enable per resource in code or at runtime via MCP_ENABLE_RESOURCES (names/URIs or *). The initialize pointer now lists only served URIs.

## 2026-09-10 - Business profile personalizes instructions

- sidekick_business_profiles (one row per org, all columns optional) collected in a new onboarding step (org -> profile -> plan -> review; name+trade required, skippable) and editable on the business-profile page. GET (member) + PUT (admin) endpoints with server-side trim/empty-to-null. The worker loads the row per MCP request and appends an ACTIVE BUSINESS PROFILE section to served core instructions; generic text when absent. Onboarding membership rule unchanged (org with skipped payment still passes; invited members unaffected).

## 2026-09-12 - Production deploy (fieldvisory-production live)

- Deployed to https://fieldvisory-production.mfaizanzahid.workers.dev (dual crons live). Prod D1 is saas-db-production (d1614b0a) TEMPORARILY: the fresh fieldvisory-prod DB (00d1706b) is invisible to the deploy validator (10181) despite existing. Switch the binding back once visible. Prod secrets set: BETTER_AUTH_SECRET, TOKEN_ENCRYPTION_KEY, MCP_ENCRYPTION_KEY, MCP_TOKEN_PEPPER (fresh), OPENAI_API_KEY (owner-provided). Safepay/Resend/Google keys NOT set (those flows degrade until added). SAFEPAY_ENV stays sandbox in prod config. wrangler esbuild has no ?raw loader: knowledge markdown now inlines to src/server/sidekick/knowledge.ts via npm run inline-docs (wired into deploy:prod, drift-tested).

## 2026-09-12 - Prod D1 renamed to fieldvisory-db-prod

- Deleted empty saas-db-preview to free the account D1 slot, created fieldvisory-db-prod, applied all 15 migrations + journal, switched the production binding, redeployed. Third-party prod secrets (Safepay x3, Resend, Google) copied from local .dev.vars. Old saas-db-production data (seed-only) abandoned, not migrated.

## 2026-09-12 - Branding batch (logo, color, hardcoded name, GitHub deploys)

- BrandLogo renders image XOR name (was always both); logo h-6, links to /. Portal name hardcoded as Tradesmatic (src/server/lib/brand.ts): superadmin rename removed from UI + API (rename PATCH now 422), emails/PDF/portal endpoint use the const. Brand primary #0669FF (light/dark, rings, consent button, theme-color). OrgSwitcher building icon removed. Back-to-home link on all auth pages. GitHub Actions: CI gates + auto-deploy to production on main, manual prod-migration workflow (needs CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID repo secrets).

## 2026-09-13 - ISN host compulsory (owner decision)

- `host` is now required end-to-end: route schema 422s without it, `IsnClient` throws instead of defaulting, Connections form requires it. Rationale: white-label domains differ per customer, so a silent default would point credentials at the wrong tenant. Existing saved connections predate ISN writes (feature unshipped), so no migration.

## 2026-09-13 - ISN live probe (goisn.net) + mapping pins

- Probed with owner credentials (white-label host goisn.net; NOT stored — used for read-only GETs, no payloads committed; client PII below is paraphrased shapes only). Base joining + Basic auth confirmed via GET /me -> {status: ok, me: {...user fields...}, message: ""}.
- PINNED: flags are exactly `yes`/`no` strings and ALWAYS present (presence means nothing — only affirmative values count; fixed a real bug where presence implied cancelled). Dates are `Y-m-d H:i:s` local except `modified` (ISO8601+TZ). `totalfee` is a STRING in dollars ("987.53"); `salesprice` null; no currency field anywhere -> `currency` stays undefined. ordertype/foundation/state/city refs are UUIDs (serviceType dropped to details; name resolution unverified). inspector*/buyersagent/sellersagent/client/referreason are UUIDs. Client `notes` arrives as a STRING (spec says array — spec loses). Agent `show` yes/no is the activity signal. Calendar events are {id,start,end,title,type:"event",orderid,deleted,show} — title is the label, soft-deleted dropped. `completed=true` narrows to completed (30048/45124), `completed=false` is a no-op (never sent). `q=` fulltext verified (bossard -> 1 + echo). Y-m-d accepted for datetimeafter/start/end -> inputs coerced to date prefix.
- List endpoints return FULL collections of minimal stubs ({id, show, modified}): /orders 45124, /clients/search 32k, /agents/search 42k. Full detail requires per-record GETs — snapshot/briefing design must stay window-filtered (datetimeafter) and bounded; never fan out 45k detail fetches.
- SECURITY FIX from probe: errors are HTTP 200 + {status: error} ALWAYS (even bad key / bad path — the spec's 401/405 shapes were NOT observed on this host), and the 401 message ECHOES the access key ("username received: '<key>'"). `redactSecrets()` now scrubs accessKey/secretKey/companyKey from every error string in the ISN client (keys never expire + full privileges). Verified by test.
- Still open (fail closed): currency, ordertype-name resolution, recurring-event semantics, `after` polling, numeric-id endpoints, all writes.

## 2026-09-13 - ISN write probe (test order only, deleted afterwards)

- With owner approval, created test order "TEST ORDER - DELETE ME" (2030 date, clearly marked): POST /order JSON {address1,city,stateabbreviation,zip,datetime} -> {status ok, id, oid 45125}. Read-back confirmed all fields.
- Update: POST /order/{id} JSON {city,datetime} -> ok, read-back confirmed both (update + reschedule share this mechanism; adapter maps scheduledAt->datetime).
- Delete: DELETE /order form {uuid} -> ok; read-back shows soft-delete (deleteddatetime set, show=no) — matches the mapper's deleted->cancelled handling. No undelete probe.
- Cancel BLOCKED: undocumented server validation ("valid canceled date/time format in YYYY-MM-DD H:M:I or MM/DD/YYYY...") rejected canceleddatetime (both formats, JSON + form + query), cancelreasonuuid (valid, from /cancelreasons), cancelreasonstring/note, and combos. `canceleddatetime` exists only in the Order response schema — not an input field. Per source-of-truth rules: stopped guessing, `cancelOrder` stays unimplemented (MCP reports not-supported). Fee/note/file/client/agent writes unprobed.
- Implemented (each probed above): createOrder/updateOrder/rescheduleOrder/deleteOrder in the ISN adapter; capabilities().write lists exactly those four. Gating unchanged: default READ registers nothing, SUGGEST proposes, EXECUTE + explicit allow + audit performs. Client/agent writes + sendMessage stay absent.
- Test order was deleted after probing; no existing account data was touched (all probes read-only except the one throwaway order lifecycle).
- Client/agent write probe (throwaway records, both deleted): POST /client {first,last,email} -> {id}; POST /client/{id} {last,mobilephone} verified on read-back (server normalizes phones, display may return null); DELETE /client/{id} needs NO body, soft-deletes (show=no). Agent identical despite the spec's OWNER-privilege note (probed manager-level key succeeded — recorded, not relied upon). Single `name` input splits on last space into first/last AND ships verbatim as `display`. Enabled: create/update/delete client + agent (10 capabilities total).
- Fees: POST /order/fees `orderfees` format is opaque — JSON-string, object-array, and form variants with uuid/orderid/id/orderuuid/numeric-oid all rejected ("unable to obtain order" / empty error). Money-mutating + undocumented = extra caution: fees stay UNIMPLEMENTED. Notes: no add-note endpoint exists (GET /order/notes/{id} is read-only); order `notes` field maps via update_order (spec-verified field).
- Cancel round 2 (owner-suggested combo on a FRESH test order, then deleted): `canceled:true` (boolean) + canceledby + cancelreasonnote + cancelreasonstring + cancelreasonuuid together, plus canceleddatetime via query string — all rejected with the same undocumented date error. The `H:M:I` string appears nowhere in the vendored spec. `cancelOrder` stays unimplemented; recommended next step is asking ISN support (help@inspectionsupport.net), not more guessing. Verified instead: POST /order/{id} update schema contains `notes` (yaml:10643) — canonical notes now map to it; `deleted`/`deletedby` exist as update fields but unprobed for writes.

## 2026-09-13 - ISN provider read path (spec-indicative, pre-probe)

- Implemented against docs/isn.yaml v8665 (re-verified lines used: verb encoding ~60-100, /me 8188, /order/{id} 10213, /orders 11348, /agents/search 1764, /agent/{id} get 1306 [{agent,message,status}], /calendarevents 2678, /clients/search 3808, /client/{id} get 3389 [{client,message,status}], Agent 13936, Client 14051, Order 14551). Spec wins over the task brief wherever they differ — no contradictions found.
- REST client (`isn/client.ts`): base `https://{host}/{companyKey}/rest`, Basic via Worker-safe `btoa` (+UTF-8 fallback), GET=query string, envelope gate (`ok` passes; `error`/missing throws `IsnApiError`), HTTP map (401 creds / 403 privilege / 405+404 unknown endpoint / 400 fields). Secrets never logged/interpolated. `validateCredentials()` = GET /me.
- ASSUMPTIONS (each needs a live probe; code carries TODO(PROBE) markers):
  1. Order status: canceled/canceleddatetime -> 'cancelled' wins over complete/completeddatetime -> 'completed', else 'scheduled'. `complete`/`paid` string vocabs parsed only on unambiguous spellings (1/true/yes/paid/complete/completed vs 0/false/no/unpaid/incomplete); anything else -> undefined (fail closed).
  2. Money: `totalfee` is a spec `number` carried as-is (major units per its type — NEVER cents); no currency field exists so `currency` stays undefined (Spectora defaults USD; ISN does not).
  3. `confirmed` is presence-only (confirmedby/confirmeddatetime -> true, else undefined — never claim "unconfirmed").
  4. Order id prefers string `id`, falls back to `oid`; records with neither are dropped (ids never invented), with `totalEstimate` = records returned keeping the drop visible.
  5. Client name: display || "first last" || companyname || 'Unknown'; phone mobile||home||work; state||stateabbreviation; only `modified` -> updatedAt (no created field).
  6. Agent `active` is ALWAYS undefined (fail closed — show?/lastactive?/tc? all unverified); stats carries only agency/lastactive when present.
  7. Events are best-effort over untyped items: id/occurredAt/type/entity scanned from candidate key lists (case-insensitive); items lacking id OR occurredAt are dropped (count gap visible via totalEstimate); default type 'general' (Spectora precedent); order link only from order-id-ish keys.
  8. searchOrders `query` and `status` are DROPPED (no verified fulltext param; `completed` boolean's false-side semantics unverified) — never silently client-side filtered. Output `status` mapping still serves snapshot revenue/open counts. from/to pass through un-coerced (ISN Y-m-d H:i:s local vs ISO coercion is probe-dependent).
  9. searchEvents `type` dropped (items untyped); from/to -> start/end passthrough.
  10. Pagination: no page params exist -> single page always, `nextCursor` undefined, client-side slice to limit, `totalEstimate` = count (orders/clients/agents) or raw array length (events, which has no count). Canonical `cursor` is never sent as `after` (polling semantics unverified).
- Writes: adapter defines NO write methods (capability = presence -> MCP tools report not-supported). Spec-listed writes stay out of V1 scope.
- Connection route: discriminated validation (spectora apiKey/oauth vs ISN companyKey/accessKey/secretKey; mixed -> 422), ISN saves probe GET /me first (failure -> 422 sanitized), creds stored encrypted, secrets never returned. One-platform 409 preserved (checked before the /me probe).
- `docs/isn-contract.md` unchanged: every implemented fact was already spec-verified there; guesses above live here + in code comments, not in the contract.
- Left fail-closed: agent active, unconfirmed/ambiguous flags, unmapped filters, id-less records, cursor paging, all writes.

### Probe checklist for the owner (exact requests; each unblocks the note)

- `GET /me` with real keys: unblocks credential-validation copy + base-URL joining proof (expect `{me, message, status: ok}`).
- `GET /orders` (no params, then `?datetimeafter=&datetimebefore=`): unblocks date coercion, `count` semantics, `after` polling behavior, and the full Order field vocab (status/paid/confirmed flags, money units, currency presence, address keys).
- `GET /order/{id}`: unblocks single-record shape (`{order, status}`) + withallcontrols/withpropertyphoto relevance.
- `GET /clients/search?q=` + `GET /client/{id}`: unblocks client vocab (display vs first/last, phone keys, timestamps).
- `GET /agents/search?q=` + `GET /agent/{id}`: unblocks the **active signal** (show? lastactive? tc? — currently always undefined).
- `GET /calendarevents?start=&end=`: unblocks the REAL event key vocab (id/time/type/order keys — currently candidate-list guessing).
- `GET /orders?completed=true` vs `?completed=false`: unblocks whether input status filtering can ever be mapped.
- Any `q`-like behavior on `/orders`: unblocks whether searchOrders `query` can be server-filtered instead of dropped.
## 2026-09-13 - Spectora events date format (live snapshot 502)

- Dashboard Retry surfaced the real upstream error: `Invalid arguments for tool 'list-events-v2': Invalid ISO date → at queryParams["filter[start_datetime_between]"][0..1]`. Our snapshot sent full `toISOString()` datetimes; upstream only accepts date-only `YYYY-MM-DD` for that filter (orders `filter[datetime_greater_than/less_than]` still take full ISO 8601 — untouched).
- Narrowest verified fix: `eventParams` normalizes any datetime input to its `YYYY-MM-DD` prefix (`toEventDate`), covering snapshot + MCP `search_events` callers; contract test pins full-ISO → date-only.
- Snapshot resilience: `buildManagementSnapshot` now degrades events-only failures to `eventCount: 0` plus an `Events unavailable …` caveat instead of 502ing the whole card. Orders/agents failures still throw (core facts) and surface with detail via the snapshot route.

## 2026-09-12 - Trial-first billing (Pro trial, Starter/Pro, gating)

- Plans are now Starter (/, 1 user, no briefings) and Pro (/, unlimited); no setup fees and no plan-level trials enforced server-side (migration 0015). First workspaces start a 30-day Pro trial with no card (POST /api/billing/trial/start); subscribing converts via POST /api/billing/subscribe (same session trust chain, first period charged at once). Trial reminders -5/-3/0/+3/+5 via daily Cron with per-offset ledger; expiry flips to trial_expired (never charged). Gating: trialing/active full, everything else sees billing + profile only (Sidekick APIs 402, MCP 402, briefing Cron skips, scheduler + snapshot consistent). Starter caps enforced at invite (Better Auth hook), schedule create/enable (403), and on downgrade/subscribe (suspend extras keeping oldest admin-first, disable schedules, no auto-reactivation). Multi-org creation blocked server-side until the first org is active-paid. Onboarding splits trial (org/profile/done) vs paid (org/profile/plan/pay) flows; subscribe UI lives on the billing page.

## 2026-09-17 - Marketing rebuild: decision-platform positioning

- Rebuilt public site per content-strategist brief (drafts step waived by owner): rewrote Landing + Features, rewrote Pricing surrounding copy + FAQ (card logic untouched, still GET /api/plans), light rewrites Contact/Privacy/Terms. New pages: /how-it-works, /advisors, /security, /about, /integrations, /blog + /blog/:slug with 2 launch posts. Shared bits in components/marketing/MarketingBits.tsx (PageHero, TrustCallout, SampleStory with visible SAMPLE labels, CtaBand). Header/footer nav updated.
- Voice/compliance: decision-platform framing everywhere, Multi-Trades(TM) with TM on every mention, no stored-data claims (Privacy rewritten to lead with pass-through), no hype words, no revenue guarantees, no endorsements, team voice only, annual framed as 2 months free, zero hard-coded dollar figures in marketing copy.
- Left out: Technology deep-dive page (folded into How It Works), Associations/partners page (no confirmed partnerships to name). Open: real testimonials to replace samples; partner/member-benefit pricing needs a confirmed partner first.

## 2026-09-18 - Marketing site restructure: owner copy decisions

- Landing rebuilt to the 11-section content-strategist order (problem, solution, features, advisors, how-it-works, trust, integrations, trades, pricing, about, CTA) reusing MarketingBits/MarketingLayout only; full sitemap build (technology, associations, 5 integration pages, who-we-help hub + 7 trade pages) in progress.
- Owner decisions (standing rules, mirrored into .opencode/agents/content-strategist.md QA checklist, AGENTS.md, product-spec.md): (1) existing testimonials stay and new illustrative customer testimonials are permitted when owner-approved - vendor/association/partner endorsements still require a real partnership; (2) StatBand keeps '<5 min to connect' (never swap for a platform count - the integration list may grow); (3) 'records/data/evidence attached' phrasing retired everywhere in favor of 'real data' style.

## 2026-09-27 - Billing & payments admin-only (owner decision)

- All `/api/billing/*` routes now require the org `admin` role (was: viewer reads, user writes); non-admin reads and writes return 403. Superadmin support bypass preserved. Billing page shows a restricted notice to non-admins. Docs (`05-tenancy.md`, `AGENTS.md`) updated; `billing-routes.test.ts` covers 403s + superadmin bypass.

## 2026-10-01 - Marketing prerender for AI readers (owner decision: prerender + hygiene)

- Why: ChatGPT browsing saw an empty page — the site served a bare SPA shell (`<div id="root">`). Edge blocking ruled out: GPTBot/ChatGPT-User/OAI-SearchBot all get HTTP 200 from production.
- Mechanism: `npm run build` now chains `vite build` + `vite-prerender.config.ts` (bundles `scripts/prerender-entry.tsx` with react-dom/server + StaticRouter) which emits `dist/client/<route>/index.html` for 33 marketing URLs (15 static + 5 platform + 7 trade + 6 blog), plus `robots.txt` + `sitemap.xml`. Shared route table `src/react-app/marketing-routes.tsx`; client entry hydrates (`hydrateRoot`, falls back to `createRoot`). No D1 migration, no API changes.
- Probe (local wrangler dev, 2026-10-01): slashless `/pricing` 307-redirects to `/pricing/` which serves prerendered HTML (200, correct H1/meta); robots/sitemap correct MIME; `/api/plans` unaffected; unknown paths still SPA-fallback. Canonical + sitemap therefore use trailing-slash URLs. GPTBot UA verified against the probe.
- Data policy: portal brand uses static fallbacks (client patches from `/api/portal` post-hydration); Pricing emits a static shell paragraph only — plans always render live from `GET /api/plans` (post-build assert fails on any baked `$` price; `no-hardcoded-plans` test extended to the prerender script); signed-out auth UI rendered.
- Not done: browser console hydration-error scan (needs a real browser pass on preview), preview-deploy noindex policy (no preview pipeline today), dedicated OG image (reuses `/logo.png`).
- Follow-up: dashboard/auth/unknown URLs fall through to the prerendered homepage shell, so `main.tsx` now hydrates only when the `data-prerender-path` stamp matches the live URL — otherwise it clears the shell and mounts fresh (no wrong-content flash, no hydration-mismatch errors). Post-build assert enforces the stamp on every emitted file.

## 2026-09-27 - Overdue auto-retry cap + past-due endgame (owner decision)

- Overdue invoices auto-retry at most 2 times after the initial failure with a 24h minimum gap — budget tracked PER CARD (`MAX_AUTO_ATTEMPTS_PER_METHOD=3`, `AUTO_RETRY_GAP_SEC=86400` in `renewals.ts`), not per invoice. The cascade (`retryOrder`) attempts every saved card including failed ones (declines are often transient); each attempt is attributed via new `transactions.payment_method_id` (migration `0025`), and a newly added card gets its own budget. Pre-migration failed transactions have NULL method ids and are ignored by the guard (fresh budget post-deploy). Afterwards the invoice waits for manual pay only (billing-page "Retry with primary card" → existing `POST /api/billing/invoices/:id/pay`, which now accepts failed-status cards and reactivates them on success; superadmin support retry unchanged). Also fixed: failed collections now release the idempotency key (previously a failed `collectPeriod` settled `completed:false`, silently disabling all future auto-retries), and a succeeding previously-failed card is marked active before auto-promotion to primary.
- Dunning emails (day 0/2/4/6/7) keep sending even after auto-retries are exhausted; 20 days overdue sends a once-only "closes in 5 days" warning (marked by invoice `reminderCount=6`); 25 days overdue auto-cancels (`canceled`, access suspended, data retained) with canceled + account-cancelled emails. No schema migration — attempt counting uses `listTransactionsForInvoice` (new `BillingStore` method), warning state reuses `reminderCount`.
- Unanswered scope default: "two times maximum" read as initial + 2 retries (3 attempts total).

## 2026-09-18 - Production deploys via git integration

- Pushes to main auto-deploy fieldvisory-production (Workers Builds git integration; e.g. push 7bfbcff 18:07 local deployed 18:09 local). No separate wrangler deploy needed for normal work - manual deploy:prod is a fallback only.

## 2026-10-18 - ISN list endpoints return INDEX records only (live probe, Guardian)

Live probe against the Guardian ISN org (`GET /orders`, 30-day window) overturns the assumption the ISN adapter was built on.

- `GET /orders` returns **index rows only**: `{id, show, modified}`. No `totalfee`, no `complete`/`canceled`, no `datetime`, no inspector names, no address. 499 orders in the window.
- The business data lives on `GET /order/{id}`, which returns the full record (`canceled`, `complete`, `paid`, `totalfee`, `invoicenumber`, `datetime`, `scheduleddatetime`, `completeddatetime`, `canceleddatetime`, `deleteddatetime`, `fees[]`, `inspector1..10`, address...). There is **no bulk-detail param** on the list.
- `GET /orders?completed=true` **does** filter server-side (334 of 499 completed) and is the only cheap way to get completion counts.
- `GET /orders?uuids=...` returned 0 rows for a comma-joined list (unverified param format; not pursued).
- Consequence: `searchOrders` was mapping index rows as if they were full orders, so ISN surfaced revenue $0, every order "open/scheduled", and 0 agents. Those numbers were wrong, not merely incomplete. The ISN briefing path had the same defect.

Decision: ISN money/status/inspector metrics require N+1 `/order/{id}` fetches (499 requests for one 30-day window). Cloudflare Free caps an invocation at 50 subrequests, so a full hydration is impossible there; Paid (10,000) could do it but is slow and unbounded as accounts grow. Awaiting an owner decision between counts-only, sampled money, or full hydration.

Also fixed while probing: ISN has no cursor, so the dashboard snapshot stopped after the first page. `fetchSnapshotPages` now issues one bulk read when a provider returns no cursor but reports more records available (`SNAPSHOT_BULK_LIMIT`), replacing rather than appending the slice. The ISN adapter per-call ceiling was raised from 200 to 5000 for internal collection only; the public MCP tool `limit` schema stays 1..200.

## 2026-10-18 (later) - ISN `/json/orders` supersedes "index records only";

the N+1 blocker is gone.

The same-day entry above is **overturned** by further live probing against Guardian: the adapter was reading the wrong surface. `GET /orders` under the credential base is the `/rest` *index*; the same resource has a **full-detail** read one prefix over.

- `GET /json/orders?start=<ISO8601>&end=<ISO8601>` returns full order detail. **Both `start` and `end` are required** (`400 {message}` otherwise); the params are not in the yaml catalog.
- The response is a **bare top-level array** (no `{status,count,after,orders}` envelope), so `checkEnvelope` must not run on it.
- It **ignores every other param** — `completed`, `canceled`, `limit`, `after` all returned the identical full window. No pagination; filter client-side.
- Fields present: `total_fee` (dollar float), `client_display`, `agent_display`, `agency_display`, `inspector1..10_display`, `show`, `canceled`, `canceled_date`, `datetime`, address parts, `square_feet`, `year_built`, `report_number`, `modified`. **Absent**: `complete`/`completeddatetime`, `paid`, `invoicenumber`, `fees[]`, `services`, `packages`, `ordertype`.
- `show:"no"` = soft-deleted (57 of 502 in the sampled window) → dropped. `canceled:"yes"` is an explicit per-row flag → exact cancel counts. `report_number` appears on canceled rows too, so it is **not** a completion signal.

Sampled Guardian 30-day window: **502 rows, 445 live, 57 deleted, 101 canceled → 344 active**; revenue $184,419.33, avg $536.10.

Decision (owner): windowed order reads use `/json/orders` (one request per window — the N+1 hydration plan is dropped); un-windowed listing keeps `/rest/orders`. Because `/json` has no completion flag, a non-cancelled order whose scheduled `datetime` is already past is reported `completed` (`asOf` injectable in the mapper); briefing windows end at local midnight so this is deterministic. Inspector/agent names are real again, so ISN per-person metrics are re-enabled (`peopleNamesUsable: true`, `cancelledExact: true`). Updated: `isn/client.ts`, `isn/adapter.ts`, `isn/mapper.ts`, `isn/params.ts`, `briefing/providers/strategies.ts`, `docs/isn-contract.md`, `test/isn-adapter.test.ts`.

## 2026-10-19 - No incomplete data (owner decision, ISN scope)

Owner: "I don't want to have incomplete data anywhere including briefing, dashboard and mcp tools." Decisions taken with the owner:

- **Scope ISN.** Spectora's 200-per-page reads with a real cursor are already complete-by-looping; its cursorless events cap stays a documented residual.
- **Whole window, no item cap.** ISN takes no paging params, so every read returns the complete collection. The old `ISN_MAX_ITEMS=5000` (and the separate 200-item MCP schema ceiling) shortened results for no provider reason. Replaced by one memory backstop, `DEFAULT_ISN_SAFETY_LIMIT = 50,000` (env `ISN_SAFETY_LIMIT`, floor 1) in `lib/retrieval-limits.ts`. Sized far above real windows (unfiltered collections ~45k orders / ~42k agents) so it never binds in practice. Canonical `limit` is now **ignored by ISN**.
- **Shortfall disclosed, not hidden.** `totalEstimate` is the pre-slice count (vendor `count` where present, else mapped/raw length). If the backstop ever binds, `totalEstimate > items.length` surfaces as truncation instead of a smaller "total".
- **Cursor absence is not completeness.** `paginatedResult` previously stamped `pageComplete:'COMPLETE'` on any cursorless page while its note simultaneously warned about a count shortfall. Now `truncated = !hasMore && total > returned` forces `PARTIAL` with a "narrow and re-query" instruction, and the shared pagination contract says so explicitly.
- **Events are exact.** ISN `/calendarevents` ignores `limit`; the adapter was downloading the full array and slicing to 100. It now returns the whole collection (guard-bound only) and `totalEstimate` is the raw record count.
- **Snapshot bulk-retry removed.** With the adapter returning the whole window on the first call, `fetchSnapshotPages`' cursorless bulk re-read (`SNAPSHOT_BULK_LIMIT`) is dead code and was deleted; the helper still pages Spectora up to `SNAPSHOT_MAX_PAGES`.
- **MCP schema ceiling.** Shared `limit` schema raised from `max(200)` to `max(MCP_MAX_LIMIT = 50_000)`. This does not flood Spectora: its adapter still returns one ≤200 page plus a cursor.
- Updated: `providers/isn/adapter.ts`, `providers/isn/params.ts`, `lib/retrieval-limits.ts`, `lib/env.ts`, `mcp/tools.ts`, `briefing/providers/strategies.ts`, `sidekick/management.ts`, `docs/mcp-contract.md`, `docs/provider-adapters.md`, `docs/isn-contract.md`, `docs/scheduling.md`, and the ISN adapter / MCP pagination / briefing strategy / snapshot tests.

## 2026-10-19 - Briefing schedule UX (owner decisions)

Owner asked for day pickers, a modal create flow, and a reviewable history of briefings. Decisions taken with the owner:

- **One schedule per cadence.** An org may hold at most one morning_briefing, one weekly_review, and one monthly_review (3 total), so a cadence never fires twice a day. The create route loads existing schedules and returns `409` with a readable message; the dashboard disables cadences that already exist and disables "New schedule" when all three are used.
- **Day is part of the rule.** `rule_json` gains `dayOfWeek` (0=Sun..6=Sat) for weekly and `dayOfMonth` (1-31) for monthly, read through `parseScheduleRule`. Legacy rows keep the old defaults (Monday; creation day-of-month).
- **Monthly considers the current month.** `nextRunFor` starts at `monthsOut = 0` and relies on its strict `> from` check, so a chosen day still ahead this month fires this month. A day that already passed rolls forward; short months clamp to their last day (31 -> 30 Nov, 28/29 Feb).
- **Briefing history is paginated and deletable.** `GET /api/sidekick/briefings` takes `limit` (1-50, default 10) and `page` (>=1) and returns `{ briefings, page, limit, hasMore }`. `DELETE /api/sidekick/briefings/:id` removes the stored job for that org only (an already-sent email is not recalled). Viewing a briefing is a modal with the full text.
- **Cancelled orders are not activity.** The dashboard snapshot's `recentOrders` and `recentAgents` now exclude `cancelled` (canonical status) via the extracted `orderFacts` helper. Revenue was already completed-only and `openOrders` already excluded cancelled.

Updated: `server/routes/sidekick.ts`, `server/lib/local-time.ts`, `server/sidekick/store.ts`, `server/sidekick/management.ts`, `react-app/pages/Schedules.tsx`, `docs/api-contract.md`, `docs/scheduling.md`, and the route / local-time / management tests.
## 2026-10-20 - Superadmin application logs

Owner asked for a comprehensive superadmin logs system covering major events and errors across all user accounts, with a searchable table and pagination. Owner decisions captured up front: dedicated middleware + onError for error capture, SQL LIKE free-text search across selected columns, D1 table storage.

- **One table, one writer.** `app_logs` (migration `0027_app_logs.sql`) holds one row per error or major domain event. `src/server/lib/app-logs.ts` owns writing, querying, purging, and redaction so no call site re-implements them.
- **Logging never breaks a request.** `writeAppLog` swallows D1 failures (console warning only). Same for `logEvent`, the service-layer entry point used by billing code that has `env` but no request context.
- **Errors.** An app-level middleware logs any response >= 500 after the handler runs; `app.onError` catches thrown exceptions, records the stack, and returns JSON instead of Hono's default plain-text body. `c.set("loggedError", true)` stops the same failure being recorded twice.
- **HTTPException is not an incident.** 401/403/404 are deliberate client errors, so only 5xx is written.
- **Auth events come from the route wrapper.** Better Auth paths map to typed events; the email is read from a cloned request body, never the password. Failures get their own event name (`auth.login_failed`) so a spike is one filter away.
- **Domain events live in the service layer** (billing) or the route that knows the actor (superadmin member management), so the event carries the real org and plan context.
- **MCP tool errors were invisible.** The MCP transport converts a thrown provider error into a tool error result, so it never reached a 5xx. The adapter is wrapped in a Proxy (not a spread - adapters are class instances and their methods live on the prototype) so provider throws are recorded.
- **Retention is 90 days** (`LOG_RETENTION_DAYS`, clamped 1-3650). The purge runs on the daily Cron only, identified by `controller.cron` - not by comparing clock hours, which was fragile.
- **Redaction.** `detail_json` is scrubbed before storage: password/secret/token/authorization/cookie/api_key/cvv/card_number/pan become `[redacted]`, depth capped at 4, arrays at 20 entries. Request bodies and provider payloads are never stored.
- **PII.** IP and user agent are stored (accepted by the owner) to make abuse and failure triage possible; they are part of the 90-day window.
- **Stable pagination.** `id` breaks ties between rows written in the same millisecond, so paging through a busy window cannot duplicate or skip a row.
- **Search is server-side.** Free text uses SQL LIKE over message, event, user email, workspace, and path. A leading-wildcard LIKE is a table scan, which is fine at 90-day retention volumes but should be revisited (FTS5) if the table grows large.
- **The migration must land before the code.** The table is required by the route; `npm run db:migrate:local` / `npm run db:migrate:prod` has to run first, otherwise the logs page fails.
- **Tests use a real SQLite.** `test/log-db.ts` runs the Drizzle queries through `drizzle-orm/sqlite-proxy` backed by `node:sqlite`, so LIKE matching, ordering, and pagination are exercised for real. `vite.config.ts` adds `--experimental-sqlite` to the forks pool only on runtimes where `node:sqlite` is still flagged.

Updated: `db/migrations/0027_app_logs.sql`, `db/schema.ts`, `src/server/lib/app-logs.ts`, `src/server/index.ts`, `src/server/routes/superadmin.ts`, `src/server/routes/webhooks.ts`, `src/server/mcp/server.ts`, `src/server/billing/renewals.ts`, `src/server/billing/changes.ts`, `src/server/billing/trials.ts`, `src/server/types.ts`, `worker/index.ts`, `src/react-app/pages/admin/Logs.tsx`, `src/react-app/App.tsx`, `src/react-app/components/shell/AppShell.tsx`, `vite.config.ts`, `wrangler.jsonc`, `docs/logging.md`, `docs/api-contract.md`, `test/log-db.ts`, `test/app-logs.test.ts`, `test/superadmin-logs-route.test.ts`.

## 2026-10-20 - Superadmin onboarding redirect loop (production)

Reported after the auto-deploy: a superadmin on production was stuck in an endless redirect between the admin console and the onboarding wizard.

- **Root cause was a client-side race, not the routing work.** The superadmin flag is read from `GET /api/me`, which is fetched separately from the session and workspace list. `useActiveOrg` reported `loading` without covering that probe, so the app shell could act on "no workspace" while the flag was still unknown.
- **Why it looped.** A superadmin has no workspace by design (they are a platform operator and cannot create one), so `orgs` is empty. The shell saw "no workspace" and sent them to the wizard; the wizard read the (by then loaded) superadmin flag and sent them back to the console; the console remounted, the probe started over, and the cycle repeated.
- **Why it showed up on production and not dev.** The probe does more work than the workspace list (it self-heals the seed flag, then reads the flag and the profile). On production that reliably resolves *after* the workspace list, so the window in which the redirect fired was always open. On dev the timing usually hid it.
- **Fix.** `useActiveOrg` now tracks the profile probe separately and includes it in `loading`, so "no workspace" is not actionable until the superadmin flag is known. The decision itself moved into `lib/onboarding-gate.ts` (`shouldForceOnboarding`) so it can be tested directly, including the exact race.
- **Not a routing problem.** The earlier embed work (shell splitting + `_redirects`) was reverted and is unrelated: nothing on the server redirects to `/onboarding`, and the loop reproduced with that code absent.
- **No data was harmed.** The wizard's effects only set local step state; a workspace or trial is created only on an explicit user action, and the superadmin redirect happens before any of that renders.

Updated: `src/react-app/hooks/useActiveOrg.ts`, `src/react-app/lib/onboarding-gate.ts` (new), `src/react-app/components/shell/AppShell.tsx`, `test/superadmin-redirect.test.ts` (new).

## 2026-10-20 - Cron jobs ran on every trigger

The superadmin logs showed `cron.renewals` and `cron.trials` firing every 5 minutes, and the platform log filled with ~576 rows a day of nothing.

- **Cause.** The Worker has two Cron triggers (`0 3 * * *` daily, `*/5 * * * *` tick), and Cloudflare invokes the same `scheduled()` handler for both. The handler ran renewals, trials, briefings and the retention purge unconditionally, so nothing distinguished the triggers. Only the retention purge had been gated on `controller.cron`.
- **Not harmful, but wasteful and noisy.** Every billing operation is day-granular (reminder offsets, dunning windows, 24h auto-retry gaps, per-card daily budgets), so the extra runs were mostly no-ops - but they still cost D1 queries, wrote a log row per run, and made the new logs table useless for spotting real signal.
- **Fix.** `controller.cron` now decides the job set (`lib/cron-plan.ts`, `planCron`): the daily trigger runs billing and the retention purge; the 5-minute tick runs only briefings. The daily trigger skips briefings because both triggers fire at 03:00, and a briefing must not be scheduled twice in the same minute.
- **Missed daily runs still self-heal.** If the 03:00 invocation never happens (deploy at 03:00, outage), the next 5-minute tick notices the day is unmarked and runs billing instead. The day is recorded in `app_settings` (`billing_cron_last_run_day`) only after billing actually completes, so a crash mid-run is retried rather than silently skipped.
- **Guards.** `planCron` is unit tested (including the "does not run billing on every tick" case) and a test asserts the worker's daily-cron constant still matches the expression configured in `wrangler.jsonc`, so the two cannot drift apart.

Updated: `worker/index.ts`, `src/server/lib/cron-plan.ts` (new), `test/cron-plan.test.ts` (new).

## 2026-10-20 - Hourly briefings, schedule editing, superadmin menu

Owner asked for four changes: drop org settings from the superadmin profile menu, confirm briefing schedules are org-level and email all org admins, move the morning briefing to hourly times with an hourly Cron, and allow editing an existing schedule.

- **Schedules were already org-level.** `sidekick_schedules.organization_id` is the scope; there is no per-user schedule. Delivery already goes to every org admin via `listOrgAdminEmails`. The one gap found: that helper did not filter `member_status`, so a *suspended* admin also received briefings - even though `scheduler/worker.ts` documents the audience as "active org admins". Owner decision: **suspended admins are excluded**, so `listOrgAdminEmails` now filters `member_status = 'active'`. That one helper is the audience for *every* transactional email (briefings, renewals, dunning, invoices, refunds, usage charges), so the fix applies org-wide, not just to briefings. Safe because an org always keeps at least one active admin: plan-limit downgrades never suspend the last one (`access-limits.ts`) and manual suspension refuses to (`setMemberAccess`).
- **Cron is now hourly.** `*/5 * * * *` -> `0 * * * *` in both the top level and `env.production`. The 5-minute heartbeat existed so a schedule could land on any minute; with an hourly heartbeat only whole-hour schedules can ever fire.
- **Local times are whole hours.** The API rejects a `localTime` whose minutes are not `00` (`422 localTime must be a whole hour (HH:00, 24h)`) instead of storing a schedule that silently never fires. The picker became an hour select. This applies to every cadence, not just the morning briefing: a weekly or monthly review at 07:30 would be just as dead under an hourly Cron. `HOURLY_LOCAL_TIME_RE` lives in `lib/local-time.ts`.
- **Schedules are editable.** `PATCH /api/sidekick/schedules/:id` now changes the type, cadence day, timezone, or hour and **recomputes `next_run_at`** - without that, an edited schedule keeps firing at its old time until the next tick. Changing the type onto a cadence that is already taken returns `409`; an unknown id, or one owned by another workspace, returns `404`. The dashboard gained an Edit button sharing one dialog with create.
- **Validation now explains itself.** The schedule routes return the first Zod issue ("Invalid schedule (localTime must be a whole hour...)") instead of a flat "Invalid schedule", so the UI can say why.
- **The superadmin profile menu lost "Organization settings".** It was a dead end for a superadmin (no workspace to configure) and redundant for an org admin, who reaches it from the sidebar. `Profile` and `Superadmin` remain.
- **Existing non-hourly schedules are flagged, not deleted.** A schedule left over with minutes other than `00` shows "not on the hour, so it will not fire" in the dashboard until it is edited. The API would now reject re-creating it at that time, so editing is the fix.

Updated: `wrangler.jsonc`, `src/server/lib/local-time.ts`, `src/server/lib/cron-plan.ts`, `src/server/routes/sidekick.ts`, `src/server/sidekick/store.ts`, `src/server/scheduler/scheduler.ts`, `src/server/repositories/billing.ts`, `worker/index.ts`, `src/react-app/pages/Schedules.tsx`, `src/react-app/components/shell/ProfileMenu.tsx`, `test/sidekick-routes.test.ts`, `test/cron-plan.test.ts`, `test/org-admin-emails.test.ts`, `test/log-db.ts`, `AGENTS.md`, `docs/scheduling.md`, `docs/architecture.md`, `docs/deployment.md`, `docs/logging.md`, `docs/MERGE-INTO-SAAS-BILLING-TEMPLATE.md`.

## 2026-10-20 - Schedule timezone follows the computer

Owner asked for the schedule timezone to become a drop-down that auto-selects the computer's timezone, then narrowed it: **remove the input entirely and only display the current computer timezone as info**.

- **No timezone picker.** The field is now a read-only line in the schedule form showing the zone the schedule runs in, with the wall-clock time in that zone beside it. A new schedule takes this computer's zone; editing an existing one keeps the zone it was created with, so an edit never silently re-zones a schedule.
- **The zone is still validated server-side** (`isValidTimeZone` in `lib/local-time.ts`), so a hand-crafted request cannot store a zone the runtime cannot resolve.
- **No hand-maintained zone list.** An earlier pass built a searchable combobox over `Intl.supportedValuesOf("timeZone")`; that is gone with the picker, along with the grouping/filtering helpers it needed. `lib/timezones.ts` keeps only what the UI needs: `computerTimeZone()` and `localTimeIn()`.

Updated: `src/react-app/lib/timezones.ts` (new), `src/react-app/pages/Schedules.tsx`, `test/timezones.test.ts` (new).

## 2026-10-20 - Briefings & Schedules rename, log table bulk actions and origin column

Owner asked for four changes: rename Schedules to "Briefings & Schedules" with a new URL slug, add select/bulk-select to the superadmin logs table with a delete menu, a sticky header and a city/country column, plus loading states and first/last pagination.

- **The page is now `/briefings-schedules`.** The nav label, the page heading and the URL slug all changed together, and the briefing email's "dashboard" link was repointed - otherwise every delivered briefing would have linked to a 404. The API stays at `/api/sidekick/schedules`; only the page route moved.
- **Origin comes from Cloudflare, not a geolocation service.** `request.cf` carries the city and ISO country code that Cloudflare resolved from the client IP, so there is no third-party lookup, no latency and no rate limit. Stored as `city`/`country` (migration `0028_app_logs_geo.sql`); null for rows that did not come from a request (Cron runs).
- **The log table can be bulk-deleted.** `DELETE /api/superadmin/logs` takes `{ ids }` (1-500) and returns the deleted count. The console gets a per-row checkbox, a select-all checkbox on the sticky header, and a menu in the top-right of the table with "Delete selected (N)" - disabled when nothing is selected. The delete is itself captured as a `superadmin.write` event, so the audit trail keeps the rows that describe earlier deletes.
- **The header sticks** so the columns stay readable while scrolling a long page of entries. This needed the table's scroll container to own the vertical axis, so `ui/table.tsx` gained an optional `containerClassName` (default unchanged).
- **Paging shows progress.** The table dims and the pager spins while a page loads, and First/Last were added next to Previous/Next (the API already returned `total`, so the last page is known).
- **A selection belongs to the page it was made on** - changing page or filter clears it, so a bulk delete can never span pages the operator did not see.

Updated: `db/migrations/0028_app_logs_geo.sql`, `db/schema.ts`, `src/server/lib/app-logs.ts`, `src/server/index.ts`, `src/server/routes/superadmin.ts`, `worker/index.ts`, `src/react-app/pages/admin/Logs.tsx`, `src/react-app/components/ui/table.tsx`, `src/react-app/App.tsx`, `src/react-app/components/shell/AppShell.tsx`, `src/react-app/pages/Dashboard.tsx`, `src/react-app/pages/Schedules.tsx`, `src/server/scheduler/worker.ts`, `test/app-logs.test.ts`, `test/superadmin-logs-route.test.ts`, `test/log-db.ts`, `AGENTS.md`, `docs/logging.md`, `docs/api-contract.md`, `docs/architecture.md`, `docs/product-spec.md`, `src/client/sidekick-navigation.md`.

## 2026-10-20 - Log table: cells now actually wrap

Follow-up to the table-width change: the message column was still overflowing and the horizontal scrollbar was still there.

- **Root cause: `whitespace-nowrap` on the cell, not a missing wrap class.** `ui/table.tsx` puts `whitespace-nowrap` in `TableCell`'s base classes, and the message cell inherits it. `break-words` only sets `overflow-wrap` - it does not override `white-space`, so the text never wrapped. An unbreakable run inside a nowrap cell overflows the cell *and* counts as ink overflow for the `overflow-auto` container, which is what produced the scrollbar.
- **Fix:** the message and event cells set `whitespace-normal` so the inherited nowrap no longer applies, and the long JSON run summary wraps. The timestamp cell keeps `whitespace-nowrap` but gains `truncate` + a title tooltip, so a long locale format cannot create ink overflow either. Surface and origin were already `truncate`.
- **Verified in a real browser, not by inspection.** A repro page using the built CSS was measured with headless Chrome: before the fix the container's `scrollWidth` was 1142 against a `clientWidth` of 1054 (overflow true); after, both are 1054 (overflow false), and the message column grows from 430px to 622px. No horizontal overflow at any width from 800px up.
- **Below ~624px the table still scrolls.** That is the sum of the seven fixed column widths, and below that a 7-column table cannot fit. Above it, the columns compress rather than overflow.

## 2026-10-20 - Log table: bound the message column, scroll on small screens

The table fit large screens after the previous fix, but on smaller screens the message broke down to single characters. Owner asked to allow scrolling on mobile and tablet instead.

- **The table uses auto layout with a bounded message column, not `table-fixed`.** `table-layout: fixed` sized the message column from the *header* row ("Message" is short), so on a narrow screen the column collapsed to 16px and the body cell then overflowed it. Auto layout lets the column size to its content, and the column is bounded with `min-w-[16rem] max-w-[34rem]`.
- **`overflow-wrap: anywhere`, not `break-word`.** This is the part that was missed twice: `break-words` (overflow-wrap: break-word) allows a long word to break when it does not fit, but it does **not** reduce the text's min-content width, so the cell still claimed the full unbroken width. Only `anywhere` (Tailwind `wrap-anywhere`) shrinks the min-content contribution, which is what lets the cell honour its own width.
- **The table has a `min-w-[55rem]` floor.** Below that the seven columns cannot fit, so the container scrolls sideways - which is the behaviour the owner asked for on mobile and tablet, and it keeps every column at a readable width instead of squeezing the message to one character per line.
- **Measured, not assumed.** A repro page using the built CSS was measured with headless Chrome from 414px to 1920px. At 1280px and up there is no horizontal overflow and the message column is 519-541px wide. At 1024px and below the container scrolls, the message column is 411px, and the message renders on 3 lines at *every* width, never overlapping the column to its right.

## 2026-10-20 - Table conventions documented

Owner asked to save their design, style and functionality preferences for CRUD tables so future work matches without re-litigating them.

- **`docs/ui-table-conventions.md` (new)** holds the reference: the card anatomy (one card, filters in the table header on the title's row, right-aligned filter group, "[N selected]" next to the total, bulk-delete button shown directly and only while rows are selected, sticky header, `text-xs` page indicator), the cell typography rules, the behaviour rules (server-side search/filter/pagination for anything that can grow, 50 rows/page, First/Previous/Next/Last with a loading state, selection scoped to the page it was made on, specific validation messages, destructive actions audited), and the sizing recipe (`min-w-[16rem] max-w-[34rem]` on a long-text column, `min-w-[55rem]` on the table so small screens scroll rather than squeeze).
- **The four layout traps are recorded**, because each one cost a wrong fix: `CardHeader` sets `items-start` so a header row shrinks to its content width and the right edge of the card stays empty (needs `w-full`); `TableCell` sets `whitespace-nowrap` so a cell cannot wrap until `whitespace-normal` is added; `break-words` does not reduce a text's min-content width so a long unbroken string still claims the full width (`wrap-anywhere` does); and `table-fixed` sizes columns from the header row, so a column with a short header collapses while its body cell overflows.
- **How to verify a layout is written down too**: mount the *real* components in a scratch probe page and measure `getBoundingClientRect` and computed styles in headless Chrome. A hand-written stand-in missed two bugs in a row because it did not carry `CardHeader`'s `items-start`.
- **Discovery wired up**: added to the AGENTS.md required reading, and to the `ui-engineer` and `portal-frontend` agent briefs, so a subagent picks it up before writing a table.

Updated: `docs/ui-table-conventions.md` (new), `AGENTS.md`, `.opencode/agents/ui-engineer.md`, `.opencode/agents/portal-frontend.md`.

## 2026-10-21 - Operator-configured embed snippets (chat widget) for marketing and dashboard

Owner asked for a way to drop third-party HTML/embed code (a Zoho SalesIQ chat widget) into the app from a public environment variable, separately for the marketing site and the user dashboard.

- **The injection is client-side, not a server-side `</body>` rewrite.** Cloudflare Static Assets own the app HTML - the Worker never returns an HTML document for app routes (`src/server/index.ts` catch-all returns JSON) - so a true "inject before `</body>`" rewrite would need an `ASSETS` binding, every HTML route moved into `run_worker_first`, and rewriting 33 prerendered marketing files plus the SPA shell. Instead the snippet is fetched from the API and appended as the last child of `<body>`, which is the same position a server-side injection would produce. For a JS widget the difference is only "present after hydration instead of in the initial HTML".
- **Two env vars, two surfaces.** `EMBED_MARKETING_HTML` covers the 19 public marketing routes (mounted in `MarketingLayout`, which every marketing page already uses); `EMBED_APP_HTML` covers the authenticated app pages (mounted in `AppShell`). `/superadmin/*` is excluded from the app surface - staff screens are a different audience. Login/signup/onboarding are excluded as well.
- **`GET /api/embeds` is public and unauthenticated.** The same snippet is embedded for anonymous marketing visitors, so gating it would only hide something already public. The response is `{ marketing, app }` with `null` for unset values, `Cache-Control: public, max-age=60` so an env change lands within a minute. No DB access, and the snippet body is never logged.
- **Scripts are recreated, not inserted as markup.** Script elements added via `innerHTML` (or parsed by `DOMParser`) are inert and never run, so each `<script>` in the snippet is rebuilt with `document.createElement` and appended. This also keeps `document.currentScript` working, which several widgets (Intercom, HubSpot, Zoho) read to find their own script URL.
- **The snippet is public by definition.** It ships to every visitor of that surface and is visible in page source, so it must never contain a secret, and it is configurable only through the Cloudflare environment - never by an org admin, a tenant, or a superadmin form. An optional superadmin setting would have been a stored-XSS vector across tenants.
- **Values over 64 KB are treated as unset** rather than truncated: a truncated script is a broken script, and a silent half-embed is worse than none.
- **No DOM test environment exists in this repo** (no jsdom/happy-dom, vitest runs in the node environment), so the parsing logic is a pure string function (`splitEmbedHtml`, `parseEmbedAttrs`) that is unit-tested, and the thin DOM applier is covered by a browser check. Adding jsdom later would let the applier be tested directly.

Updated: `src/server/types.ts`, `src/server/routes/embeds.ts` (new), `src/server/index.ts`, `src/react-app/lib/embeds.ts` (new), `src/react-app/components/EmbedScripts.tsx` (new), `src/react-app/components/marketing/MarketingLayout.tsx`, `src/react-app/components/shell/AppShell.tsx`, `test/embeds.test.ts` (new), `.dev.vars`, `.dev.vars.example`, `docs/api-contract.md`, `AGENTS.md`.

## 2026-10-21 - Embed snippets become plaintext dashboard variables (not secrets)

Owner asked to move the two embed snippet variables from secrets to plain variables, so they can be updated directly in the Cloudflare dashboard.

- **They are plaintext variables now, and they live only in the dashboard.** `EMBED_APP_HTML` / `EMBED_MARKETING_HTML` are added in the Cloudflare dashboard (Worker -> Settings -> Variables and Secrets -> Add, Type: Text) on the `production` environment, and they are NOT declared in `wrangler.jsonc`. The snippet is public by design - it ships to every visitor of that surface and is visible in page source - so encryption bought nothing, and a dashboard variable is editable without a deploy.
- **`keep_vars: true` is now required in `wrangler.jsonc`.** Without it, `wrangler deploy` deletes every variable that exists on the Worker but is missing from the config - which is exactly the dashboard-managed variable. With it, wrangler sends `keep_bindings: ["plain_text", "json"]` on upload, so dashboard variables survive deploys while the config's own variables still win on name conflicts. Verified in wrangler's own source (`keepVars` -> `keep_bindings`).
- **Why not just put the values in `wrangler.jsonc`?** A config value is overwritten by the next deploy, so a dashboard edit would silently revert. Dashboard-only + `keep_vars` is the only combination where the dashboard is the source of truth.
- **Secrets are unaffected.** `keep_vars` also implies `keepSecrets`, and Cloudflare documents that secrets are never deleted by a deployment. The other twelve production secrets are untouched.
- **The earlier `wrangler secret put` never went live.** A follow-up check of the deployed version's bindings showed no `EMBED_APP_HTML` on it, the script-level secret store did not contain it, and `wrangler secret delete` reported "Binding not found". The production Worker now carries neither variable and has no name conflict, so the dashboard values can be added cleanly.

Updated: `wrangler.jsonc`, `.dev.vars.example`, `AGENTS.md`, `docs/decision-log.md`.

## 2026-10-21 - Embed snippets live in wrangler.jsonc (one source of truth)

Reverses the previous entry: the two embed snippet variables are now declared in `wrangler.jsonc` `vars` - in the top-level block (local dev + the dev Worker) and in `env.production.vars` (production) - and `keep_vars: true` is gone.

- **The repo is the single source of truth.** The dashboard copy of a variable is overwritten by the next deploy, which is the correct behaviour when the config is authoritative: the value is versioned, reviewable and diffable. Anyone can still read the effective value in the dashboard, but they change it here and deploy.
- **`keep_vars` is no longer needed.** It existed only to stop `wrangler deploy` from deleting dashboard variables that were missing from the config. With both variables declared, there is nothing to preserve, and dropping the flag keeps wrangler's default behaviour: the config is the full set of plaintext variables.
- **The values are plaintext on purpose.** The snippet ships to every visitor of that surface and is visible in page source, so encryption bought nothing and a secret could not be edited in the dashboard anyway.
- **`.dev.vars` no longer carries them.** Local development reads the same values from `wrangler.jsonc`; the `.dev.vars` copy was a second source that could drift. A key in `.dev.vars` still overrides the config value for one machine, which is the escape hatch for testing a different widget locally.
- **Both environments carry the same value today.** `EMBED_MARKETING_HTML` is an empty string (treated as unset by the API), ready for a marketing widget.

Updated: `wrangler.jsonc`, `.dev.vars`, `.dev.vars.example`, `AGENTS.md`, `docs/decision-log.md`.

## 2026-10-21 - Embed snippets become build-time VITE_ variables (no API hop)

Owner accepted the GA-style pattern (VITE_GA_MEASUREMENT_ID) for the embed snippets and asked which approach was more efficient. The build-time one wins, so the runtime endpoint is gone.

- **The snippet is now a build-time value, not a Worker variable.** `VITE_EMBED_APP_HTML` and `VITE_EMBED_MARKETING_HTML` are read from `.env` (local) or the build environment (production) and inlined into the client bundle by Vite, exactly like the GA measurement ID. The `GET /api/embeds` route, its registration, the two `Env` keys and the client fetch are all deleted.
- **Why this is the better trade now.** The snippet is public, and the deploy script rebuilds the client anyway, so a runtime fetch bought nothing: it cost a request on every page load, delayed the widget until after hydration, and added a server route to maintain. The build-time value ships inside the JS the browser downloads, so the widget runs as soon as the bundle loads.
- **What is given up.** Changing the snippet now needs a client rebuild - a Worker-only deploy can no longer change it. That is acceptable because every deploy rebuilds the client: the Workers Builds auto-deploy on push runs `npm run build` first, and the manual `npm run deploy:prod` fallback does the same.
- **The value is public by construction.** A `VITE_` key is inlined into the client bundle, so it is visible to every visitor of that surface - exactly the same exposure as the old API response, but without a second copy in the server config. It must never hold a secret, and it stays out of every tenant- or admin-editable surface.
- **Empty versus missing is now distinguishable.** An empty value means "no snippet for this surface" (the marketing one is empty on purpose). A variable that is absent from the build environment logs a warning in production builds, so a build machine without the key is visible instead of silently shipping a site with no widget.
- **One file, one value, no drift.** The previous arrangement had the snippet in `wrangler.jsonc` (top-level and `env.production.vars`) and a second copy in `.dev.vars`; it is now only in `.env`, with `.env.example` documenting the shape.

Updated: `src/react-app/lib/embeds.ts`, `src/react-app/components/EmbedScripts.tsx`, `src/server/index.ts`, `src/server/types.ts`, `src/server/routes/embeds.ts` (deleted), `wrangler.jsonc`, `.env`, `.env.example`, `test/embeds.test.ts`, `docs/api-contract.md`, `AGENTS.md`, `docs/decision-log.md`.

## 2026-10-21 - Vite env values expand `$` - escape it in embed snippets

Moving the embed snippets to `VITE_*` variables surfaced a trap that the GA measurement ID never hit.

- **The symptom was silent.** The Zoho snippet went into `.env` as `window.$zoho=window.$zoho || {};...` and Vite handed the client `window.=window. || {};.salesiq=.salesiq||{...}`. The dollar signs were eaten, the bootstrap script became invalid JavaScript, and the widget simply never appeared - no error, no warning, the page looked fine.
- **Cause: dotenv expansion.** Vite runs env values through dotenv-expand, which treats `$NAME` as a variable reference and replaces an unknown one with an empty string. `\$` is the documented escape and survives expansion as a literal `$`.
- **Every `$` in an embed snippet must be written as `\$` in `.env` and `.env.example`.** The escape is part of the value syntax, not of the snippet: the snippet that reaches the browser is the unescaped original, which is why the built bundle contains `window.$zoho=window.$zoho || {};...` verbatim.
- **A regression test now pins the behaviour.** `test/embeds.test.ts` loads a temporary `.env` through Vite's own `loadEnv` and asserts that `\$` survives while a bare `$` is expanded away. If Vite changes its expansion rules, that test fails instead of the widget silently disappearing.
- **Empty versus missing is still distinguishable at runtime.** An empty value means "no snippet for this surface"; a variable that is absent from the build environment logs a warning in production builds.

Updated: `.env`, `.env.example`, `test/embeds.test.ts`, `docs/decision-log.md`.

## 2026-10-21 - Subscribing during a trial: charged now, plan starts at trial end

Owner asked that a customer who subscribes DURING a trial is charged immediately, stays on the trial plan until the trial ends, is then shifted to the plan they subscribed to, and that the renewal date reflects that.

- **One row, one status change at expiry.** The row keeps `status = 'trialing'` and gains `trial_prepaid = 1`; it already carries the paid plan, interval, amount and card. The daily Cron flips it to `active` (clearing `trial_prepaid` / `trial_ends_at`) and enforces the paid plan's limits. The alternative - a second subscription row - would have left two competing rows for one org and made "which one is live" ambiguous.
- **The renewal date follows the trial.** `nextCharge = trial_ends_at + one interval`, so the period they paid for runs from the moment the trial ends, and the first renewal is one interval after the plan actually starts. The alternative anchors (charge for a period that overlaps the trial, or charging again at expiry) either double-charge or sell a period the customer cannot use yet.
- **The access layer resolves it without the Cron.** `orgAccess` returns the trial tier up to `trial_ends_at` and the paid plan's limits after it, whatever the row's status says. Without this, a paying customer would be gated for up to 24 hours waiting for the 03:00 flip - and the flip is bookkeeping, not the gate.
- **The trial tier is hardcoded, the paid plan is not.** A trial is Pro-tier by definition (`maxUsers: null`, briefings on), so overwriting the row's plan with the subscribed plan does not change entitlements during the window. The limits only tighten when the status flips to `active` and the plan's own limits are read.
- **A prepaid trial gets no trial reminders.** "Your trial ends in N days - subscribe to keep access" is wrong for someone who already subscribed; the Cron skips those rows and sends the standard "subscription active" notice at the flip instead.
- **Plan change is blocked (409) while the window is open** - proration would charge a second time for a period already paid. **Cancel is allowed**: the plan never starts and access continues to the end of the paid period, which is the same promise the normal cancel makes.
- **A second workspace opens once the trial is prepaid.** The multi-org rule asks for a paid subscription, and a prepaid trial is one - the money has been taken. A canceled prepaid trial is blocked again.
- **A failed webhook must not suspend a trial.** `reconcileFailed` flipped any non-`past_due` subscription to `past_due`; a trial has no renewal charge to fail, and a prepaid trial's customer has already paid.

Updated: `db/schema.ts`, `db/migrations/0029_trial_prepaid.sql`, `src/server/billing/access.ts`, `src/server/billing/trials.ts`, `src/server/billing/changes.ts`, `src/server/billing/webhooks.ts`, `src/server/billing/signup.ts`, `src/server/billing/mail.ts`, `src/server/email/templates.ts`, `src/server/routes/billing.ts`, `worker/index.ts`, `src/react-app/pages/Billing.tsx`, `src/react-app/components/shell/AppShell.tsx`, `src/react-app/lib/trial-notice.ts`, `test/billing-trials.test.ts`, `test/billing-access.test.ts`, `test/billing-routes.test.ts`, `test/billing-engine.test.ts`, `test/memory-store.ts`, `docs/agent-rules/04-recurring-billing.md`, `docs/api-contract.md`, `AGENTS.md`, `docs/decision-log.md`.

## 2026-10-21 - Production deploys go through GitHub auto-deploy (documented)

Owner asked to record how production actually deploys, since the repo's tooling implied otherwise.

- **A push to `main` IS the deploy.** Cloudflare Workers Builds (git integration) builds and deploys `fieldvisory-production` automatically. `npm run deploy:prod` is the manual fallback, not the normal path. The repo said otherwise in three places: `docs/deployment.md` section 4 led with the local deploy command, `AGENTS.md` had no deployment section at all, and `docs/architecture.md` never mentioned the deploy path.
- **`docs/deployment.md` section 4 now leads with the auto-deploy** and keeps `npm run deploy:prod` as the fallback, with the schema-first ordering called out: apply the migration, then push. Code that reads a column the database does not have yet breaks every query against that table.
- **Section 6 now documents the build environment properly.** The `VITE_*` values (GA ID, `VITE_EMBED_APP_HTML`, `VITE_EMBED_MARKETING_HTML`) are inlined into the client bundle, so they belong in the Cloudflare **build** variables, not the Worker runtime - and editing one only takes effect on the next build.
- **`AGENTS.md` gained a Deployment section** (auto-deploy on push, migrations are manual and come first, `VITE_*` are build variables, CI deploys nothing) and `docs/deployment.md` joined the required reading list.
- **Fixed a stale reference:** `.github/workflows/migrate-prod.yml` said "same secrets as deploy.yml" - there is no `deploy.yml`, because deployment is not a GitHub Actions workflow. It now names the two secrets it actually needs and says where the deploy comes from.

Verified live while writing this: production `/health` returns 200, and the published bundle contains the Zoho snippet, so the build variables reached the build.

## 2026-10-21 - `$` is escaped differently in .env files and in build variables

Found while verifying the production deploy: the Zoho widget was live in the published bundle but broken.

- **The symptom:** the live bundle contained `window.\\$zoho` - a stray backslash before every dollar. The browser receives `window.\$zoho`, which is a syntax error, so the bootstrap script never runs and `window.$zoho` stays undefined. The widget never appears, with no error anywhere.
- **Cause: two different loaders.** Vite's `loadEnv` dotenv-expands the values parsed from `.env` **files** (so `$name` is replaced with the variable or an empty string) and then copies `process.env` values **verbatim** (no expansion at all). A `.env` file therefore needs `\$`; a Cloudflare build variable - which arrives as `process.env` - needs a plain `$`. The same snippet pasted into both places cannot be spelled the same way.
- **The rule is now written down** in `docs/deployment.md` (build environment section), `AGENTS.md` (Deployment + Embedded scripts) and `.env.example`: `\$` in a `.env` file, plain `$` in a build variable. The build variable also needs a rebuild to take effect, so changing it means pushing again.
- **Verified with Vite's own loader**, not from memory: a temporary `.env` with `file.$zoho` resolved to `file.`, `file.\$zoho` resolved to `file.$zoho`, and a `process.env` value of `proc.$zoho` resolved to `proc.$zoho` unchanged.

While checking the deploy path, also confirmed that the prepaid-trial commit reached production (the live bundle contains `trialPrepaid` and the new billing copy), that the production D1 has the `trial_prepaid` column, and that no errors were logged in the window where the code landed ahead of the migration.

## 2026-10-22 - Rebrand to GrowthSnipe and SNIPE Intelligence™

The product is now GrowthSnipe, a productized growth company for owner-operated home-service businesses. The authenticated analytics product is SNIPE Intelligence™ with a 30-day no-card trial. The trial plan is `snipe-intelligence`.

Plans gain `contactOnly`. Only SNIPE Intelligence™ may display a price. Loop Library, Snipe Diagnostic, Snipe Blueprint, SNIPE Engine Core, and SNIPE Engine Command are contact-only: price fields are 0, they are excluded from the max-4 active self-serve count, and checkout, signup, and plan change refuse them with a 422 and `This plan is contact-only. Contact us for pricing`.

The MCP connection, AI Employees, and briefing schedules remain in code and are hidden from the UI. Their routes (`/mcp-access`, `/employees`, `/briefings-schedules`) are no longer registered, so direct URLs 404 and the pages are not bundled. Public routes for advisors, technology, associations, security, integration detail, and trade detail were removed for this release.

Production defaults now use `https://growthsnipe.com`; auth, billing, and briefing sender addresses use `growthsnipe.com`. The Worker health endpoint reports `service: "growthsnipe"`. At the time of this first pass, Worker, D1, and package names remained `fieldvisory`; they were changed in the rename entry below.

Current docs were rebuilt around GrowthSnipe: README, architecture, API contract, deployment, agent architecture rules, and the shared agent context block. Historical migrations, superseded plans, and the old decision log entries remain unchanged on purpose. The unrouted legacy marketing files and the hidden MCP/AI Employees/Schedules pages remain on disk but are not registered or bundled.

Verification: `npm run typecheck`, `npm run lint`, `npm test` (531 passing), and `npm run build` (16 prerendered routes) all pass. The local D1 has all migrations through `0030`; active plans are SNIPE Intelligence™ plus the five contact-only plans. `dist/client` contains no Tradesmatic, Fieldvisory, Multi-Trades, Business Sidekick, or tradesmatic.com strings.

## 2026-10-22 - Rename package, Worker, and D1 bindings to GrowthSnipe

The package name is now `growthsnipe` in `package.json` and `package-lock.json`. The Worker name is `growthsnipe`, the local D1 database name is `growthsnipe`, and the production D1 database name is `growthsnipe-db-prod`. The production D1 keeps its existing `database_id`, so the binding still points at the same data.

Migration scripts now target the `DB` binding rather than a database display name. This keeps local and production migrations working while the Cloudflare resource name is changed outside the repo.

Local D1 kept its schema and data after the rename; all migrations through `0030` are applied.

External follow-up: the Cloudflare D1 resource is still named `fieldvisory-db-prod` until it is renamed in the Cloudflare dashboard/API or replaced by a new database and import. The next production deploy creates `growthsnipe-production`; the old `fieldvisory-production` Worker remains until it is deleted.

## 2026-10-31 - Book-a-call marketing, invite-only auth (owner decision)

Marketing no longer promotes SNIPE Intelligence, signup, or free trials. The header CTA is Book A Call to a new public `/book` page (13 fields: 10 required + 3 optional), submitted to a new `POST /api/book` route that emails the support address like `/api/contact` (no DB table, logged as `app-logs` event `book.submitted`). The pricing page renders every plan as a no-price Book-a-Call card from live `GET /api/plans` data (still no hard-coded prices per the plans test); Engine prices flip on later via contact-only flags. Billing shows a Talk-to-us card when no purchasable plans exist instead of the plan picker.

Signup is invite-only through superadmin. Public `/signup`, `/verify-email`, `/forgot-password`, and `/reset-password` routes redirect (`/signup` to `/book`, the rest to `/login`); password sign-in is disabled (`emailAndPassword.enabled: false`), so existing password users sign in with a magic link or Google next time. Sign-in is email + Continue: `POST /api/account-exists` now also returns `invited` for pending workspace invitations plus a single `allowed` flag that also covers `SUPERADMIN_EMAILS` seed addresses, and only allowed addresses get a link (a superadmin with no account yet signs in from the login page and the session hook seeds the flag).

Fresh-user invites (migration `0041`, table `fresh_invites`): a superadmin pre-approves an email from the Clients page ("Invite new user" card, no role picker — the creator is admin by `creatorRole`). The endpoint validates, 409s on duplicates or existing workspace members, stores a single-use row (30-day expiry), and sends the 7-day magic link immediately; resend and revoke included. Login treats a valid fresh invite as `invited`, `beforeCreateOrganization` accepts it as the invite gate, and `afterCreateOrganization` consumes it. The invited user names their own workspace in onboarding and trials exactly like onboarding-created workspaces; no subscription is created by the invite. Direct DB provisioning was avoided: the invite is a pre-approval record, and Better Auth still owns org/member creation, so plugin invariants (unique names, plan caps) keep applying.

## 2026-11-09 - SNIPE Engine goes private-priced, Loops name cleaned (owner direction)

Owner course change: SNIPE Engine™ is now a single privately-priced offer everywhere. Removed all prices, the Core/Command tier split, and every plan comparison from the site (Engine page, home offers grid and Engine section, FAQ, Paid Ads, VoiceIQ). Engine CTAs now say "Contact Us for Pricing" and route to /book. Engine page promotes the high-level Command-sourced feature set with a private-pricing card. FAQ Engine answers rewritten without amounts, hours, or caps; the no-hardcoded-plans test no longer expects the Engine page to import lib/offers. "Free" removed from the SNIPE Loops™ name everywhere (header/footer menus, offers card, page title/meta, Loop Library access page, strategy doc). Home CTAs are now the Growth Fit Call + SNIPE Diagnostic™, with a new dedicated SNIPE Loops™ section. Footer Company column reordered (Sign in above Book a Free Growth Fit Call, both directly above the email). Tier prices remain in src/lib/offers.ts and AGENTS.md as internal reference only.

## 2026-11-09 - Engine CTAs to /engine, home Loops two-column, no pricing language (owner direction)

Home SNIPE Engine™ buttons now go to /engine and no longer say "Contact Us for Pricing" (offers card: "Explore SNIPE Engine™"; overview section CTA likewise; private-scope mentions removed). The shared CtaBand "See plans" button is now "Get My SNIPE Diagnostic™" (→ Diagnostic checkout) across all marketing pages. Home Loops section rebuilt as two columns with a follow-up-loop SVG graphic; both home Loops buttons read "Download SNIPE Loops™ For Free". Engine page: removed the private-pricing intro line and pricing card (replaced with a "Talk to us" card), and added a "What SNIPE Engine™ runs" section with five feature blocks including the eight Revenue Loops in the owner's wording. Strategy doc synced throughout.

## 2026-11-02 - Marketing copy: ™ naming, nav cleanup, home tightening (owner direction)

Owner-directed copy changes, no behavior change. Trademark rule now enforced in customer copy: SNIPE Diagnostic™, SNIPE Blueprint™, SNIPE Engine™ (Core/Command tiers as SNIPE Engine™ Core/Command), SNIPE Loops™, SNIPE Intelligence™/VoiceIQ™/CRM™ all carry ™; SNIPE System never takes ™; standalone "Engine" always written as SNIPE Engine™ ("Pipeline Engine" kept as the SNIPE System framework pillar name). Single source of truth unchanged: tier/offer display names flow from `src/lib/offers.ts`. Header: "Free SNIPE Loops" shortened to "SNIPE Loops"; Solutions menu renamed to Who We Help, Offers menu to Solutions; duplicate standalone Resources/About links removed. Home: proof section rewritten around testimonials/case studies, post-case-study boxes replaced with a Start-with-Diagnostic-or-Blueprint section, Solutions-grid Engine button made primary blue, trade tiles given distinct icons. Footer legal links (Terms, Privacy, Results Disclaimer) moved under the copyright line. Verified: no em dashes in touched customer copy.

## 2026-11-02 - Marketing copy: no illustrative labels, nav rename, SNIPE Loops (owner decision)

Owner-directed copy changes, no behavior change. (1) Removed all "illustrative" labels from customer copy (testimonials, case studies, BriefingMockup caption, results-disclaimer wording); AGENTS.md, growthsnipe-context, and content-strategist updated to match. (2) Header nav: removed the standalone Resources/About duplicates next to the dropdowns; renamed menus Solutions to Who We Help and Offers to Solutions (footer column titles match). (3) Renamed Loop Library to SNIPE Loops across customer copy, CTAs ("Download SNIPE Loops"), emails, and page titles; URLs (`/loop-library`), API paths, DB tables/columns, and code identifiers intentionally unchanged. (4) Home page tightened per approved plan (wording only, all sections kept; trade tiles now link to trade pages). Verified: typecheck, lint, 728 tests, build + prerender green; no em dashes in touched customer copy (remaining em dashes live only in unrouted dormant pages).

## 2026-11-01 - Website strategy pricing policy replaces Intelligence-only rule (owner decision)

Owner approved the website strategy in `docs/copy-content-website-strategy.md`: the public site sells SNIPE Diagnostic ($199 one-time) and SNIPE Blueprint ($999 one-time) with credit-forward rules ($199 toward Blueprint within 14 days, $999 toward Engine setup within 30 days), plus Engine Core ($2,999 setup + $1,999/mo) and Command ($4,999 setup + $3,999/mo) with prices on marketing pages. This reverses the old hard rule ("only SNIPE Intelligence may display a price"). Single source of truth is the new `src/lib/offers.ts`; AGENTS.md, `docs/growthsnipe-context.md`, `docs/api-contract.md`, and the content-strategist agent were rewritten to match, and `test/no-hardcoded-plans.test.ts` now forbids raw offer-price literals outside `offers.ts` (editorial dollar figures stay legal). SNIPE Intelligence $199/mo trial copy stays dashboard-only and is no longer promoted on the public site. Note: AGENTS.md still listed Diagnostic at $497 — superseded by the $199 strategy price.

## 2026-11-01 - Website rebuild: strategy sitemap, one-time checkout, Loop Library automation (owner decision)

Public site rebuilt from `docs/copy-content-website-strategy.md` (all pages written at once per owner direction): new routes for home, `/blueprint`, `/diagnostic`, `/loop-library`, `/engine`, six industry pages, four capability pages (`/paid-ads`, `/crm`, `/intelligence`, `/voiceiq`), rewritten `/how-it-works` and `/about`, new `/snipe-system`, `/case-studies` (illustrative-labeled), `/resources`, `/faq`, `/book` revamp (form-only, no scheduler), `/checkout/*`, `/thank-you/*`, `/results-disclaimer`. Retired `/features`, `/integrations`, `/who-we-help`, `/pricing` redirect to replacements. Nav rebuilt per strategy (Solutions / Growth System / Offers dropdowns). Blog and `/contact` kept as-is. SNIPE CRM™ added to official product names. GoHighLevel naming removed from customer copy.

Guest one-time checkout (migration `0042`, tables `one_time_products` + `one_time_orders`): server-computed amounts, Safepay payment sessions without saved cards or org linkage, idempotent confirm, webhook reconcile for pending orders, receipt + intake emails, superadmin order listing. Invoice rows are NOT created for one-time orders (invoices.org_id is NOT NULL and guests may have no org) — receipts reference the order id instead.

Loop Library automation (migration `0043`, tables `loop_library_leads`, `marketing_sends`, `marketing_suppressions`): capture upserts + schedules Day 0/2/5/8/12, Day 0 sends inline, daily cron delivers the rest, unsubscribe via HMAC tokens, manual superadmin buyer-reminder triggers for Diagnostic/Blueprint credit windows. Marketing sends are Brevo-first with Resend fallback via the shared transport; unsubscribes never affect auth/billing sends.

Open follow-ups (not built): booking scheduler embed for "Choose a Time" (form-only for now), CAN-SPAM postal address in marketing footers, Brevo dedicated marketing sender, resubscribe-after-unsubscribe is currently allowed with fresh consent. First-workspace creation additionally requires a pending invitation (`beforeCreateOrganization` gate; members keep the paid-subscription multi-org rule). The magic link lifetime is 7 days (`magicLink.expiresIn: 604800`; vendor default is 5 minutes, verified in `node_modules/better-auth` plugin types), and superadmins can send one from the client page via `POST /api/superadmin/clients/:orgId/members/magic-link` (`org.magic_link_sent` audit event).

