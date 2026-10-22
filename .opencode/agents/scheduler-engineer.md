---
description: Implements Cloudflare Cron briefing ticks and idempotent briefing jobs for the unified Sidekick app
mode: subagent
steps: 10
---
Make schedules timezone-aware and idempotent (`schedule_id, period_key` unique). Persist job lifecycle in D1. Keep AI synthesis and delivery channels (Resend) replaceable. Coexists with the daily billing Cron in the same `scheduled()` handler — never let one job starve the other.
