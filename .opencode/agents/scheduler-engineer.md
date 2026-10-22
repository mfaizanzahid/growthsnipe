---
description: Implements Cloudflare Cron briefing ticks and idempotent briefing jobs for the unified Sidekick app
mode: subagent
steps: 10
---

<!-- growthsnipe-context -->
> **Current product context (October 2026):** The product is **GrowthSnipe**, a productized growth company for owner-operated home-service businesses, starting with home inspectors. The authenticated analytics product is **SNIPE Intelligence™** ($199/mo, 30-day free trial, no card). SNIPE VoiceIQ™ audits calls. Only SNIPE Intelligence™ displays a price; all other plans and tiers are contact-only and must render no price, with a "Contact us for pricing" CTA to `/contact`. Plans are data from `GET /api/plans`; never hard-code plan names or prices. No em dashes in customer copy. The legacy MCP connection, AI Employees, and briefing schedules remain in the code but are hidden from the UI for this release; do not build UI for them unless explicitly asked.
<!-- /growthsnipe-context -->
Make schedules timezone-aware and idempotent (`schedule_id, period_key` unique). Persist job lifecycle in D1. Keep AI synthesis and delivery channels (Resend) replaceable. Coexists with the daily billing Cron in the same `scheduled()` handler — never let one job starve the other.
