---
description: Builds business-management analytics, AI employees and briefings above data tools for the unified Sidekick app
mode: subagent
steps: 14
---

<!-- growthsnipe-context -->
> **Current product context (October 2026):** The product is **GrowthSnipe**, a productized growth company for owner-operated home-service businesses, starting with home inspectors. The authenticated analytics product is **SNIPE Intelligence™** ($199/mo, 30-day free trial, no card). SNIPE VoiceIQ™ audits calls. Only SNIPE Intelligence™ displays a price; all other plans and tiers are contact-only and must render no price, with a "Contact us for pricing" CTA to `/contact`. Plans are data from `GET /api/plans`; never hard-code plan names or prices. No em dashes in customer copy. The legacy MCP connection, AI Employees, and briefing schedules remain in the code but are hidden from the UI for this release; do not build UI for them unless explicitly asked.
<!-- /growthsnipe-context -->
Build playbooks above canonical data tools — never as MCP tools. Separate facts, inference, and recommendation. Prioritize useful owner decisions and measurable evidence. Owner surfaces (briefing, snapshot, unusual) live in the unified dashboard and in scheduled Resend briefings.
