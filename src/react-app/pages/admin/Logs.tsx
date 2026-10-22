import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowPathIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Checkbox } from "../../components/ui/checkbox";
import { Input } from "../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { api } from "../../components/billing/shared";
import { AdminDenied, AdminLoading, useAdminGuard } from "./guard";

interface LogRow {
  id: string;
  createdAt: string;
  level: string;
  event: string;
  surface: string;
  message: string;
  path: string | null;
  method: string | null;
  statusCode: number | null;
  userId: string | null;
  userEmail: string | null;
  orgId: string | null;
  orgName: string | null;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
  city: string | null;
  country: string | null;
  detail: unknown;
}

interface LogPage {
  logs: LogRow[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

const LEVELS = ["info", "warn", "error"] as const;
const SURFACES = [
  "api",
  "auth",
  "billing",
  "org",
  "mcp",
  "webhook",
  "cron",
  "superadmin",
] as const;
const PAGE_SIZE = 50;

function levelBadge(level: string) {
  if (level === "error") return <Badge variant="destructive">error</Badge>;
  if (level === "warn") return <Badge variant="secondary">warn</Badge>;
  return <Badge variant="outline">info</Badge>;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

/** Where the request came from, e.g. "Austin, US". */
function originLabel(log: LogRow): string {
  const parts = [log.city, log.country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "—";
}

export function AdminLogs() {
  const allowed = useAdminGuard();
  const [data, setData] = useState<LogPage | null>(null);
  const [loading, setLoading] = useState(true);
  /** A page change is in flight - the table dims and the pager spins. */
  const [paging, setPaging] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [q, setQ] = useState("");
  const [level, setLevel] = useState("");
  const [surface, setSurface] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  /** Ids selected across the current page. */
  const [selected, setSelected] = useState<string[]>([]);

  const load = useCallback(
    async (next: { q?: string; level?: string; surface?: string; page?: number }) => {
      const params = new URLSearchParams();
      if (next.q) params.set("q", next.q);
      if (next.level) params.set("level", next.level);
      if (next.surface) params.set("surface", next.surface);
      params.set("page", String(next.page ?? 1));
      params.set("limit", String(PAGE_SIZE));
      const result = (await api(`/api/superadmin/logs?${params.toString()}`)) as unknown as LogPage;
      setData(result);
      return result;
    },
    [],
  );

  useEffect(() => {
    if (!allowed) return;
    void (async () => {
      try {
        await load({ q: "", level: "", surface: "", page: 1 });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not load logs");
      } finally {
        setLoading(false);
      }
    })();
  }, [allowed, load]);

  const total = data?.total ?? 0;
  const current = data?.page ?? 1;
  const limit = data?.limit ?? PAGE_SIZE;
  const last = Math.max(1, Math.ceil(total / limit));

  const pageIds = useMemo(() => (data?.logs ?? []).map((l) => l.id), [data]);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));
  const someOnPageSelected = !allOnPageSelected && pageIds.some((id) => selected.includes(id));

  function toggleRow(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleAllOnPage() {
    setSelected((prev) =>
      allOnPageSelected
        ? prev.filter((id) => !pageIds.includes(id))
        : [...new Set([...prev, ...pageIds])],
    );
  }

  /** Apply a filter change (resets to page 1) or a page change. */
  async function apply(overrides: Partial<{ q: string; level: string; surface: string; page: number }>) {
    const next = {
      q: overrides.q ?? q,
      level: overrides.level ?? level,
      surface: overrides.surface ?? surface,
      page: overrides.page ?? 1,
    };
    setQ(next.q);
    setLevel(next.level);
    setSurface(next.surface);
    setPaging(true);
    setExpanded(null);
    try {
      await load(next);
      // A selection belongs to the page it was made on.
      setSelected([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load logs");
    } finally {
      setPaging(false);
    }
  }

  async function goToPage(target: number) {
    if (target < 1 || target > last || target === current) return;
    await apply({ page: target });
  }

  async function deleteSelected() {
    if (selected.length === 0) return;
    const count = selected.length;
    if (!confirm(`Delete ${count} log ${count === 1 ? "entry" : "entries"}? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const result = (await api("/api/superadmin/logs", {
        method: "DELETE",
        body: JSON.stringify({ ids: selected }),
      })) as { deleted?: number };
      const removed = result.deleted ?? 0;
      toast.success(`Deleted ${removed} log ${removed === 1 ? "entry" : "entries"}`);
      setSelected([]);
      await load({ q, level, surface, page: current });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete logs");
    } finally {
      setDeleting(false);
    }
  }

  if (allowed === null || (allowed && loading)) return <AdminLoading />;
  if (allowed === false) return <AdminDenied />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Application logs</h1>
        <p className="text-sm text-muted-foreground">
          Errors and major events across every account. 90-day retention.
        </p>
      </div>

      <Card>
        {/* Title, selection actions and the filters share one row.
            w-full is required: CardHeader sets items-start, so the row would
            otherwise shrink to its content width and leave the right edge of
            the card empty. */}
        <CardHeader className="flex flex-col gap-2">
          <div className="flex w-full flex-row flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                Entries
                <span className="text-sm font-normal text-muted-foreground">
                  {total.toLocaleString()} total
                </span>
                {selected.length > 0 && (
                  <span className="text-sm font-normal text-muted-foreground">
                    [{selected.length} selected]
                  </span>
                )}
              </CardTitle>
              {/* Bulk delete appears only while something is selected. */}
              {selected.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={deleting}
                  onClick={() => void deleteSelected()}
                >
                  <TrashIcon className="size-4" />
                  Delete selected ({selected.length})
                </Button>
              )}
            </div>
            {/* ml-auto keeps the filters flush right whether they sit beside
                the headline or wrap onto their own line, and justify-end
                right-aligns the fields inside the group. The controls are
                sized so the group still leaves visible space between itself
                and the headline instead of butting up against it. */}
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              <Input
                className="w-48"
                placeholder="Search logs..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void apply({ q });
                }}
              />
              <Select value={level || "all"} onValueChange={(v) => void apply({ level: v === "all" ? "" : v })}>
                <SelectTrigger className="w-28">
                  <SelectValue placeholder="Level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All levels</SelectItem>
                  {LEVELS.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={surface || "all"}
                onValueChange={(v) => void apply({ surface: v === "all" ? "" : v })}
              >
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Surface" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All surfaces</SelectItem>
                  {SURFACES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={() => void apply({ q })}>
                Search
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void apply({ q: "", level: "", surface: "", page: 1 })}
              >
                Clear
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Free text matches message, event, user, workspace, and path.
          </p>
        </CardHeader>
        <CardContent>
          {!data || data.logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No log entries found.</p>
          ) : (
            <div className={paging ? "opacity-60 transition-opacity" : "transition-opacity"}>
              <Table
                containerClassName="max-h-[70vh] overflow-auto"
                className="w-full min-w-[55rem]"
              >
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow className="sticky top-0 z-10 bg-background">
                    <TableHead className="w-8">
                      <Checkbox
                        checked={allOnPageSelected ? true : someOnPageSelected ? "indeterminate" : false}
                        onCheckedChange={toggleAllOnPage}
                        aria-label="Select all rows on this page"
                      />
                    </TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Level</TableHead>
                    <TableHead>Surface</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Origin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.logs.map((log) => (
                    <Fragment key={log.id}>
                      <TableRow
                        data-state={selected.includes(log.id) ? "selected" : undefined}
                        className="cursor-pointer"
                        onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                      >
                        <TableCell className="w-8" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selected.includes(log.id)}
                            onCheckedChange={() => toggleRow(log.id)}
                            aria-label={`Select log ${log.event}`}
                          />
                        </TableCell>
                        <TableCell
                          className="truncate whitespace-nowrap text-muted-foreground"
                          title={formatTime(log.createdAt)}
                        >
                          {formatTime(log.createdAt)}
                        </TableCell>                        <TableCell>{levelBadge(log.level)}</TableCell>
                        <TableCell className="truncate text-muted-foreground">{log.surface}</TableCell>
                        <TableCell className="whitespace-normal wrap-anywhere font-mono text-xs">
                          {log.event}
                        </TableCell>
                        {/* The message column is bounded rather than auto-sized:
                            a long unbroken run (a JSON summary) would otherwise
                            stretch the column. `wrap-anywhere` - not
                            `break-words` - is what keeps it from pushing past
                            the column, because only `anywhere` shrinks the
                            text's min-content width. The min width keeps the
                            message readable on small screens, where the table
                            scrolls sideways instead of squeezing columns. */}
                        <TableCell className="min-w-[16rem] max-w-[34rem] whitespace-normal">
                          <div className="wrap-anywhere text-sm">{log.message}</div>
                          {(log.userEmail || log.orgName || log.path) && (
                            <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                              {log.userEmail && <span className="wrap-anywhere">{log.userEmail}</span>}
                              {log.orgName && <span className="wrap-anywhere">{log.orgName}</span>}
                              {log.path && (
                                <span className="wrap-anywhere">
                                  {log.method} {log.path}
                                  {log.statusCode ? ` → ${log.statusCode}` : ""}
                                </span>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell
                          className="truncate text-xs text-muted-foreground"
                          title={originLabel(log)}
                        >
                          {originLabel(log)}
                        </TableCell>
                      </TableRow>
                      {expanded === log.id && (
                        <TableRow>
                          <TableCell colSpan={7} className="bg-muted/40">
                            <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                              <div>
                                <dt className="text-muted-foreground">Request ID</dt>
                                <dd className="font-mono">{log.requestId ?? "—"}</dd>
                              </div>
                              <div>
                                <dt className="text-muted-foreground">IP</dt>
                                <dd className="font-mono">{log.ip ?? "—"}</dd>
                              </div>
                              <div>
                                <dt className="text-muted-foreground">Origin</dt>
                                <dd>{originLabel(log)}</dd>
                              </div>
                              <div>
                                <dt className="text-muted-foreground">User</dt>
                                <dd>
                                  {log.userEmail ?? "—"}{" "}
                                  <span className="font-mono text-muted-foreground">
                                    {log.userId ?? ""}
                                  </span>
                                </dd>
                              </div>
                              <div>
                                <dt className="text-muted-foreground">Workspace</dt>
                                <dd>
                                  {log.orgName ?? "—"}{" "}
                                  <span className="font-mono text-muted-foreground">
                                    {log.orgId ?? ""}
                                  </span>
                                </dd>
                              </div>
                              <div className="sm:col-span-2">
                                <dt className="text-muted-foreground">User agent</dt>
                                <dd className="font-mono break-all">{log.userAgent ?? "—"}</dd>
                              </div>
                              {log.detail != null && (
                                <div className="sm:col-span-2">
                                  <dt className="text-muted-foreground">Detail</dt>
                                  <dd>
                                    <pre className="mt-1 max-h-64 overflow-auto rounded-md border bg-background p-2 text-xs whitespace-pre-wrap">
                                      {JSON.stringify(log.detail, null, 2)}
                                    </pre>
                                  </dd>
                                </div>
                              )}
                            </dl>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {data && total > 0 && (
            <div className="mt-4 flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={current <= 1 || paging}
                onClick={() => void goToPage(1)}
                aria-label="First page"
              >
                <ChevronLeftIcon className="size-4" />
                <ChevronLeftIcon className="-ml-3 size-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={current <= 1 || paging}
                onClick={() => void goToPage(current - 1)}
              >
                Previous
              </Button>
              <span className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
                {paging && (
                  <ArrowPathIcon className="size-3.5 animate-spin" />
                )}
                Page {current} of {last}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={!data.hasMore || paging}
                onClick={() => void goToPage(current + 1)}
              >
                Next
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={current >= last || paging}
                onClick={() => void goToPage(last)}
                aria-label="Last page"
              >
                <ChevronRightIcon className="size-4" />
                <ChevronRightIcon className="-ml-3 size-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
