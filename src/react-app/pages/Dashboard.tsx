import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  ArrowPathIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  CircleStackIcon,
  CreditCardIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { authClient } from "../lib/auth-client";
import { useActiveOrg } from "../hooks/useActiveOrg";
import { api, type SidekickConnection } from "../lib/sidekick";
import { formatMoney, formatWholeMoney } from "../lib/money";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Skeleton } from "../components/ui/skeleton";
import { PRESET_OPTIONS, allTimeLabel, inclusiveEndDate, presetRange, type Preset } from "../lib/period";
import { readCachedOverview, sessionCacheStore, writeCachedOverview } from "../lib/overview-cache";
import { formatCount, isSeedComplete, isSyncDisabled, seedingStats } from "../lib/sync-progress";

type MetricKey = "revenue" | "jobs" | "avgTicket" | "repeatPct";

const METRIC_OPTIONS: Array<{ value: MetricKey; label: string }> = [
  { value: "revenue", label: "Revenue" },
  { value: "jobs", label: "Jobs" },
  { value: "avgTicket", label: "Average ticket" },
  { value: "repeatPct", label: "Repeat % of total" },
];

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const YEAR_COLORS = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#65a30d"];

const PIE_COLORS = ["#2563eb", "#16a34a", "#d97706", "#7c3aed", "#dc2626", "#0891b2", "#db2777", "#65a30d", "#4b5563", "#eab308"];

const WIDGETS = [
  { key: "trend", label: "Revenue trend" },
  { key: "kpis", label: "Period totals" },
  { key: "agents", label: "Referring agents" },
  { key: "inspectors", label: "Inspector performance" },
  { key: "mix", label: "Basket mix" },
] as const;

interface Overview {
  range: { from: string; to: string };
  totals: { jobs: number; completed: number; pending: number; cancelled: number; revenueMinor: number; avgTicketMinor: number | null };
  deltas: { revenuePct: number | null; jobsPct: number | null; avgTicketPct: number | null; yoyRevenuePct: number | null; yoyJobsPct: number | null };
  yoy: { jobs: number; completed: number; pending: number; cancelled: number; revenueMinor: number; avgTicketMinor: number | null };
  months: Array<{ month: string; revenueMinor: number; jobs: number; completed: number; avgTicketMinor: number | null; repeatJobs: number }>;
  quarters: Array<{ quarter: string; revenueMinor: number; jobs: number; avgTicketMinor: number | null }>;
  growth: Array<{ year: number; revenueMinor: number; growthPct: number | null }>;
  agents: Array<{ key: string; name: string; jobs: number; revenueMinor: number; lastSeen: string | null }>;
  droppedAgents: Array<{ key: string; name: string; jobs: number; revenueMinor: number; lastSeen: string | null }>;
  repeat: { repeatAgentJobs: number; oneOffAgentJobs: number };
  inspectors: Array<{ name: string; jobs: number; revenueMinor: number; avgTicketMinor: number | null; utilizationPct: number | null }>;
  basket: Array<{ name: string; jobs: number; revenueMinor: number }>;
  serviceCount: number;
  // Absent on stale servers predating the coverage field (dev hot-reload
  // skew): the card falls back to the generic loading panel, never a crash.
  serviceCoverage?: { orders: number; withServices: number };
  dataQuality: string[];
}

interface SyncStatus {
  state: string;
  provider: string | null;
  totalFetched: number;
  cursorDate: string | null;
  lastSyncedAt: number | null;
  error?: string | null;
  seedStartedAt?: number | null;
  totalEstimate?: number | null;
  backfillChunksDone?: number | null;
  backfillChunksTotal?: number | null;
}

type TrendMonth = Overview["months"][number];

function metricValue(m: TrendMonth, metric: MetricKey): number | null {
  switch (metric) {
    case "revenue": return m.revenueMinor / 100;
    case "jobs": return m.jobs;
    case "avgTicket": return m.avgTicketMinor === null ? null : m.avgTicketMinor / 100;
    case "repeatPct": return m.jobs === 0 ? null : Math.round((m.repeatJobs / m.jobs) * 1000) / 10;
  }
}

function metricTick(metric: MetricKey, v: number): string {
  if (metric === "repeatPct") return `${v}%`;
  if (metric === "revenue" || metric === "avgTicket") return moneyAxis(Math.round(v * 100));
  return `${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v)}`;
}

function metricTip(metric: MetricKey, v: number | string): string {
  if (typeof v !== "number") return String(v);
  if (metric === "repeatPct") return `${v}%`;
  if (metric === "revenue" || metric === "avgTicket") return formatMoney(Math.round(v * 100), "USD");
  return `${v}`;
}

function moneyAxis(minor: number): string {
  const v = minor / 100;
  if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(1)}k`;
  return `$${Math.round(v)}`;
}

function deltaText(v: number | null): string {
  if (v === null) return "n/a";
  return `${v > 0 ? "+" : ""}${v}%`;
}

/** Green up / red down triangle badge for period comparisons (whole percent). */
function DeltaBadge({ value, label }: { value: number | null; label: string }) {
  if (value === null) return <span className="text-xs text-muted-foreground">vs {label} n/a</span>;
  const rounded = Math.round(value);
  const flat = rounded === 0;
  const up = rounded > 0;
  return (
    <span className={`inline-flex items-center gap-1 text-sm font-medium ${flat ? "text-muted-foreground" : up ? "text-green-600" : "text-red-600"}`}>
      <span aria-hidden="true">{flat ? "■" : up ? "▲" : "▼"}</span>
      {up ? "+" : ""}{rounded}%
      <span className="text-xs font-normal text-muted-foreground">vs {label}</span>
    </span>
  );
}

/** Seeding headline: live counts, rate, and an ETA when the vendor total is
 * known — determinate bar then, gliding shimmer otherwise. Recomputes on
 * every status poll, so elapsed time stays fresh without its own timer.
 * The headline follows the sync phase: bulk order windows first, then the
 * service-detail tail. */
function SeedProgress({ sync, title = "Syncing your history" }: { sync: SyncStatus; title?: string }) {
  const { line, pct } = seedingStats(sync);
  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-2 text-sm font-medium">
        <ArrowPathIcon className="size-4 animate-spin text-muted-foreground" />
        {title}
      </p>
      <p className="text-xs text-muted-foreground">{line}</p>
      <div
        role="progressbar"
        aria-label="Syncing inspection history"
        aria-valuetext={line}
        {...(pct !== null ? { "aria-valuenow": pct, "aria-valuemin": 0, "aria-valuemax": 100 } : {})}
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        {pct !== null ? (
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
        ) : (
          <div className="h-full w-1/3 rounded-full bg-primary animate-[seed-slide_1.4s_ease-in-out_infinite]" />
        )}
      </div>
    </div>
  );
}

/** Basket card loading: service enrichment progress for the selected range —
 * how many of its orders already carry service detail — not the overall
 * order-sync progress shown at the top of the page. */
function BasketSyncing({ coverage }: { coverage: { orders: number; withServices: number } }) {
  if (coverage.orders === 0) {
    return <p className="text-sm text-muted-foreground">No orders in this period yet.</p>;
  }
  const pct = Math.min(100, Math.round((coverage.withServices / coverage.orders) * 100));
  const line = `${formatCount(coverage.withServices)} of ${formatCount(coverage.orders)} orders have service detail`;
  return (
    <div className="space-y-3 py-2" aria-label="Loading service mix">
      <p className="flex items-center gap-2 text-sm font-medium">
        <ArrowPathIcon className="size-4 animate-spin text-muted-foreground" />
        Syncing service detail
      </p>
      <p className="text-xs text-muted-foreground">{line} — newest orders first.</p>
      <div
        role="progressbar"
        aria-label="Service detail progress"
        aria-valuetext={line}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** SNIPE Intelligence analytics dashboard, read from the local warehouse. */
export function Dashboard() {
  const { data: activeOrg } = authClient.useActiveOrganization();
  const { superadmin, loading: orgLoading } = useActiveOrg();
  const orgId = activeOrg?.id ?? null;

  const [connections, setConnections] = useState<SidekickConnection[]>([]);
  const [businessProfile, setBusinessProfile] = useState<{ businessName: string | null; trade: string | null } | null>(null);
  const [subscription, setSubscription] = useState<{ status: string; trialEndsAt?: number | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [gettingStartedOpen, setGettingStartedOpen] = useState(true);

  const [preset, setPreset] = useState<Preset>("12m");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [metric, setMetric] = useState<MetricKey>("revenue");
  const [yearsOn, setYearsOn] = useState<number[] | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [sync, setSync] = useState<SyncStatus | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Last completed manual refresh (unix seconds): keeps Sync now clickable
  // right after your own click, even while the background seed heartbeats.
  const lastManualRef = useRef<number | null>(null);
  const [visible, setVisible] = useState<string[]>(WIDGETS.map((w) => w.key));
  const [customOpen, setCustomOpen] = useState(false);
  const [targetEdits, setTargetEdits] = useState<Record<string, string>>({});
  // Saved jobs-per-day targets by inspector (org-wide setting, shown as text).
  const [targets, setTargets] = useState<Record<string, number>>({});
  // Inspector row currently being edited; null means every row shows its saved value.
  const [editingTarget, setEditingTarget] = useState<string | null>(null);
  // Earliest order date in the warehouse: anchors the All-time preset.
  // Null until the range endpoint answers (2000 fallback meanwhile).
  const [historyStart, setHistoryStart] = useState<string | null>(null);

  const range = useMemo(() => presetRange(preset, customFrom, customTo, new Date(), historyStart), [preset, customFrom, customTo, historyStart]);

  // Year-over-year overlay: one full Jan to Dec axis, one line per year.
  // Lines follow the growth series, which starts at the first full year, so
  // a partial starting year never draws a misleading bridged line.
  const trendYears = useMemo(() => (overview?.growth ?? []).map((g) => g.year), [overview]);
  const visibleYears = yearsOn ?? trendYears;
  const trendRows = useMemo(() => {
    const byMonth = new Map((overview?.months ?? []).map((m) => [m.month, m]));
    return MONTH_LABELS.map((label, i) => {
      const row: Record<string, string | number | null> = { m: label };
      for (const y of visibleYears) {
        const m = byMonth.get(`${y}-${String(i + 1).padStart(2, "0")}`);
        row[String(y)] = m ? metricValue(m, metric) : null;
      }
      return row;
    });
  }, [overview, visibleYears, metric]);

  function toggleYear(y: number) {
    setYearsOn((prev) => {
      const cur = prev ?? trendYears;
      return cur.includes(y) ? cur.filter((x) => x !== y) : [...cur, y].sort((a, b) => a - b);
    });
  }
  // Latest applied overview request: only the newest response wins, so rapid
  // period changes (or a double-invoked mount effect) never stack stale data.
  const overviewReq = useRef(0);
  const hasOverview = useRef(false);
  // The range effect must wait until the saved period resolves: otherwise the
  // first overview fires with the default 30d and refires once the period
  // lands, doubling the heaviest request on every visit.
  const [periodReady, setPeriodReady] = useState(false);

  const loadStatus = useCallback(async (id: string) => {
    try {
      const data = await api<{ status: SyncStatus }>(`/api/analytics/status?orgId=${id}`);
      setSync(data.status);
      return data.status;
    } catch {
      return null;
    }
  }, []);

  // Stable callback: cache-first within the tab session. Reloads, preset
  // switches back to a seen range, and org switches to a seen range render
  // instantly from sessionStorage; only explicit actions (Refresh button,
  // Sync click, target save) pass force to refetch. It must NOT depend on
  // `overview`, or every successful fetch would create a new callback
  // identity and re-trigger the effect into an infinite request loop.
  const loadOverview = useCallback(async (id: string, from: string, to: string, opts?: { force?: boolean }) => {
    const req = (overviewReq.current += 1);
    if (!opts?.force) {
      const hit = readCachedOverview<Overview>(sessionCacheStore(), id, from, to);
      if (hit) {
        hasOverview.current = true;
        setOverview(hit);
        setOverviewLoading(false);
        return;
      }
    }
    setOverviewLoading(true);
    try {
      const data = await api<{ overview: Overview }>(
        `/api/analytics/overview?orgId=${id}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      );
      if (req !== overviewReq.current) return;
      hasOverview.current = true;
      setOverview(data.overview);
      writeCachedOverview(sessionCacheStore(), id, from, to, data.overview);
    } catch (err) {
      if (req !== overviewReq.current) return;
      if (!hasOverview.current) toast.error(err instanceof Error ? err.message : "Could not load analytics");
    } finally {
      if (req === overviewReq.current) setOverviewLoading(false);
    }
  }, []);

  const loadTargets = useCallback(async (id: string) => {
    try {
      const data = await api<{ targets: Array<{ inspectorName: string; jobsPerDay: number }> }>(
        `/api/analytics/targets?orgId=${id}`,
      );
      setTargets(Object.fromEntries(data.targets.map((t) => [t.inspectorName, t.jobsPerDay])));
    } catch {
      // Targets are auxiliary; the table renders with "not set" when unreadable.
    }
  }, []);

  const loadHistoryStart = useCallback(async (id: string) => {
    try {
      const data = await api<{ range: { minScheduledAt: string | null } }>(`/api/analytics/range?orgId=${id}`);
      setHistoryStart(data.range.minScheduledAt);
    } catch {
      // Falls back to 2000; the next mount or explicit refresh retries.
    }
  }, []);

  useEffect(() => {
    if (!orgId) { setLoading(false); return; }
    setLoading(true);
    prevSyncState.current = null;
    Promise.all([
      api<{ overview: { connections: SidekickConnection[] } }>(`/api/sidekick/overview?orgId=${orgId}`).catch(() => null),
      fetch(`/api/billing/subscription?orgId=${orgId}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      api<{ profile: { businessName: string | null; trade: string | null } | null }>(`/api/sidekick/business-profile?orgId=${orgId}`).catch(() => null),
      api<{ layout: { widgetsJson: string; defaultRange: string } }>(`/api/analytics/layout?orgId=${orgId}`).catch(() => null),
      api<{ period: { preset: string; customFrom: string | null; customTo: string | null } | null }>(`/api/analytics/period?orgId=${orgId}`).catch(() => null),
    ])
      .then(([ov, sub, bp, layout, pref]) => {
        setConnections(ov?.overview.connections ?? []);
        setSubscription((sub as { subscription?: { status: string; trialEndsAt?: number | null } | null })?.subscription ?? null);
        setBusinessProfile(bp?.profile ?? null);
        try {
          const parsed = JSON.parse(layout?.layout.widgetsJson ?? "[]") as unknown;
          if (Array.isArray(parsed) && parsed.length > 0) setVisible(parsed.filter((x): x is string => typeof x === "string"));
        } catch { /* keep defaults */ }
        // Personal period choice wins; the org default applies on first visit.
        const savedPeriod = pref?.period;
        if (savedPeriod && PRESET_OPTIONS.some((o) => o.value === savedPeriod.preset)) {
          setPreset(savedPeriod.preset as Preset);
          if (savedPeriod.preset === "custom") {
            if (savedPeriod.customFrom) setCustomFrom(savedPeriod.customFrom);
            if (savedPeriod.customTo) setCustomTo(savedPeriod.customTo);
          }
        } else if (layout?.layout.defaultRange && PRESET_OPTIONS.some((o) => o.value === layout.layout.defaultRange)) {
          setPreset(layout.layout.defaultRange as Preset);
        }
        setPeriodReady(true);
        void loadStatus(orgId);
        void loadTargets(orgId);
        void loadHistoryStart(orgId);
      })
      .finally(() => setLoading(false));
  }, [orgId, loadStatus, loadTargets, loadHistoryStart]);

  useEffect(() => {
    if (!orgId || !periodReady) return;
    void loadOverview(orgId, range.from, range.to);
  }, [orgId, periodReady, range.from, range.to, loadOverview]);

  // While backfilling, the open tab itself carries the seed home: every poll
  // that finds no other worker active fires one refresh (2 chunks plus up to
  // 500 enrichments). This is the third engine alongside the connect-time run
  // and cron, and the only one that runs in local dev. Overlaps are safe
  // (idempotent upserts) and rare: a fresh heartbeat means cron or another
  // tab just worked, so this tab stands down — except when chaining its own
  // runs, which keeps dev seeds moving instead of idling 90s between cycles.
  // Only visible tabs drive, and the driver never reloads the charts except
  // once: on the backfilling-to-live flip it forces one overview reload so
  // the completed numbers show without a manual refresh. Otherwise it only
  // advances sync state plus the seeding banner. Charts render from the
  // session cache (one entry per org and range, so reloads are instant) and
  // refetch only on explicit user actions (Refresh button, Sync click,
  // target save, or a never-seen range).
  // The tab keeps driving after the flip to live while the selected range's
  // basket still needs services: live runs only re-touch the head window, so
  // without this the tail would never enrich in dev and the mix would sit at
  // zero forever. In prod the hourly cron shares that tail work.
  const basketNeedsData =
    !!overview &&
    overview.basket.length === 0 &&
    !!overview.serviceCoverage &&
    overview.serviceCoverage.orders > overview.serviceCoverage.withServices;
  const lastAutoRef = useRef(0);
  // Last sync state seen by the driver: detects the backfilling-to-live
  // flip so the charts reload exactly once when a seed finishes.
  const prevSyncState = useRef<string | null>(null);
  useEffect(() => {
    const driving = !!orgId && (sync?.state === "backfilling" || basketNeedsData);
    if (!driving) return;
    const t = setInterval(() => {
      void loadStatus(orgId!).then((s) => {
        if (!s) return;
        const prev = prevSyncState.current;
        prevSyncState.current = s.state;
        // Seed just finished: one forced overview reload so the completed
        // numbers show without a manual refresh. Forced past the session
        // cache, which still holds the mid-seed figures.
        if (prev === "backfilling" && s.state === "live") {
          void loadOverview(orgId!, range.from, range.to, { force: true });
        }
        // Never drive on terminal states (bad credentials): the error alert
        // owns that surface, and retries would only hammer a dead connection.
        if (s.state !== "backfilling" && !(s.state === "live" && basketNeedsData)) return;
        if (refreshing) return;
        if (document.visibilityState !== "visible") return;
        const nowSec = Math.floor(Date.now() / 1000);
        const ageSec = s.lastSyncedAt ? nowSec - s.lastSyncedAt : Infinity;
        const chaining = nowSec - lastAutoRef.current < 120;
        if (ageSec > 90 || chaining) {
          lastAutoRef.current = nowSec;
          void manualRefresh(true);
        }
      });
    }, 15000);
    return () => clearInterval(t);
  }, [orgId, sync?.state, basketNeedsData, loadStatus, loadOverview, refreshing, range.from, range.to]);

  async function manualRefresh(silent = false) {
    if (!orgId || refreshing) return;
    setRefreshing(true);
    try {
      await api(`/api/analytics/refresh?orgId=${orgId}`, { method: "POST", body: JSON.stringify({ orgId }) });
      if (!silent) toast.success("Sync check started");
      await loadStatus(orgId);
      // Silent auto-driver runs never reload the charts; explicit clicks do.
      // Explicit runs also re-read the history start: a deepening backfill
      // moves the All-time anchor earlier.
      if (!silent) {
        await loadHistoryStart(orgId);
        await loadOverview(orgId, range.from, range.to, { force: true });
      }
    } catch (err) {
      if (!silent) toast.error(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      lastManualRef.current = Math.floor(Date.now() / 1000);
      setRefreshing(false);
    }
  }

  async function saveLayout(next: string[]) {
    setVisible(next);
    if (!orgId) return;
    try {
      await api("/api/analytics/layout", { method: "PUT", body: JSON.stringify({ orgId, widgetsJson: JSON.stringify(next), defaultRange: preset }) });
    } catch {
      toast.error("Could not save layout");
    }
  }

  // Personal period choice, saved silently in the background (a failure just
  // means the choice reverts to the org default on the next visit).
  function savePeriod(nextPreset: Preset, nextFrom: string, nextTo: string) {
    if (!orgId) return;
    const body: { orgId: string; preset: Preset; customFrom?: string; customTo?: string } = { orgId, preset: nextPreset };
    if (nextPreset === "custom") {
      if (/^\d{4}-\d{2}-\d{2}$/.test(nextFrom)) body.customFrom = nextFrom;
      if (/^\d{4}-\d{2}-\d{2}$/.test(nextTo)) body.customTo = nextTo;
    }
    void api("/api/analytics/period", { method: "PUT", body: JSON.stringify(body) }).catch(() => undefined);
  }

  async function saveTarget(name: string) {
    if (!orgId) return;
    const v = Number(targetEdits[name] ?? "");
    if (!Number.isFinite(v) || v <= 0) { toast.error("Enter a jobs per day target above zero"); return; }
    try {
      await api("/api/analytics/targets", { method: "PUT", body: JSON.stringify({ orgId, inspectorName: name, jobsPerDay: v }) });
      toast.success("Capacity target saved");
      setTargets((s) => ({ ...s, [name]: v }));
      setEditingTarget(null);
      await loadOverview(orgId, range.from, range.to, { force: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save target");
    }
  }

  if (!orgLoading && superadmin) return <Navigate to="/superadmin" replace />;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      </div>
    );
  }

  if (!orgId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Welcome to SNIPE Intelligence™</CardTitle>
          <CardDescription>Create a workspace to connect your business platform.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild><Link to="/onboarding">Get started</Link></Button>
        </CardContent>
      </Card>
    );
  }

  const trialDaysLeft =
    subscription?.status === "trialing" && subscription.trialEndsAt
      ? Math.max(0, Math.ceil((subscription.trialEndsAt - Date.now() / 1000) / 86400))
      : null;
  const trialExpired = subscription?.status === "trial_expired";
  // Seeding section hides the moment the data is demonstrably complete —
  // live, or fetched count covering the vendor total — never waiting on the
  // status flip for rows that are already in the warehouse.
  const seeding = sync ? !isSeedComplete(sync) && sync.state === "backfilling" : false;
  const syncDisabled = isSyncDisabled({
    state: sync?.state,
    lastSyncedAt: sync?.lastSyncedAt ?? null,
    refreshing,
    lastManualAtSec: lastManualRef.current,
    nowSec: Math.floor(Date.now() / 1000),
  });

  const checklist = [
    { label: "Create your workspace", done: true, to: null as string | null, action: null as string | null },
    { label: "Complete your business profile", done: Boolean(businessProfile?.businessName && businessProfile?.trade), to: "/business-profile", action: "Complete" },
    { label: "Start your trial or subscribe", done: subscription !== null && ["trialing", "active", "canceled"].includes(subscription.status), to: "/billing", action: "Subscribe" },
    { label: "Connect your platform", done: connections.length > 0, to: "/connections", action: "Connect" },
  ];
  const pendingSteps = checklist.filter((s) => !s.done);
  const t = overview?.totals;
  // Whole calendar months covered by the selected range, for monthly averages.
  const rangeSpanMs = new Date(range.to).getTime() - new Date(range.from).getTime();
  // Year-over-year deltas only read honestly on windows up to a year: longer
  // ranges overlap their own shifted comparison almost entirely.
  const showYoY = Number.isFinite(rangeSpanMs) && rangeSpanMs > 0 && rangeSpanMs <= 365 * 86400000;
  const rangeMonths = !Number.isFinite(rangeSpanMs) || rangeSpanMs <= 0 ? 1 : Math.max(1, Math.round(rangeSpanMs / 86400000 / 30.44));
  const repeatTotal = (overview?.repeat.repeatAgentJobs ?? 0) + (overview?.repeat.oneOffAgentJobs ?? 0);
  const repeatPct = repeatTotal > 0 ? Math.round(((overview?.repeat.repeatAgentJobs ?? 0) / repeatTotal) * 100) : null;
  const oneOffPct = repeatTotal > 0 ? Math.round(((overview?.repeat.oneOffAgentJobs ?? 0) / repeatTotal) * 100) : null;

  return (
    <div className="space-y-4">
      {pendingSteps.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div className="space-y-1.5">
              <CardTitle>Getting started</CardTitle>
              <CardDescription>{pendingSteps.length} step{pendingSteps.length === 1 ? "" : "s"} left to finish setting up {activeOrg?.name ?? "your workspace"}.</CardDescription>
            </div>
            <Button variant="ghost" size="icon-sm" aria-expanded={gettingStartedOpen} aria-label={gettingStartedOpen ? "Hide getting started" : "Show getting started"} onClick={() => setGettingStartedOpen((v) => !v)}>
              <ChevronDownIcon className={`size-4 transition-transform duration-300 ${gettingStartedOpen ? "" : "-rotate-180"}`} />
            </Button>
          </CardHeader>
          <div className={`grid transition-all duration-300 ease-in-out ${gettingStartedOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
            <div className="overflow-hidden">
              <CardContent>
                <ul className="space-y-2">
                  {checklist.map((s) => (
                    <li key={s.label} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2">
                        {s.done ? <CheckCircleIcon className="size-5 shrink-0 text-green-600" aria-label="Completed" /> : <span className="size-5 shrink-0 rounded-full border-2 border-muted-foreground/40" aria-label="Pending" />}
                        <span className={s.done ? "text-muted-foreground" : "font-medium"}>{s.label}</span>
                      </span>
                      {!s.done && s.to && <Button variant="outline" size="sm" asChild><Link to={s.to}>{s.action}</Link></Button>}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </div>
          </div>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">SNIPE Intelligence™</h1>
          <p className="text-sm text-muted-foreground">Revenue, jobs, agents, and inspector load from your synced orders.</p>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void manualRefresh()}
              disabled={syncDisabled}
              title={syncDisabled && !refreshing ? "Syncing in progress — runs automatically" : undefined}
            >
              <ArrowPathIcon className={`size-4 ${refreshing ? "animate-spin" : ""}`} /> {refreshing ? "Syncing" : "Sync now"}
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/connections"><CircleStackIcon className="size-4" /> Manage data sources</Link>
            </Button>
          </div>
          {sync?.lastSyncedAt && <span className="text-xs text-muted-foreground">Synced {new Date(sync.lastSyncedAt * 1000).toLocaleString()}</span>}
        </div>
      </div>

      {connections.length === 0 && (
        <Alert>
          <ExclamationTriangleIcon className="size-4" />
          <AlertTitle>No provider connected</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-2">
            Connect Spectora or ISN to start the seeded analytics warehouse.
            <Button variant="outline" size="sm" asChild><Link to="/connections">Connect <ArrowRightIcon className="size-4" /></Link></Button>
          </AlertDescription>
        </Alert>
      )}

      {seeding && sync && (
        <SeedProgress sync={sync} />
      )}
      {sync?.state === "error" && (
        <Alert>
          <ExclamationTriangleIcon className="size-4" />
          <AlertTitle>Sync needs attention</AlertTitle>
          <AlertDescription>{sync.error ?? "Provider sync failed."} Check the connection, then use Sync now.</AlertDescription>
        </Alert>
      )}

      {trialDaysLeft !== null && (
        <Alert>
          <AlertTitle>SNIPE Intelligence™ trial: {trialDaysLeft} day{trialDaysLeft === 1 ? "" : "s"} left</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-2">
            Full access until the trial ends. No card required yet.
            <Button variant="outline" size="sm" asChild><Link to="/billing">Subscribe <ArrowRightIcon className="size-4" /></Link></Button>
          </AlertDescription>
        </Alert>
      )}

      {trialExpired ? (
        <Card>
          <CardHeader>
            <CardTitle>Trial ended: subscribe to restore access</CardTitle>
            <CardDescription>Your scorecard and reports are paused. Your data is retained.</CardDescription>
          </CardHeader>
          <CardContent><Button asChild><Link to="/billing">Go to billing</Link></Button></CardContent>
        </Card>
      ) : (
        <>
          {/* Sticky below the app header (h-14, z-30) so the period controls stay in reach while scrolling. */}
          <Card className="sticky top-14 z-20 bg-card/95 py-0 backdrop-blur">
            <CardContent className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
              <Label htmlFor="dash-preset" className="text-xs text-muted-foreground">Period:</Label>
              <Select value={preset} onValueChange={(v) => {
                  const next = v as Preset;
                  // Prefill custom with the current range so switching to it
                  // resolves to the identical range: no refetch, no new figures.
                  let from = customFrom;
                  let to = customTo;
                  if (next === "custom" && preset !== "custom") {
                    from = range.from.slice(0, 10);
                    to = inclusiveEndDate(range.to);
                    setCustomFrom(from);
                    setCustomTo(to);
                  }
                  setPreset(next);
                  savePeriod(next, from, to);
                }}>
                  <SelectTrigger id="dash-preset" className="h-8 w-56"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRESET_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.value === "all" ? allTimeLabel(historyStart) : o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              {preset === "custom" && (
                <>
                  <Label htmlFor="dash-from" className="text-xs text-muted-foreground">From:</Label>
                  <Input id="dash-from" type="date" className="h-8 w-auto" value={customFrom} onChange={(e) => { setCustomFrom(e.target.value); savePeriod("custom", e.target.value, customTo); }} />
                  <Label htmlFor="dash-to" className="text-xs text-muted-foreground">To:</Label>
                  <Input id="dash-to" type="date" className="h-8 w-auto" value={customTo} onChange={(e) => { setCustomTo(e.target.value); savePeriod("custom", customFrom, e.target.value); }} />
                </>
              )}
              {/* Charts-only reload for this period: no provider sync, no D1 writes. */}
              <Button
                variant="ghost"
                size="sm"
                disabled={overviewLoading || !orgId}
                title="Reload charts for this period"
                onClick={() => { if (orgId) void loadOverview(orgId, range.from, range.to, { force: true }); }}
              >
                <ArrowPathIcon className={overviewLoading ? "size-4 animate-spin" : "size-4"} /> Refresh
              </Button>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                {overviewLoading && (
                  <span role="status" className="flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
                    <ArrowPathIcon className="size-3.5 animate-spin" /> Updating charts for the new period
                  </span>
                )}
                <Button variant="ghost" size="sm" onClick={() => setCustomOpen((v) => !v)}>{customOpen ? "Hide widgets" : "Manage widgets"}</Button>
              </div>
            </CardContent>
            {customOpen && (
              <CardContent className="flex flex-wrap gap-3 border-t pt-3">
                {WIDGETS.map((w) => (
                  <label key={w.key} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={visible.includes(w.key)}
                      onChange={() => {
                        const next = visible.includes(w.key) ? visible.filter((x) => x !== w.key) : [...visible, w.key];
                        void saveLayout(next);
                      }}
                    />
                    {w.label}
                  </label>
                ))}
              </CardContent>
            )}
          </Card>

          {overviewLoading && !overview ? (
            <div className="grid gap-4 sm:grid-cols-4"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
          ) : overview && t ? (
            // While the new period loads, keep the previous charts visible but
            // dimmed and non-interactive so the change reads as in progress.
            <div aria-busy={overviewLoading} className={overviewLoading ? "pointer-events-none space-y-4 opacity-60 transition-opacity" : "space-y-4"}>
              {visible.includes("kpis") && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Revenue, period</CardTitle></CardHeader><CardContent><div className="flex flex-wrap items-baseline gap-x-2"><span className="text-2xl font-bold">{formatWholeMoney(t.revenueMinor, "USD")}</span><span className="text-xs text-muted-foreground">avg {formatWholeMoney(Math.round(t.revenueMinor / rangeMonths), "USD")}/mo</span></div><div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">{showYoY && <DeltaBadge value={overview.deltas.yoyRevenuePct} label="Previous year" />}<DeltaBadge value={overview.deltas.revenuePct} label="Prior period" /></div></CardContent></Card>
                  <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Jobs</CardTitle></CardHeader><CardContent><div className="flex flex-wrap items-baseline gap-x-2"><span className="text-2xl font-bold">{t.jobs}</span><span className="text-xs text-muted-foreground">avg {Math.round(t.jobs / rangeMonths)}/mo</span></div><p className="text-xs text-muted-foreground">{t.completed} completed : {t.pending} pending : {t.cancelled} cancelled</p><div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">{showYoY && <DeltaBadge value={overview.deltas.yoyJobsPct} label="Previous year" />}<DeltaBadge value={overview.deltas.jobsPct} label="Prior period" /></div></CardContent></Card>
                  <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Average ticket</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{t.avgTicketMinor === null ? "n/a" : formatWholeMoney(t.avgTicketMinor, "USD")}</div><div className="mt-1 flex flex-wrap gap-x-3 gap-y-1"><DeltaBadge value={overview.deltas.avgTicketPct} label="Prior period" /></div></CardContent></Card>
                  <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Repeat vs one off</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{overview.repeat.repeatAgentJobs} <span className="text-sm font-normal text-muted-foreground">repeat{repeatPct === null ? "" : ` (${repeatPct}%)`}</span></div><p className="text-xs text-muted-foreground">{overview.repeat.oneOffAgentJobs} one off{oneOffPct === null ? "" : ` (${oneOffPct}%)`} in period</p></CardContent></Card>
                </div>
              )}

              {visible.includes("trend") && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex flex-wrap items-center gap-1.5">
                      <Select value={metric} onValueChange={(v) => setMetric(v as MetricKey)}>
                        <SelectTrigger aria-label="Trend metric" className="h-auto gap-1 rounded-md border-0 bg-muted px-2 py-0.5 text-sm font-bold shadow-none">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {METRIC_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span>by month, overlaid by year</span>
                    </CardTitle>
                    <CardDescription>One full January to December axis. Toggle years below to compare seasons across years.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-3 flex flex-wrap gap-2">
                      {trendYears.map((y, i) => {
                        const on = visibleYears.includes(y);
                        return (
                          <button
                            key={y}
                            type="button"
                            onClick={() => toggleYear(y)}
                            aria-pressed={on}
                            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-opacity ${on ? "" : "opacity-40"}`}
                          >
                            <span className="size-2.5 rounded-full" style={{ backgroundColor: YEAR_COLORS[i % YEAR_COLORS.length] }} />
                            {y}
                          </button>
                        );
                      })}
                    </div>
                  </CardContent>
                  <CardContent className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendRows}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="m" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={(v: number) => metricTick(metric, v)} width={60} />
                        <Tooltip formatter={(v) => metricTip(metric, typeof v === "number" ? v : String(v))} />
                        <Legend />
                        {visibleYears.map((y) => (
                          <Line
                            key={y}
                            type="monotone"
                            dataKey={String(y)}
                            name={String(y)}
                            stroke={YEAR_COLORS[trendYears.indexOf(y) % YEAR_COLORS.length]}
                            strokeWidth={2}
                            dot={false}
                            connectNulls
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                  <CardContent>
                    <div className="grid items-center gap-4 md:grid-cols-2">
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={overview.growth.map((g) => ({ year: String(g.year), revenue: g.revenueMinor / 100, growth: g.growthPct }))}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                            <YAxis yAxisId="left" tickFormatter={(v: number) => metricTick("revenue", v)} width={60} />
                            <YAxis yAxisId="right" orientation="right" tickFormatter={(v: number) => `${v}%`} width={52} />
                            <Tooltip
                              formatter={(v, name) => {
                                if (name === "Growth %") return [typeof v === "number" ? `${v}%` : v, name];
                                return [metricTip("revenue", typeof v === "number" ? v : String(v)), name];
                              }}
                            />
                            <Legend />
                            <Bar yAxisId="left" dataKey="revenue" name="Revenue" fill="#2563eb" />
                            <Line yAxisId="right" type="monotone" dataKey="growth" name="Growth %" stroke="#16a34a" strokeWidth={2} dot connectNulls />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                      <div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead><tr className="text-left text-muted-foreground"><th className="py-1 pr-4">Year</th><th className="py-1 pr-4">Revenue</th><th className="py-1">Growth</th></tr></thead>
                            <tbody>
                              {overview.growth.map((g) => (
                                <tr key={g.year} className="border-t"><td className="py-1 pr-4">{g.year}</td><td className="py-1 pr-4">{formatMoney(g.revenueMinor, "USD")}</td><td className="py-1">{deltaText(g.growthPct)}</td></tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">Same period last year: {formatMoney(overview.yoy.revenueMinor, "USD")} revenue, {overview.yoy.jobs} jobs.</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {visible.includes("agents") && (
                <div className="grid gap-4 lg:grid-cols-2">
                  <Card>
                    <CardHeader><CardTitle>Producing agents</CardTitle><CardDescription>Ranked by completed revenue in period.</CardDescription></CardHeader>
                    <CardContent>
                      {overview.agents.length === 0 ? <p className="text-sm text-muted-foreground">No referring agents in this period.</p> : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead><tr className="text-left text-muted-foreground"><th className="py-1 pr-4">Agent</th><th className="py-1 pr-4">Jobs</th><th className="py-1">Revenue</th></tr></thead>
                            <tbody>
                              {overview.agents.slice(0, 10).map((a) => (
                                <tr key={a.key} className="border-t"><td className="py-1 pr-4">{a.name}</td><td className="py-1 pr-4">{a.jobs}</td><td className="py-1">{formatMoney(a.revenueMinor, "USD")}</td></tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader><CardTitle>Dropped off</CardTitle><CardDescription>Produced in the prior period, zero jobs in this one.</CardDescription></CardHeader>
                    <CardContent>
                      {overview.droppedAgents.length === 0 ? <p className="text-sm text-muted-foreground">No drop offs detected.</p> : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead><tr className="text-left text-muted-foreground"><th className="py-1 pr-4">Agent</th><th className="py-1 pr-4">Prior jobs</th><th className="py-1">Last seen</th></tr></thead>
                            <tbody>
                              {overview.droppedAgents.slice(0, 10).map((a) => (
                                <tr key={a.key} className="border-t"><td className="py-1 pr-4">{a.name}</td><td className="py-1 pr-4">{a.jobs}</td><td className="py-1">{a.lastSeen ? new Date(a.lastSeen).toLocaleDateString() : "n/a"}</td></tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}

              {visible.includes("inspectors") && (
                <Card>
                  <CardHeader><CardTitle>Inspector performance and utilization</CardTitle><CardDescription>Utilization equals jobs divided by active days times your jobs per day target. Set targets inline.</CardDescription></CardHeader>
                  <CardContent>
                    {overview.inspectors.length === 0 ? <p className="text-sm text-muted-foreground">No inspector attributions in this period.</p> : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead><tr className="text-left text-muted-foreground"><th className="py-1 pr-4">Inspector</th><th className="py-1 pr-4">Jobs</th><th className="py-1 pr-4">Revenue</th><th className="py-1 pr-4">Utilization</th><th className="py-1">Jobs per day target</th></tr></thead>
                          <tbody>
                            {overview.inspectors.map((ins) => (
                              <tr key={ins.name} className="border-t">
                                <td className="py-1 pr-4">{ins.name}</td>
                                <td className="py-1 pr-4">{ins.jobs}</td>
                                <td className="py-1 pr-4">{formatMoney(ins.revenueMinor, "USD")}</td>
                                <td className="py-1 pr-4">{ins.utilizationPct === null ? "set target" : `${ins.utilizationPct}%`}</td>
                                <td className="py-1">
                                  {editingTarget === ins.name ? (
                                    <div className="flex gap-2">
                                      <Input className="h-8 w-20" inputMode="decimal" placeholder="2" value={targetEdits[ins.name] ?? ""} onChange={(e) => setTargetEdits((s) => ({ ...s, [ins.name]: e.target.value }))} aria-label={`Jobs per day target for ${ins.name}`} />
                                      <Button variant="outline" size="sm" onClick={() => void saveTarget(ins.name)}>Save</Button>
                                      <Button variant="ghost" size="sm" onClick={() => setEditingTarget(null)}>Cancel</Button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <span className="min-w-10 text-sm">{targets[ins.name] ?? "not set"}</span>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                          setTargetEdits((s) => ({ ...s, [ins.name]: targets[ins.name] !== undefined ? String(targets[ins.name]) : "" }));
                                          setEditingTarget(ins.name);
                                        }}
                                      >
                                        Edit
                                      </Button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {visible.includes("mix") && (
                <Card>
                  <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="space-y-1.5">
                        <CardTitle>Basket mix of services</CardTitle>
                        <CardDescription>Top 10 services in period by jobs, with penetration (share of period orders containing each service). ISN detail fills newest first; very old orders may still lack service detail.</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {overview.basket.length === 0 ? (
                      sync?.state === "backfilling" && overview.serviceCoverage ? (
                        <BasketSyncing coverage={overview.serviceCoverage} />
                      ) : sync?.state === "backfilling" ? (
                        <div className="space-y-3 py-2" aria-label="Loading service mix">
                          <div className="flex items-center gap-2">
                            <ArrowPathIcon className="size-4 animate-spin text-muted-foreground" />
                            <p className="text-sm font-medium">Syncing service detail</p>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                            <div className="h-full w-1/3 rounded-full bg-primary animate-[seed-slide_1.4s_ease-in-out_infinite]" />
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No service mix recorded for this period.</p>
                      )
                    ) : (
                      (() => {
                        const rows = [...overview.basket].sort((a, b) => b.jobs - a.jobs).slice(0, 10);
                        // Penetration: distinct orders containing the service
                        // over all non-cancelled period orders. Only the top
                        // 10 services are displayed.
                        const orderBase = overview.serviceCoverage?.orders ?? 0;
                        const penetration = (jobs: number) => (orderBase > 0 ? `${((jobs / orderBase) * 100).toFixed(1)}%` : "n/a");
                        return (
                          <div className="grid items-center gap-4 md:grid-cols-2">
                            <div className="h-80">
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 52 }}>
                                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                  <XAxis type="number" allowDecimals={false} />
                                  <YAxis type="category" dataKey="name" width={170} tick={{ fontSize: 12 }} />
                                  <Tooltip
                                    formatter={(v) => {
                                      const jobs = typeof v === "number" ? v : 0;
                                      return [`${jobs} jobs (${penetration(jobs)})`, "Jobs"];
                                    }}
                                  />
                                  <Bar dataKey="jobs" name="Jobs" radius={[0, 4, 4, 0]}>
                                    {rows.map((b, i) => (
                                      <Cell key={b.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                                    ))}
                                    <LabelList dataKey="jobs" position="right" formatter={(v) => (typeof v === "number" ? penetration(v) : "")} />
                                  </Bar>
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead><tr className="text-left text-muted-foreground"><th className="py-1 pr-4">Service</th><th className="py-1 pr-4">Jobs</th><th className="py-1">Penetration</th></tr></thead>
                                <tbody>
                                  {rows.map((b, i) => (
                                    <tr key={b.name} className="border-t">
                                      <td className="py-1 pr-4"><span className="mr-2 inline-block size-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />{b.name}</td>
                                      <td className="py-1 pr-4">{b.jobs}</td>
                                      <td className="py-1">{penetration(b.jobs)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })()
                    )}
                    {overview.dataQuality.map((q) => (
                      <p key={q} className="mt-2 text-xs text-muted-foreground">{q}</p>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <Card>
              <CardHeader><CardTitle>No synced orders yet</CardTitle><CardDescription>{connections.length > 0 ? "Backfill is running. Use Sync now to pull the next chunk." : "Connect a platform to start seeding."}</CardDescription></CardHeader>
              <CardContent>
                <Button variant="outline" size="sm" onClick={() => void manualRefresh()} disabled={syncDisabled}>
                  <ArrowPathIcon className={`size-4 ${refreshing ? "animate-spin" : ""}`} /> Sync now
                </Button>
              </CardContent>
            </Card>
          )}

          {overview && moneyAxis(0) === "" && <span className="hidden" />}
        </>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><CircleStackIcon className="size-5 text-primary" /> Data sources</CardTitle></CardHeader>
          <CardContent className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{connections.length === 0 ? "None yet" : `${connections.length} connected`}</span>
            <Button variant="outline" size="sm" asChild><Link to="/connections">Manage</Link></Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><CreditCardIcon className="size-5 text-primary" /> Billing</CardTitle></CardHeader>
          <CardContent className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Invoices and methods</span>
            <Button variant="outline" size="sm" asChild><Link to="/billing">Open</Link></Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
