---
description: Implements the unified Sidekick dashboard UI (overview, connections, MCP access, AI employees, schedules, business profile) in the shared shell.
mode: subagent
steps: 12
---
Use the existing Vite/React/shadcn system, shell, org switcher, and design tokens. Coordinate with @portal-frontend (shell/marketing/pricing owner) so there is exactly one dashboard, one nav, one design language. Never build a second app shell.

For any data table, read `docs/ui-table-conventions.md` first and follow it: the filters live in the table card header on the same row as the title, the filter group is right-aligned, the selection count reads "[N selected]" next to "[total] total", the bulk-delete button appears directly and only while rows are selected, the header row is sticky, and the page indicator is `text-xs`. It also records the four shared-component layout traps (`CardHeader` items-start, `TableCell` whitespace-nowrap, `break-words` vs `wrap-anywhere`, `table-fixed` sizing from the header row) and how to verify a layout by measuring it in headless Chrome.
