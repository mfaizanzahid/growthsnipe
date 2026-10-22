# CRUD table conventions

Owner preferences for data tables, captured from the superadmin log table work
(2026-10-20) and applied to every table built after it.

Two implementations exist. Use the right one, then apply the shared layout and
cell rules from both.

| | `components/DataTable.tsx` | custom server-side table |
|---|---|---|
| Data | already in memory | fetched per page |
| Search / sort / page | client-side | server-side |
| Use for | bounded admin lists (clients, invoices, plans) | anything that can grow past a page (logs, jobs) |
| Extra work | none | query params, total count, loading state |

The superadmin log table (`pages/admin/Logs.tsx`) is the reference
implementation of the server-side kind.

## 1. Anatomy

One card per table. **No separate "Search & filter" section or card** - the
filters live in the table card's own header.

```
┌──────────────────────────────────────────────────────────────────────┐
│ Entries  1,234 total  [3 selected]  [Delete selected (3)]            │
│                                    [Search logs…][All levels][All surf…]│
│ Free text matches message, event, user, workspace, and path.          │
├──────────────────────────────────────────────────────────────────────┤
│ ☐ Time          Level  Surface  Event         Message      Origin     │
│ ☐ 10/20 8:58PM  info   cron     cron.brief…  Briefing…    Austin, US  │
└──────────────────────────────────────────────────────────────────────┘
```

1. **Header row, one line.** Title + total on the left, filter controls on the
   right. Filters wrap to a second line only when the viewport is too narrow.
2. **Title group (left).** `Title` + `<total> total` + `[<N> selected]` when a
   selection exists.
3. **Filter group (right).** Right-aligned; see the sizing recipe below.
4. **Bulk action button appears only while rows are selected**, labelled with
   the count ("Delete selected (3)"). A single bulk action does **not** go in
   an overflow / `⋯` menu - show the button directly.
5. **A short muted hint line** under the header row when the search has
   non-obvious scope ("Free text matches message, event, user, workspace, and
   path"). Keep it a line, not a section.
6. **Per-row detail goes in an expandable row**, not a modal. Modals are for
   create and edit forms only.

## 2. Typography and cell style

- Primary cell text: `text-sm`. Secondary metadata: `text-xs text-muted-foreground`.
- Identifiers and event names: `font-mono text-xs`.
- Status and level: `Badge` - `destructive` for error, `secondary` for warn,
  `outline` for info.
- Timestamps: `text-muted-foreground` + `whitespace-nowrap`.
- Narrow cells: `truncate` plus a `title` tooltip for the full value.
- The page indicator ("Page 2 of 20") is `text-xs`.

## 3. Behaviour

- **Server-side search, filter and pagination** for a table that can grow. The
  API returns `{ rows, page, limit, total, hasMore }` so the client can show a
  last page and a total without a second call.
- **50 rows per page** for a server-side table (`DataTable` defaults to 10
  client-side).
- **First / Previous / Next / Last** controls. Show a loading indicator while a
  page is in flight and dim the table body - a click that does nothing visible
  reads as a broken button.
- **A selection belongs to the page it was made on.** Changing page or filter
  clears it, so a bulk action can never span rows the operator did not see.
- **Confirm destructive bulk actions**, stating the count.
- **Surface the reason.** When the API rejects input, return the specific cause
  ("localTime must be a whole hour") rather than a flat "Invalid request", and
  show it in the UI.
- **Audit destructive admin actions** - a bulk delete is itself a log event.

## 4. Layout traps in this codebase

These four cost real debugging time. Each is a property of the shared
components, not of any one table.

1. **`CardHeader` sets `items-start`.** A child row therefore shrinks to its
   content width and the right edge of the card stays empty. The row needs
   `w-full`, or the right-aligned group has no free space to consume.
2. **`TableCell` sets `whitespace-nowrap`.** A cell never wraps unless you add
   `whitespace-normal` to it. `break-words` alone does nothing.
3. **`break-words` is `overflow-wrap: break-word`.** It lets a long word break
   when it does not fit, but it does **not** reduce the text's min-content
   width, so the cell still claims the full unbroken width. Use
   **`wrap-anywhere`** (`overflow-wrap: anywhere`) - only that shrinks the
   min-content contribution.
4. **`table-fixed` sizes columns from the first row**, which is the header. A
   column whose header is short ("Message") collapses to a few pixels while the
   body cell overflows it. Prefer auto layout and give long-text columns
   explicit `min-w` / `max-w`.

A long unbroken string inside an `overflow-auto` container also creates a
horizontal scrollbar even when the table itself is fine - another reason to
make the text breakable.

## 5. Sizing recipe

- **Long-text column:** `min-w-[16rem] max-w-[34rem]` on the cell, and
  `wrap-anywhere` on the content.
- **Table:** `min-w-[55rem]`. Below that the columns cannot fit, so the
  container scrolls sideways. Horizontal scrolling on mobile and tablet is
  preferred over squeezing a column down to one character per line.
- **Right-aligned filter group:** `ml-auto` (pushes the group to the right
  edge, on its own line too) plus `justify-end` (right-aligns the fields
  inside the group).
- **Filter controls:** size them so there is visible space between the group
  and the title rather than butting against it. Check the widest label fits -
  a `w-24` select clips "All levels".

## 6. Verifying the layout

Do not reason about the CSS - measure it.

1. Build a scratch probe page that mounts the **real** components
   (`Card`, `CardHeader`, `CardTitle`, `Button`, `Input`), not a hand-written
   stand-in. A stand-in missed two bugs in a row because it did not carry
   `CardHeader`'s `items-start`.
2. Serve it from the dev server, load it in headless Chrome with
   `--headless --dump-dom`, and read `getBoundingClientRect()` plus the
   computed styles.
3. Check at 1920 / 1440 / 1280 / 1024 / 768 / 414: is the table free of
   horizontal overflow where it should be, is the filter group flush right
   (`right edge == row right edge`), is there visible space between the title
   and the filters, and does long text render on a sane number of lines
   without overlapping the next column.
4. Delete the probe files afterwards.

## 7. Owner preferences (explicit)

- Search and filter fields go **inside the table**, on the same row as the
  table title - not in a separate section above it.
- The filter fields are **right-aligned**.
- The selection count shows as **"[x selected]"**, in brackets, on the same row
  as **"x total"**.
- The delete button **appears directly** (not behind a menu) and **only when a
  record is selected**.
- The **page indicator is `text-xs`**.
- The header row is **sticky**.
- **Horizontal scrolling on small screens is fine** - squeezing columns is not.
