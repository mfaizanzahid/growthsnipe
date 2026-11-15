# CRUD page format

Use this layout for every dashboard or superadmin page that manages a collection of records. The Coupons page (`src/react-app/pages/admin/Coupons.tsx`) is the reference implementation.

## Page layout

1. **Page header.** Title and one-line description on the left. The primary create button ("Add new ...") sits on the right edge of the page header.
2. **One table card.** A single `Card` contains the collection. Do not stack separate cards for search, create, and the list.
3. **List first.** The page opens on the read/list view. The `DataTable` provides search, column sort, and pagination.
4. **No inline forms.** Create and edit forms live in modals, never inline on the page or inside a table row.

## Search and pagination

- The search input lives in the table card header on the same row as the table title, aligned to the right. Use `CardAction` or `ml-auto`.
- A status or category filter dropdown follows the search input on the same row. Pass the filter to the API or filter the rows before `DataTable`.
- **Before implementing a new CRUD table, ask the owner which field(s) should be available as filter dropdowns.** Do not invent filter fields.
- Pass a controlled search to `DataTable` (`search`, `onSearchChange`, `hideSearch`) when the input sits in the card header, so no second search bar renders above the table.
- Collection tables show 50 rows per page by default (`pageSize={50}`).
- Pagination shows First / Previous / Next / Last with a `text-xs` page indicator.
- Changing the search or filter resets the table to page 1.

## Bulk actions

- Enable `DataTable` row selection with `selectable`, `selected`, and `onSelect`.
- When rows are selected, show `[N selected]` and the bulk action buttons on the same row as the table title, left-aligned after the title.
- Render bulk actions in the card header and pass `hideSelectionBar` to `DataTable` so the internal selection row does not duplicate them.
- Use `runBulk` and `toastBulk` for multi-record mutations. Every bulk button uses `Button loading` with a specific `loadingText` and disables the other bulk buttons while one runs.
- Confirm destructive bulk actions and state the count.
- Clear selection when the page, search, or filter changes (`onPageChange`, plus the search/filter handlers).

## Create and edit

- The top-right button opens the create modal.
- A row edit action opens the edit modal for that record.
- Keep quick mutations (extend, activate, deactivate, resend) as row actions.
- Destructive actions require confirmation. When records are referenced by other data, use deactivate instead of hard delete.
- Every modal submit uses `Button loading` with a specific `loadingText`.
- Every row action uses `RowAction` with `loading` and `disabled`; key pending state by action and record.

## Table columns

- Primary identifier first, then the fields an operator scans most often.
- Secondary metadata (restricted email, product slug) renders under the identifier in `text-xs text-muted-foreground`.
- Status uses `Badge`.
- Dates use `whitespace-nowrap`.
- Put edit and quick actions in the last column.

## Related rules

- Table layout details: `docs/ui-table-conventions.md`.
- Pending feedback and single-flight mutations: `docs/agent-rules/10-ui-feedback.md`.
