import { useMemo, useState, type ReactNode } from "react";
import { ArrowDownIcon, ArrowsUpDownIcon, ArrowUpIcon } from "@heroicons/react/24/outline";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Input } from "./ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
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

interface Props<T> {
  rows: T[];
  columns: DataColumn<T>[];
  rowId: (row: T) => string;
  pageSize?: number;
  searchPlaceholder?: string;
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
  empty = "No rows.",
  selectable = false,
  selected = [],
  onSelect,
  bulkBar,
}: Props<T>) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [page, setPage] = useState(1);

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
      setSortKey(key);
      setSortDir(1);
    } else if (sortDir === 1) {
      setSortDir(-1);
    } else {
      setSortKey(null);
      setSortDir(1);
    }
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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2">
          <Input
            placeholder={searchPlaceholder}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            className="w-full sm:max-w-2xl"
          />
          {selected.length > 0 && (
            <span className="whitespace-nowrap text-sm text-muted-foreground">{selected.length} selected</span>
          )}
        </div>
        {selected.length > 0 && bulkBar && (
          <div className="flex justify-end">{bulkBar(selected)}</div>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {selectable && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allPageSelected || (somePageSelected ? "indeterminate" : false)}
                      onCheckedChange={toggleAll}
                      aria-label="Select page"
                    />
                  </TableHead>
                )}
                {columns.map((c) => (
                  <TableHead key={c.key}>
                    {c.sortable && c.sortValue ? (
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
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {safePage} of {pageCount} · {filtered.length} rows
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Left-aligned icon action with tooltip for table action columns. */
export function RowAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" aria-label={label} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
