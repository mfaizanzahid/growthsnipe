import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowDownIcon,
  ArrowsUpDownIcon,
  ArrowUpIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Button } from "./ui/button";
import { Spinner } from "./ui/spinner";
import { Checkbox } from "./ui/checkbox";
import { SearchInput } from "./ui/search-input";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { usePersistentState } from "../hooks/usePersistentState";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { cn } from "../lib/utils";

export interface DataColumn<T> {
  key: string;
  header: string;
  sortable?: boolean;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
  searchValue?: (row: T) => string;
}

type SortState = { key: string | null; dir: 1 | -1 };

function isSortState(value: unknown): value is SortState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { key?: unknown; dir?: unknown };
  return (candidate.key === null || typeof candidate.key === "string") && (candidate.dir === 1 || candidate.dir === -1);
}

interface Props<T> {
  rows: T[];
  columns: DataColumn<T>[];
  rowId: (row: T) => string;
  pageSize?: number;
  searchPlaceholder?: string;
  /** Controlled search value. Pair with onSearchChange and hideSearch. */
  search?: string;
  onSearchChange?: (value: string) => void;
  /** Hide the internal search row (put the input in the card header instead). */
  hideSearch?: boolean;
  /** Hide the internal selection/bulk row (render bulk actions in the card header). */
  hideSelectionBar?: boolean;
  /** Reset to page 1 when an external filter key changes. */
  pageResetKey?: string | number;
  /** Called when the visible page changes so the caller can clear selection. */
  onPageChange?: () => void;
  /** Render rows as cards below md. Default true. */
  mobileCards?: boolean;
  /** localStorage key for persisting sort key/direction. */
  storageKey?: string;
  empty?: string;
  selectable?: boolean;
  selected?: string[];
  onSelect?: (ids: string[]) => void;
  /** Rendered above the table when selection is non-empty. */
  bulkBar?: (ids: string[]) => ReactNode;
}

function defaultSearch<T>(row: T, columns: DataColumn<T>[]): string {  const parts = columns.map((c) => {
    try {
      return c.searchValue ? c.searchValue(row) : "";
    } catch {
      return "";
    }
  });
  return parts.join(" ").toLowerCase();
}

/**
 * Client-side data table: instant search, column sort, pagination,
 * and optional bulk selection with an action bar.
 */
export function DataTable<T>({
  rows,
  columns,
  rowId,
  pageSize = 10,
  searchPlaceholder = "Search…",
  search,
  onSearchChange,
  hideSearch = false,
  hideSelectionBar = false,
  pageResetKey,
  onPageChange,
  mobileCards = true,
  storageKey,
  empty = "No rows.",
  selectable = false,
  selected = [],
  onSelect,
  bulkBar,
}: Props<T>) {
  const [internalQuery, setInternalQuery] = useState("");
  const [sort, setSort] = usePersistentState<SortState>(
    storageKey,
    { key: null, dir: 1 },
    isSortState,
  );
  const [page, setPage] = useState(1);
  const sortKey =
    sort.key === null || columns.some((c) => c.key === sort.key && c.sortValue)
      ? sort.key
      : null;
  const sortDir = sortKey !== null && sort.key === sortKey ? sort.dir : 1;
  const query = search ?? internalQuery;

  useEffect(() => {
    setPage(1);
  }, [query, pageResetKey]);

  function updateQuery(value: string) {
    if (onSearchChange) onSearchChange(value);
    else setInternalQuery(value);
  }

  function goToPage(target: number) {
    setPage(target);
    onPageChange?.();
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = q ? rows.filter((r) => defaultSearch(r, columns).includes(q)) : [...rows];
    if (sortKey) {
      const col = columns.find((c) => c.key === sortKey);
      if (col?.sortValue) {
        out.sort((a, b) => {
          const va = col.sortValue!(a);
          const vb = col.sortValue!(b);
          const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
          return cmp * sortDir;
        });
      }
    }
    return out;
  }, [rows, query, sortKey, sortDir, columns]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const pageIds = pageRows.map(rowId);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedSet.has(id));
  const somePageSelected = pageIds.some((id) => selectedSet.has(id));

  function toggleSort(key: string) {
    setPage(1);
    if (sortKey !== key) {
      setSort({ key, dir: 1 });
    } else if (sortDir === 1) {
      setSort({ key, dir: -1 });
    } else {
      setSort({ key: null, dir: 1 });
    }
  }

  function clearSort() {
    setPage(1);
    setSort({ key: null, dir: 1 });
  }

  function toggleAll() {
    if (!onSelect) return;
    if (allPageSelected) {
      onSelect(selected.filter((id) => !pageIds.includes(id)));
    } else {
      onSelect([...new Set([...selected, ...pageIds])]);
    }
  }

  function toggleOne(id: string) {
    if (!onSelect) return;
    onSelect(selectedSet.has(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  }

  return (
    <div className="space-y-3">
      {(!hideSearch || (selected.length > 0 && !hideSelectionBar)) && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 items-center gap-2">
            {!hideSearch && (
              <SearchInput
                value={query}
                onChange={updateQuery}
                placeholder={searchPlaceholder}
                ariaLabel="Search"
                className="w-full sm:max-w-2xl"
              />
            )}
            {!hideSelectionBar && selected.length > 0 && (
              <span className="whitespace-nowrap text-sm text-muted-foreground">{selected.length} selected</span>
            )}
          </div>
          {!hideSelectionBar && selected.length > 0 && bulkBar && (
            <div className="flex justify-end">{bulkBar(selected)}</div>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <>
          <div className={cn("overflow-x-auto rounded-md border", mobileCards && "hidden md:block")}>
            <Table>
              <TableHeader>
                <TableRow>
                  {selectable && (
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allPageSelected || (somePageSelected ? "indeterminate" : false)}
                        onCheckedChange={toggleAll}
                        aria-label="Select all"
                      />
                    </TableHead>
                  )}
                  {columns.map((c) => (
                    <TableHead key={c.key}>
                      {c.sortable && c.sortValue ? (
                        <div className="inline-flex items-center gap-1">
                          <button
                            className="inline-flex items-center gap-1 hover:text-foreground"
                            onClick={() => toggleSort(c.key)}
                          >
                            {c.header}
                            {sortKey !== c.key ? (
                              <ArrowsUpDownIcon className="size-3.5 opacity-50" />
                            ) : sortDir === 1 ? (
                              <ArrowUpIcon className="size-3.5" />
                            ) : (
                              <ArrowDownIcon className="size-3.5" />
                            )}
                          </button>
                          {sortKey === c.key && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  aria-label={`Clear sorting on ${c.header}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    clearSort();
                                  }}
                                >
                                  <XMarkIcon className="size-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Clear sorting</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      ) : (
                        c.header
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((row) => {
                  const id = rowId(row);
                  return (
                    <TableRow key={id} className={cn(selectedSet.has(id) && "bg-muted/50")}>
                      {selectable && (
                        <TableCell>
                          <Checkbox
                            checked={selectedSet.has(id)}
                            onCheckedChange={() => toggleOne(id)}
                            aria-label="Select row"
                          />
                        </TableCell>
                      )}
                      {columns.map((c) => (
                        <TableCell key={c.key}>{c.render(row)}</TableCell>
                      ))}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {mobileCards && (
            <div className="space-y-2 md:hidden">
              {selectable && (
                <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
                  <Checkbox
                    checked={allPageSelected || (somePageSelected ? "indeterminate" : false)}
                    onCheckedChange={toggleAll}
                    aria-label="Select all"
                  />
                  <span className="text-xs text-muted-foreground">Select all</span>
                </div>
              )}
              <ul className="space-y-2">
                {pageRows.map((row) => {
                  const id = rowId(row);
                  const primary = columns[0];
                  const actions = columns.find((c) => c.key === "actions");
                  const details = columns.slice(1).filter((c) => c.key !== "actions");
                  return (
                    <li
                      key={id}
                      className={cn(
                        "rounded-md border p-3 text-sm",
                        selectedSet.has(id) && "bg-muted/50",
                      )}
                    >
                      <div className="flex items-start gap-2">
                        {selectable && (
                          <Checkbox
                            checked={selectedSet.has(id)}
                            onCheckedChange={() => toggleOne(id)}
                            aria-label="Select row"
                            className="mt-0.5"
                          />
                        )}
                        <div className="min-w-0 flex-1">{primary?.render(row)}</div>
                      </div>
                      {details.length > 0 && (
                        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
                          {details.map((c) => (
                            <Fragment key={c.key}>
                              <dt className="text-xs text-muted-foreground">{c.header}</dt>
                              <dd className="min-w-0 break-words text-right">{c.render(row)}</dd>
                            </Fragment>
                          ))}
                        </dl>
                      )}
                      {actions && (
                        <div className="mt-2 flex flex-wrap justify-end gap-1 border-t pt-2">
                          {actions.render(row)}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}

      {filtered.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={safePage <= 1}
            onClick={() => goToPage(1)}
            aria-label="First page"
          >
            <ChevronDoubleLeftIcon className="size-4" />
          </Button>
          <Button variant="outline" size="sm" disabled={safePage <= 1} onClick={() => goToPage(safePage - 1)}>
            Previous
          </Button>
          <span className="px-1 text-xs text-muted-foreground">
            Page {safePage} of {pageCount} · {filtered.length} rows
          </span>
          <Button variant="outline" size="sm" disabled={safePage >= pageCount} onClick={() => goToPage(safePage + 1)}>
            Next
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={safePage >= pageCount}
            onClick={() => goToPage(pageCount)}
            aria-label="Last page"
          >
            <ChevronDoubleRightIcon className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

/** Left-aligned icon action with tooltip for table action columns. */
export function RowAction({
  label,
  onClick,
  disabled = false,
  loading = false,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={label}
          onClick={onClick}
          disabled={disabled || loading}
          aria-busy={loading || undefined}
        >
          {loading ? <Spinner /> : children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
