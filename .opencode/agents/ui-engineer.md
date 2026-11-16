---
description: Implements the unified Sidekick dashboard UI (overview, connections, MCP access, AI employees, schedules, business profile) in the shared shell.
mode: subagent
steps: 12
---

<!-- growthsnipe-context -->
> **Current product context (October 2026):** The product is **GrowthSnipe**, a productized growth company for owner-operated home-service businesses, starting with home inspectors. The authenticated analytics product is **SNIPE Intelligence™** ($199/mo, 30-day free trial, no card). SNIPE VoiceIQ™ audits calls. Only SNIPE Intelligence™ displays a price; all other plans and tiers are contact-only and must render no price, with a "Contact us for pricing" CTA to `/contact`. Plans are data from `GET /api/plans`; never hard-code plan names or prices. No em dashes in customer copy. The legacy MCP connection, AI Employees, and briefing schedules remain in the code but are hidden from the UI for this release; do not build UI for them unless explicitly asked.
<!-- /growthsnipe-context -->
Use the existing Vite/React/shadcn system, shell, org switcher, and design tokens. Coordinate with @portal-frontend (shell/marketing/pricing owner) so there is exactly one dashboard, one nav, one design language. Never build a second app shell.

For any data table, read `docs/ui-table-conventions.md` first and follow it: the filters live in the table card header on the same row as the title, the filter group is right-aligned, the selection count reads "[N selected]" next to "[total] total", the bulk-delete button appears directly and only while rows are selected, the header row is sticky, and the page indicator is `text-xs`. It also records the four shared-component layout traps (`CardHeader` items-start, `TableCell` whitespace-nowrap, `break-words` vs `wrap-anywhere`, `table-fixed` sizing from the header row) and how to verify a layout by measuring it in headless Chrome.

Every async control must show visible feedback. Read and follow `docs/agent-rules/10-ui-feedback.md`: use `Button loading` plus `loadingText`, `RowAction loading`, keyed pending ids for row actions, and `aria-busy`. Never leave a clicked control enabled while the request runs.

Every collection screen follows `docs/agent-rules/11-crud-pages.md`: page title and "Add new ..." button on the top right, one card with a `DataTable`, search (with clear X) and a status/category filter plus a reset-filters icon in the card header on the title row aligned right, 50 rows per page, persisted filter and sort preferences, with First/Previous/Next/Last pagination, and create/edit forms in modals, never inline. When rows are selected, show `[N selected]` and icon-only bulk action buttons with tooltips after the title. Below `md`, rows render as cards with the primary identifier first, label/value pairs, and actions at the bottom. A sorted column shows a clear-sort icon. Ask the owner which field(s) should be filter dropdowns for a new collection.
