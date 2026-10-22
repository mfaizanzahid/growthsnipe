# Scheduling

Cloudflare Cron is the heartbeat. D1 stores organization schedules, due timestamps, briefing jobs, and delivery metadata. A unique `(schedule_id, period_key)` prevents duplicate jobs on retries.

Default schedules:
- Daily morning briefing
- Monday weekly business review
- First-of-month monthly review

Native Claude/ChatGPT scheduling is optional convenience; SaaS scheduling is canonical.

## Cadence is analytical, not just a label

Each cadence decides **what is measured** and **which question the report answers**
(`src/server/briefing/cadence.ts`):

| Type | Window analyzed | Compared against |
|---|---|---|
| `morning_briefing` | yesterday (aligned to local midnight) | the day before |
| `weekly_review` | last 7 local days | the previous 7 days |
| `monthly_review` | last 30 local days | the previous 30 days |

Windows are aligned to **local midnight in the schedule's timezone**, never to
"now", so a 07:00 briefing describes a completed day and ISN's day-precision
date filters map cleanly.

## When a schedule fires

`local_time` + `timezone` are authoritative. `next_run_at` is computed by
resolving that wall clock in the IANA zone (`src/server/lib/local-time.ts`), so
a 07:00 Asia/Karachi schedule fires at 07:00 local across DST changes. The
hourly Cron only decides when a due schedule is picked up.

**Local times must be whole hours.** The Cron heartbeat runs at the top of each
hour (`0 * * * *`), so a schedule whose minutes are not `00` would never be
picked up. The API rejects it (`422 localTime must be a whole hour (HH:00, 24h)`)
rather than storing a schedule that silently never fires. This applies to every
cadence — a weekly or monthly review at `07:30` would be just as dead.

`rule_json` carries the cadence day, and each type reads only its own field:

| Type | `rule_json` field | Default | Fires |
|---|---|---|---|
| `morning_briefing` | — | — | every day |
| `weekly_review` | `dayOfWeek` (0=Sun…6=Sat) | `1` (Monday) | that weekday |
| `monthly_review` | `dayOfMonth` (1–31) | creation day-of-month | that day, clamped to month end |

A day already past this cycle rolls to the next one; a monthly day still ahead
this month fires this month. Both the create route and the scheduler read the
rule through `parseScheduleRule`, which tolerates legacy rows with an empty or
malformed `rule_json`.

An organization may hold **at most one schedule per cadence** (three total:
morning, weekly, monthly). `POST /api/sidekick/schedules` returns `409` for a
duplicate, and the dashboard disables cadences that already exist.

Schedules are **created, edited, paused, and deleted at the workspace level** and
are delivered to **every active admin** in the workspace. `PATCH
/api/sidekick/schedules/:id` changes the type, cadence day, timezone, or hour and
recomputes `next_run_at`; changing the type onto an occupied cadence returns
`409`. Only `admin` and `user` roles may manage schedules — `viewer` cannot.

## What a briefing is built from

`src/server/briefing/` collects per provider using only that platform's verified
endpoints (`providers/strategies.ts`), then computes every number deterministically
in `analyze.ts`. The model narrates those numbers and nothing else. Anything a
platform cannot support is stated in `dataQuality.omissions` rather than guessed.

- **Spectora** — windowed + paged orders (200/page, max 5 pages), exact
  cancellations via the verified `filter[canceled]=true`, events, real names.
- **ISN** — two windows (current + previous), each read whole in one call (ISN
  has no paging; a 50,000-item memory backstop does not bind for real windows),
  and **no per-inspector metrics** because ISN returns agent UUIDs rather than
  names. ISN date filters accept whole days only, so consecutive comparison
  windows share a boundary day; that is disclosed in every report rather than
  presented as a clean split.

Neither API exposes invoices or payments, so "unpaid" means the provider's
order-level `paid` flag — collection risk, not accounts receivable.

## Why briefings have a page budget and MCP tools do not

The MCP surface has no page cap because **the client is the loop**: each
`search_orders` call is a separate HTTP request with its own budget, and
`paginatedResult` tells the model to keep calling. No single invocation can run
away.

A briefing has no client — `runBriefingJob` must read both analysis windows,
synthesize, and send mail inside one Worker invocation, so its loop must
terminate itself. That termination rule now lives in one place,
`src/server/lib/retrieval-limits.ts`, and is sized from real platform limits
rather than a guess:

- Workers allow 50 (Free) / 10,000 (Paid) subrequests per invocation; D1 queries
  count as subrequests alongside `fetch()` calls.
- CPU is 30s per Cron Trigger when the interval is under an hour. The Sidekick
  tick runs every hour, so **every workspace due in a tick shares that one
  budget**.
- Spectora's own ceiling is `page[size] <= 200`.

Default briefing budget is **50 pages per window (10,000 orders)** — about 90x
the largest window observed in production (113 orders / 30 days). It was
previously a hardcoded `5` (~1,000 orders) inherited from the dashboard
snapshot, which silently under-reported revenue on any larger workspace.
Override per deployment with the `BRIEFING_MAX_PAGES` env var; nonsense values
fall back to the default rather than disabling the truncation disclosure.

The dashboard snapshot keeps its own, smaller budget (5 pages x 100) in the same
module — deliberately different values for different workloads, not an
accident. **Do not merge the two constants.**
