import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PencilIcon, PlusIcon } from "@heroicons/react/24/outline";
import { authClient } from "../lib/auth-client";
import { api, type Briefing, type BriefingSchedule } from "../lib/sidekick";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Skeleton } from "../components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { computerTimeZone, localTimeIn } from "../lib/timezones";

const TYPES = [
  { value: "morning_briefing", label: "Morning briefing (daily)", short: "Morning briefing" },
  { value: "weekly_review", label: "Weekly review", short: "Weekly review" },
  { value: "monthly_review", label: "Monthly review", short: "Monthly review" },
];

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const PAGE_SIZE = 10;

/** Read the owner-selected cadence day out of a schedule's ruleJson, if set. */
function readRule(ruleJson: string): { dayOfWeek?: number; dayOfMonth?: number } {
  try {
    const parsed = JSON.parse(ruleJson) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return {};
    const dow = Number(parsed.dayOfWeek);
    const dom = Number(parsed.dayOfMonth);
    return {
      dayOfWeek: Number.isInteger(dow) && dow >= 0 && dow <= 6 ? dow : undefined,
      dayOfMonth: Number.isInteger(dom) && dom >= 1 && dom <= 31 ? dom : undefined,
    };
  } catch {
    return {};
  }
}

/** Collapse the tolerated short aliases onto their canonical cadence. */
function cadenceFamily(type: string): string {
  if (type === "weekly") return "weekly_review";
  if (type === "monthly") return "monthly_review";
  return type;
}

/** One-line description of when a schedule fires, e.g. "every Monday at 07:00". */
function cadenceDetail(type: string, ruleJson: string, localTime: string): string {
  const rule = readRule(ruleJson);
  const family = cadenceFamily(type);
  if (family === "weekly_review" && rule.dayOfWeek !== undefined) {
    return `every ${WEEKDAYS[rule.dayOfWeek]} at ${localTime}`;
  }
  if (family === "monthly_review" && rule.dayOfMonth !== undefined) {
    return `day ${rule.dayOfMonth} of the month at ${localTime}`;
  }
  return `daily at ${localTime}`;
}

function typeLabel(type: string): string {
  const family = cadenceFamily(type);
  return TYPES.find((t) => t.value === family)?.short ?? type;
}

/** Whole-hour local times only: the Cron heartbeat runs at the top of each hour. */
function isHourlyTime(localTime: string): boolean {
  return /^\d{2}:00$/.test(localTime);
}

interface FormValues {
  type: string;
  timezone: string;
  hour: string;
  dayOfWeek: string;
  dayOfMonth: string;
}

function formFromSchedule(schedule: BriefingSchedule): FormValues {
  const rule = readRule(schedule.ruleJson);
  return {
    type: cadenceFamily(schedule.type),
    timezone: schedule.timezone,
    hour: schedule.localTime.slice(0, 2) || "07",
    dayOfWeek: String(rule.dayOfWeek ?? 1),
    dayOfMonth: String(rule.dayOfMonth ?? new Date().getDate()),
  };
}

/**
 * Create + edit share one form. The Cron only ticks hourly, so the local time
 * is an hour picker rather than a free time field.
 */
function ScheduleDialog({
  open,
  onOpenChange,
  mode,
  initial,
  orgId,
  defaultType,
  usedTypes,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  initial?: BriefingSchedule | null;
  orgId: string;
  defaultType: string;
  usedTypes: Set<string>;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<FormValues>(() =>
    initial
      ? formFromSchedule(initial)
      : {
          type: defaultType,
          timezone: computerTimeZone(),
          hour: "07",
          dayOfWeek: "1",
          dayOfMonth: String(new Date().getDate()),
        },
  );
  const [saving, setSaving] = useState(false);

  const localTime = `${values.hour}:00`;
  const type = values.type;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        orgId,
        type,
        timezone: values.timezone,
        localTime,
      };
      if (type === "weekly_review") body.dayOfWeek = Number(values.dayOfWeek);
      if (type === "monthly_review") body.dayOfMonth = Number(values.dayOfMonth);

      if (mode === "edit" && initial) {
        await api(`/api/sidekick/schedules/${initial.id}?orgId=${orgId}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        toast.success("Schedule updated");
      } else {
        await api("/api/sidekick/schedules", { method: "POST", body: JSON.stringify(body) });
        toast.success("Schedule created");
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save schedule");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Edit schedule" : "New schedule"}</DialogTitle>
          <DialogDescription>
            Briefings run on the hour and arrive by email to every admin in the workspace.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="sched-type">Type</Label>
            <Select
              value={type}
              onValueChange={(v) => setValues((prev) => ({ ...prev, type: v }))}
            >
              <SelectTrigger id="sched-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => {
                  // An edit keeps its own cadence selectable; the rest honour the
                  // one-schedule-per-cadence rule.
                  const taken = usedTypes.has(t.value) && !(mode === "edit" && initial && cadenceFamily(initial.type) === t.value);
                  return (
                    <SelectItem key={t.value} value={t.value} disabled={taken}>
                      {t.label}
                      {taken ? " — already scheduled" : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          {type === "weekly_review" && (
            <div className="space-y-2">
              <Label htmlFor="sched-dow">Day of week</Label>
              <Select value={values.dayOfWeek} onValueChange={(v) => setValues((p) => ({ ...p, dayOfWeek: v }))}>
                <SelectTrigger id="sched-dow"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WEEKDAYS.map((label, i) => (
                    <SelectItem key={label} value={String(i)}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {type === "monthly_review" && (
            <div className="space-y-2">
              <Label htmlFor="sched-dom">Day of month</Label>
              <Select value={values.dayOfMonth} onValueChange={(v) => setValues((p) => ({ ...p, dayOfMonth: v }))}>
                <SelectTrigger id="sched-dom"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <SelectItem key={d} value={String(d)}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Months with fewer days run on the last day of the month.
              </p>
            </div>
          )}
          <div className="space-y-2">
            <div className="text-xs/relaxed leading-none font-medium select-none">Timezone</div>
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs">
              {values.timezone}
              <span className="ml-2 text-muted-foreground">
                {localTimeIn(values.timezone)} local
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {mode === "edit"
                ? "This schedule keeps the timezone it was created with."
                : "Briefings run in this computer's timezone."}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sched-hour">Hour of day</Label>
            <Select value={values.hour} onValueChange={(v) => setValues((p) => ({ ...p, hour: v }))}>
              <SelectTrigger id="sched-hour"><SelectValue /></SelectTrigger>
              <SelectContent>
                {HOURS.map((h) => (
                  <SelectItem key={h} value={h}>{h}:00</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Briefings run on the hour, so the local time is always a whole hour.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : mode === "edit" ? "Save changes" : "Create schedule"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Briefing schedules + recently delivered briefings. */
export function Schedules() {
  const { data: activeOrg } = authClient.useActiveOrganization();
  const orgId = activeOrg?.id ?? null;
  const [schedules, setSchedules] = useState<BriefingSchedule[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(true);
  const [briefings, setBriefings] = useState<Briefing[]>([]);
  const [briefingsLoading, setBriefingsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [viewing, setViewing] = useState<Briefing | null>(null);
  // null = closed; otherwise the cadence being created or the schedule being edited.
  const [dialog, setDialog] = useState<{ mode: "create" | "edit"; schedule: BriefingSchedule | null } | null>(null);

  async function loadSchedules(id: string) {
    setSchedulesLoading(true);
    try {
      const data = await api<{ schedules: BriefingSchedule[] }>(`/api/sidekick/schedules?orgId=${id}`);
      setSchedules(data.schedules);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load schedules");
    } finally {
      setSchedulesLoading(false);
    }
  }

  async function loadBriefings(id: string, target: number) {
    setBriefingsLoading(true);
    try {
      const data = await api<{ briefings: Briefing[]; page: number; limit: number; hasMore: boolean }>(
        `/api/sidekick/briefings?orgId=${id}&limit=${PAGE_SIZE}&page=${target}`,
      );
      setBriefings(data.briefings);
      setHasMore(Boolean(data.hasMore));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load briefings");
    } finally {
      setBriefingsLoading(false);
    }
  }

  useEffect(() => {
    if (!orgId) return;
    void loadSchedules(orgId);
  }, [orgId]);

  useEffect(() => {
    if (!orgId) return;
    void loadBriefings(orgId, page);
  }, [orgId, page]);

  const usedTypes = new Set(schedules.map((s) => cadenceFamily(s.type)));
  const allUsed = TYPES.every((t) => usedTypes.has(t.value));
  // Creating defaults to a cadence that is still free.
  const defaultType = TYPES.find((t) => !usedTypes.has(t.value))?.value ?? "morning_briefing";

  function openCreate() {
    if (allUsed) return;
    setDialog({ mode: "create", schedule: null });
  }

  async function toggle(s: BriefingSchedule) {
    if (!orgId) return;
    try {
      await api(`/api/sidekick/schedules/${s.id}?orgId=${orgId}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !s.enabled }),
      });
      await loadSchedules(orgId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update schedule");
    }
  }

  async function removeSchedule(id: string) {
    if (!orgId || !confirm("Delete this schedule? Delivered briefings are kept.")) return;
    try {
      await api(`/api/sidekick/schedules/${id}?orgId=${orgId}`, { method: "DELETE" });
      toast.success("Schedule deleted");
      await loadSchedules(orgId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete schedule");
    }
  }

  async function removeBriefing(id: string) {
    if (!orgId || !confirm("Delete this briefing from the history? The email already sent is not affected.")) return;
    try {
      await api(`/api/sidekick/briefings/${id}?orgId=${orgId}`, { method: "DELETE" });
      toast.success("Briefing deleted");
      // Deleting the only row on a later page would strand the view on an empty
      // page, so step back; otherwise reload the page in place.
      if (briefings.length === 1 && page > 1) setPage(page - 1);
      else await loadBriefings(orgId, page);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete briefing");
    }
  }

  if (!orgId) return <p className="text-sm text-muted-foreground">Select a workspace to manage schedules.</p>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Briefings &amp; Schedules</h1>
        <p className="text-sm text-muted-foreground">
          Owner briefings run on Cloudflare Cron and arrive by email to every admin in the workspace.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div className="space-y-1.5">
            <CardTitle>Schedules</CardTitle>
            <CardDescription>One schedule per cadence — daily, weekly, monthly.</CardDescription>
          </div>
          <Button size="sm" onClick={openCreate} disabled={allUsed}>
            <PlusIcon className="size-4" />
            New schedule
          </Button>
        </CardHeader>
        <CardContent>
          {schedulesLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : schedules.length === 0 ? (
            <p className="text-sm text-muted-foreground">No schedules yet — create your first briefing schedule.</p>
          ) : (
            <ul className="space-y-2">
              {schedules.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                  <div>
                    <div className="flex items-center gap-2 font-medium">
                      {typeLabel(s.type)}
                      {s.enabled ? <Badge variant="success">on</Badge> : <Badge>off</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {cadenceDetail(s.type, s.ruleJson, s.localTime)} · {s.timezone}
                      {!isHourlyTime(s.localTime) && (
                        <span className="ml-1 text-destructive">
                          — not on the hour, so it will not fire
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setDialog({ mode: "edit", schedule: s })}>
                      <PencilIcon className="size-4" />
                      Edit
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => void toggle(s)}>
                      {s.enabled ? "Pause" : "Resume"}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => void removeSchedule(s.id)}>
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent briefings</CardTitle>
          <CardDescription>Delivered briefings for this workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          {briefingsLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : briefings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No briefings delivered yet.</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Delivered</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {briefings.map((b) => {
                    const schedule = schedules.find((s) => s.id === b.scheduleId);
                    return (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium">
                          {schedule ? typeLabel(schedule.type) : "Briefing"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={b.status === "delivered" ? "success" : b.status === "failed" ? "destructive" : "default"}>
                            {b.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(b.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => setViewing(b)}>
                              View
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => void removeBriefing(b.id)}>
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Page {page}</span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(p - 1, 1))}
                    disabled={page <= 1}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={!hasMore}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <ScheduleDialog
        // Remount on open so the form starts from the current schedule (or
        // the default values) instead of the last edit's leftovers.
        key={dialog?.mode === "edit" ? `edit-${dialog?.schedule?.id}` : "create"}
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        mode={dialog?.mode ?? "create"}
        initial={dialog?.schedule ?? null}
        orgId={orgId}
        defaultType={defaultType}
        usedTypes={usedTypes}
        onSaved={() => orgId && void loadSchedules(orgId)}
      />

      {/* View briefing */}
      <Dialog open={viewing !== null} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {viewing && schedules.find((s) => s.id === viewing.scheduleId)
                ? `${typeLabel(schedules.find((s) => s.id === viewing.scheduleId)!.type)} briefing`
                : "Briefing"}
            </DialogTitle>
            <DialogDescription>
              {viewing ? new Date(viewing.createdAt).toLocaleString() : ""}
            </DialogDescription>
          </DialogHeader>
          {viewing?.briefingText ? (
            <p className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap text-sm">{viewing.briefingText}</p>
          ) : viewing?.errorText ? (
            <p className="text-sm text-destructive">{viewing.errorText}</p>
          ) : (
            <p className="text-sm text-muted-foreground">No content was recorded for this briefing.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
