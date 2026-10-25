import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq, gte, isNotNull, lt, ne, sql } from "drizzle-orm";
import type { Env } from "../types";
import {
  contextMiddleware,
  createContextMiddleware,
  requireOrgRole,
  requireSession,
  sessionGuard,
  type MemberStore,
  type SessionResolver,
  type SessionUser,
} from "../middleware";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { Auth } from "../auth";
import type { Db } from "../repositories/db";
import { drizzleStore } from "../repositories/billing";
import { orgAccess, type OrgAccess } from "../billing/access";
import { orgDashboardLayouts, orgInspectorTargets, orgOrders, orgOrderServices, orgSyncState, userDashboardPrefs } from "../db/schema";
import { backfillProgress, runAnalyticsSyncForOrg } from "../analytics/sync";
import {
  decodeCursor,
  getAgentLeaderboard,
  getInspectorStats,
  getRangeTotals,
  listOrdersKeyset,
  type SqlTotals,
} from "../analytics/queries";
import {
  agentLeaderboard,
  annualGrowthFullYears,
  basketMix,
  droppedAgents,
  firstFullYear,
  inspectorPerformance,
  monthlySeries,
  pctChange,
  quarterlySeries,
  rangeTotals,
  repeatSplit,
  toStoredRow,
  type StoredOrder,
} from "../analytics/metrics";

const LayoutBody = z.object({
  orgId: z.string().min(1),
  widgetsJson: z.string().max(20000).default("[]"),
  defaultRange: z.string().max(40).default("last_12m"),
});

const TargetBody = z.object({
  orgId: z.string().min(1),
  inspectorName: z.string().trim().min(1).max(200),
  jobsPerDay: z.number().min(0.1).max(50),
});

/** Dashboard period presets, mirrored from src/react-app/lib/period.ts. */
const PRESETS = ["30d", "90d", "12m", "ytd", "5y", "cur_month", "prev_month", "last_year", "all", "custom"] as const;

const PeriodBody = z.object({
  orgId: z.string().min(1),
  preset: z.enum(PRESETS),
  customFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).max(10).optional(),
  customTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).max(10).optional(),
});

export function createAnalyticsRoutes(deps: {
  session?: SessionResolver;
  store?: MemberStore;
  ctx?: { db?: Db; auth?: Auth };
  access?: (orgId: string) => Promise<OrgAccess>;
} = {}) {  const routes = new Hono<{ Bindings: Env }>();
  const guard = deps.session ? sessionGuard(deps.session) : requireSession;
  const mem = (min: "admin" | "user" | "viewer", allowSuperadmin = false) =>
    deps.store ? requireOrgRole(min, { store: deps.store }) : requireOrgRole(min, { allowSuperadmin });
  const gated = () =>
    createMiddleware(async (c, next) => {
      const orgId = c.get("orgId") as string;
      const access = deps.access
        ? await deps.access(orgId)
        : await orgAccess(drizzleStore(c.get("db") as Db), orgId);
      if (access.state !== "trial" && access.state !== "active") {
        throw new HTTPException(402, { message: "Subscription required" });
      }
      await next();
    });

  routes.use("*", deps.ctx ? createContextMiddleware(deps.ctx) : contextMiddleware);

  // Analytics answers change every sync run: forbid HTTP caching so polling
  // dashboards (and any intermediate cache) can never render frozen counts
  // while the warehouse moves underneath.
  routes.use("*", async (c, next) => {
    await next();
    c.header("Cache-Control", "no-store");
  });

  routes.get("/api/analytics/status", guard, mem("viewer", true), gated(), async (c) => {
    const orgId = c.get("orgId") as string;
    const db = c.get("db") as Db;
    const rows = await db.select().from(orgSyncState).where(eq(orgSyncState.organizationId, orgId)).limit(1);
    const s = rows[0];
    if (!s) {
      const idle = backfillProgress(null, "idle", Date.now());
      return c.json({ status: { state: "idle", provider: null, totalFetched: 0, cursorDate: null, lastSyncedAt: null, seedStartedAt: null, totalEstimate: null, backfillChunksDone: idle.done, backfillChunksTotal: idle.total } });
    }
    const progress = backfillProgress(s.cursorDate, s.status, Date.now());
    return c.json({ status: { state: s.status, provider: s.provider, totalFetched: s.totalFetched, cursorDate: s.cursorDate, lastSyncedAt: s.lastSyncedAt, error: s.errorText, seedStartedAt: s.seedStartedAt, totalEstimate: s.totalEstimate, backfillChunksDone: progress.done, backfillChunksTotal: progress.total } });
  });

  // History bounds for the All-time preset: single indexed scan, no rows.
  routes.get("/api/analytics/range", guard, mem("viewer", true), gated(), async (c) => {
    const orgId = c.get("orgId") as string;
    const db = c.get("db") as Db;
    const rows = await db
      .select({
        min: sql<string | null>`min(${orgOrders.scheduledAt})`,
        max: sql<string | null>`max(${orgOrders.scheduledAt})`,
      })
      .from(orgOrders)
      .where(and(eq(orgOrders.organizationId, orgId), isNotNull(orgOrders.scheduledAt)))
      .limit(1);
    return c.json({ range: { minScheduledAt: rows[0]?.min ?? null, maxScheduledAt: rows[0]?.max ?? null } });
  });

  routes.post("/api/analytics/refresh", guard, mem("user"), gated(), async (c) => {    const orgId = c.get("orgId") as string;
    const db = c.get("db") as Db;
    // Short cooldown: a sync within the last 10 seconds returns current state
    // instead of hammering the provider and D1 again. 200 (not 429) so the
    // dashboard's silent auto-driver keeps reloading status/overview normally.
    const rows = await db.select().from(orgSyncState).where(eq(orgSyncState.organizationId, orgId)).limit(1);
    const last = rows[0]?.lastSyncedAt ?? 0;
    if (Math.floor(Date.now() / 1000) - last < 10) return c.json({ summary: null, cooledDown: true });
    const summary = await runAnalyticsSyncForOrg(c.env as Env, db, orgId, { maxChunks: 2 });
    return c.json({ summary });
  });

  routes.get("/api/analytics/overview", guard, mem("viewer", true), gated(), async (c) => {
    const orgId = c.get("orgId") as string;
    const db = c.get("db") as Db;
    const range = parseRange(c.req.query("from"), c.req.query("to"));
    if (!range) return c.json({ error: "Invalid date range" }, 422);
    const { from, to } = range;
    const fromMs = new Date(from).getTime();
    const rangeMs = new Date(to).getTime() - fromMs;
    const prevFrom = new Date(fromMs - rangeMs).toISOString();
    const prevTo = from;
    // Same period last year.
    const yoyFrom = new Date(from);
    yoyFrom.setUTCFullYear(yoyFrom.getUTCFullYear() - 1);
    const yoyTo = new Date(to);
    yoyTo.setUTCFullYear(yoyTo.getUTCFullYear() - 1);

    try {
      const overview = await buildOverviewSql(db, orgId, { from, to, prevFrom, prevTo, yoyFrom: yoyFrom.toISOString(), yoyTo: yoyTo.toISOString() });
      return c.json({ overview });
    } catch (err) {
      // Warehouses that predate migrations 0035/0036 have no agent_key or
      // inspector junction yet: fall back to the legacy scan instead of 500.
      if (!isWarehouseMissingColumn(err)) throw err;
      const overview = await buildOverviewLegacy(db, orgId, { from, to, prevFrom, prevTo, yoyFrom: yoyFrom.toISOString(), yoyTo: yoyTo.toISOString() });
      return c.json({ overview });
    }
  });

  // Keyset-paginated order list. Cursor is opaque (base64url of the last
  // row's scheduled_at + id); never OFFSET, so deep pages stay indexed.
  routes.get("/api/analytics/orders", guard, mem("viewer", true), gated(), async (c) => {
    const orgId = c.get("orgId") as string;
    const db = c.get("db") as Db;
    const range = parseRange(c.req.query("from"), c.req.query("to"));
    if (!range) return c.json({ error: "Invalid date range" }, 422);
    const { from, to } = range;
    const limit = Math.max(1, Math.min(100, Number(c.req.query("limit")) || 50));
    const rawCursor = c.req.query("cursor");
    const cursor = rawCursor ? decodeCursor(rawCursor) : null;
    if (rawCursor && !cursor) return c.json({ error: "Invalid cursor" }, 422);
    try {
      const { rows, nextCursor } = await listOrdersKeyset(db, orgId, from, to, limit, cursor);
      return c.json({ orders: rows, nextCursor });
    } catch (err) {
      if (!isWarehouseMissingColumn(err)) throw err;
      return c.json({ error: "Order history is still upgrading; retry shortly." }, 503);
    }
  });

  routes.get("/api/analytics/layout", guard, mem("viewer", true), gated(), async (c) => {
    const orgId = c.get("orgId") as string;
    const db = c.get("db") as Db;
    const rows = await db.select().from(orgDashboardLayouts).where(eq(orgDashboardLayouts.organizationId, orgId)).limit(1);
    return c.json({ layout: rows[0] ?? { organizationId: orgId, widgetsJson: "[]", defaultRange: "last_12m" } });
  });

  routes.put("/api/analytics/layout", guard, mem("admin"), gated(), async (c) => {
    const parsed = LayoutBody.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json({ error: "Invalid layout" }, 422);
    // Writes follow the authorized org, never a body-supplied id: a member of
    // org A must not land writes in org B via a mismatched body orgId.
    const orgId = c.get("orgId") as string;
    if (parsed.data.orgId !== orgId) return c.json({ error: "Organization mismatch" }, 403);
    const db = c.get("db") as Db;
    const now = Math.floor(Date.now() / 1000);
    await db
      .insert(orgDashboardLayouts)
      .values({ organizationId: orgId, widgetsJson: parsed.data.widgetsJson, defaultRange: parsed.data.defaultRange, updatedAt: now })
      .onConflictDoUpdate({ target: orgDashboardLayouts.organizationId, set: { widgetsJson: parsed.data.widgetsJson, defaultRange: parsed.data.defaultRange, updatedAt: now } });
    return c.json({ ok: true });
  });

  // Per-user period preference (any member may keep their own; the row is
  // keyed by session user so one member's choice never stomps another's).
  // Absent rows fall back to the org's defaultRange on the client.
  routes.get("/api/analytics/period", guard, mem("viewer", true), gated(), async (c) => {
    const orgId = c.get("orgId") as string;
    const user = c.get("user") as SessionUser;
    const db = c.get("db") as Db;
    const rows = await db
      .select()
      .from(userDashboardPrefs)
      .where(and(eq(userDashboardPrefs.userId, user.id), eq(userDashboardPrefs.organizationId, orgId)))
      .limit(1);
    const pref = rows[0];
    if (!pref || !(PRESETS as readonly string[]).includes(pref.preset)) return c.json({ period: null });
    return c.json({ period: { preset: pref.preset, customFrom: pref.customFrom, customTo: pref.customTo } });
  });

  routes.put("/api/analytics/period", guard, mem("viewer"), gated(), async (c) => {
    const parsed = PeriodBody.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json({ error: "Invalid period" }, 422);
    const user = c.get("user") as SessionUser;
    const orgId = c.get("orgId") as string;
    if (parsed.data.orgId !== orgId) return c.json({ error: "Organization mismatch" }, 403);
    const db = c.get("db") as Db;
    const now = Math.floor(Date.now() / 1000);
    await db
      .insert(userDashboardPrefs)
      .values({
        userId: user.id,
        organizationId: orgId,
        preset: parsed.data.preset,
        customFrom: parsed.data.customFrom ?? null,
        customTo: parsed.data.customTo ?? null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [userDashboardPrefs.userId, userDashboardPrefs.organizationId],
        set: { preset: parsed.data.preset, customFrom: parsed.data.customFrom ?? null, customTo: parsed.data.customTo ?? null, updatedAt: now },
      });
    return c.json({ ok: true });
  });

  routes.get("/api/analytics/targets", guard, mem("viewer", true), gated(), async (c) => {    const orgId = c.get("orgId") as string;
    const db = c.get("db") as Db;
    const rows = await db.select().from(orgInspectorTargets).where(eq(orgInspectorTargets.organizationId, orgId)).limit(100);
    return c.json({ targets: rows });
  });

  routes.put("/api/analytics/targets", guard, mem("admin"), gated(), async (c) => {
    const parsed = TargetBody.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json({ error: "Invalid target" }, 422);
    const orgId = c.get("orgId") as string;
    if (parsed.data.orgId !== orgId) return c.json({ error: "Organization mismatch" }, 403);
    const db = c.get("db") as Db;
    const now = Math.floor(Date.now() / 1000);
    await db
      .insert(orgInspectorTargets)
      .values({ organizationId: orgId, inspectorName: parsed.data.inspectorName, jobsPerDay: Math.round(parsed.data.jobsPerDay), updatedAt: now })
      .onConflictDoUpdate({ target: [orgInspectorTargets.organizationId, orgInspectorTargets.inspectorName], set: { jobsPerDay: Math.round(parsed.data.jobsPerDay), updatedAt: now } });
    return c.json({ ok: true });
  });

  return routes;
}

interface OverviewWindow {
  from: string;
  to: string;
  prevFrom: string;
  prevTo: string;
  yoyFrom: string;
  yoyTo: string;
}

function sqlTotalsToRange(t: SqlTotals): import("../analytics/metrics").RangeTotals {
  return {
    jobs: t.jobs,
    completed: t.completed,
    pending: t.pending,
    cancelled: t.cancelled,
    revenueMinor: t.revenueMinor,
    avgTicketMinor: t.completed > 0 ? Math.round(t.revenueMinor / t.completed) : null,
  };
}

function isWarehouseMissingColumn(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /no such (table|column)/i.test(msg);
}

/**
 * Validate an ISO date range for warehouse reads. Bound values go into
 * indexed comparisons, so garbage in still executes queries; reject it with
 * 422 instead. The 40-year cap is generous (the All-time preset spans ~26y)
 * and only blocks absurd or swapped windows.
 */
function parseRange(fromRaw: string | undefined, toRaw: string | undefined): { from: string; to: string } | null {
  const from = fromRaw ?? new Date(Date.now() - 365 * 86400000).toISOString();
  const to = toRaw ?? new Date().toISOString();
  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return null;
  if (fromMs >= toMs) return null;
  if (toMs - fromMs > 40 * 365 * 86400000) return null;
  return { from, to };
}

/**
 * SQL overview: every aggregate is a ranged, org-scoped query over the
 * composite indexes. Row-level reads are limited to a narrow monthly-trend
 * window (indexed range scan, projection only) that feeds the pure-JS
 * monthly/repeat helpers; KPIs, leaderboard, inspectors, and basket never
 * ship full order rows to the worker.
 */
async function buildOverviewSql(db: Db, orgId: string, w: OverviewWindow) {
  // Monthly trend + repeat need row-level timestamps: fetch a narrow
  // projection over an indexed range (6y back), not the whole org history.
  const toMs = new Date(w.to).getTime();
  const trendFrom = new Date(toMs - 6 * 365 * 86400000).toISOString();
  // Every read below is independent: fire them concurrently so overview
  // latency is the slowest single query, not the sum of eleven sequential
  // D1 round trips (each aggregate still scans its own range server-side).
  const [
    totalsSql,
    prevSql,
    yoySql,
    trendRows,
    agentsFull,
    prevAgents,
    targets,
    insp,
    serviceCountRow,
    coverageRows,
    basketRows,
    historyStartRow,
  ] = await Promise.all([
    getRangeTotals(db, orgId, w.from, w.to),
    getRangeTotals(db, orgId, w.prevFrom, w.prevTo),
    getRangeTotals(db, orgId, w.yoyFrom, w.yoyTo),
    db
      .select({
        status: orgOrders.status,
        scheduledAt: orgOrders.scheduledAt,
        totalMinor: orgOrders.totalMinor,
        agentKey: orgOrders.agentKey,
        serviceType: orgOrders.serviceType,
        inspectorNames: orgOrders.inspectorNames,
      })
      .from(orgOrders)
      .where(and(eq(orgOrders.organizationId, orgId), gte(orgOrders.scheduledAt, trendFrom), lt(orgOrders.scheduledAt, w.to)))
      .orderBy(desc(orgOrders.scheduledAt))
      .limit(60000),
    getAgentLeaderboard(db, orgId, w.from, w.to, 1000),
    getAgentLeaderboard(db, orgId, w.prevFrom, w.prevTo, 1000),
    db.select().from(orgInspectorTargets).where(eq(orgInspectorTargets.organizationId, orgId)).limit(100),
    getInspectorStats(db, orgId, w.from, w.to),
    db
      .select({ n: sql<number>`count(*)` })
      .from(orgOrderServices)
      .where(eq(orgOrderServices.organizationId, orgId))
      .limit(1),
    db
      .select({
        orders: sql<number>`count(distinct ${orgOrders.id})`,
        withServices: sql<number>`count(distinct case when ${orgOrderServices.orderId} is not null then ${orgOrders.id} end)`,
      })
      .from(orgOrders)
      .leftJoin(
        orgOrderServices,
        and(eq(orgOrderServices.orderId, orgOrders.id), eq(orgOrderServices.organizationId, orgId)),
      )
      .where(
        and(
          eq(orgOrders.organizationId, orgId),
          ne(orgOrders.status, "cancelled"),
          gte(orgOrders.scheduledAt, w.from),
          lt(orgOrders.scheduledAt, w.to),
        ),
      )
      .limit(1),
    db
      .select({
        name: orgOrderServices.name,
        jobs: sql<number>`count(distinct ${orgOrderServices.orderId})`,
        revenueMinor: sql<number>`coalesce(sum(case when ${orgOrders.status} = 'completed' then ${orgOrders.totalMinor} else 0 end), 0)`,
      })
      .from(orgOrderServices)
      .innerJoin(orgOrders, and(eq(orgOrderServices.orderId, orgOrders.id), eq(orgOrders.organizationId, orgId)))
      .where(
        and(
          eq(orgOrderServices.organizationId, orgId),
          ne(orgOrders.status, "cancelled"),
          gte(orgOrders.scheduledAt, w.from),
          lt(orgOrders.scheduledAt, w.to),
        ),
      )
      .groupBy(orgOrderServices.name)
      .orderBy(desc(sql`count(distinct ${orgOrderServices.orderId})`))
      .limit(10),
    // Warehouse history start for full-year growth bounds: index seek.
    db
      .select({ min: sql<string | null>`min(${orgOrders.scheduledAt})` })
      .from(orgOrders)
      .where(and(eq(orgOrders.organizationId, orgId), isNotNull(orgOrders.scheduledAt)))
      .limit(1),
  ]);
  const totals = sqlTotalsToRange(totalsSql);
  const prev = sqlTotalsToRange(prevSql);
  const yoy = sqlTotalsToRange(yoySql);
  const truncated = trendRows.length >= 60000;
  const trend: StoredOrder[] = trendRows.map((r) => {
    const key = typeof r.agentKey === "string" ? r.agentKey : null;
    return {
      id: "",
      status: r.status ?? "scheduled",
      scheduledAt: r.scheduledAt,
      totalMinor: r.totalMinor,
      inspectorNames: toStoredRow({ status: "", scheduledAt: null, totalMinor: null, inspectorNamesJson: r.inspectorNames ?? "[]", buyingAgentName: null, serviceType: null }).inspectorNames,
      buyingAgentName: null,
      buyingAgentEmail: key?.startsWith("e:") ? key.slice(2) : null,
      buyingAgentPhone: key?.startsWith("p:") ? key.slice(2) : null,
      serviceNames: toStoredRow({ status: "", scheduledAt: null, totalMinor: null, inspectorNamesJson: "[]", buyingAgentName: null, serviceType: r.serviceType }).serviceNames,
      referralSource: null,
    };
  });

  const months = monthlySeries(trend, 5);
  const quarters = quarterlySeries(months);
  // Year-over-year growth skips a partial leading year: the first full
  // year is the base row (growthPct null). The current year stays included.
  const growth = annualGrowthFullYears(months, firstFullYear(historyStartRow[0]?.min ?? null));

  const agents = agentsFull.slice(0, 20);
  const curKeys = new Set(agentsFull.map((a) => a.key));
  const dropped = prevAgents.filter((a) => !curKeys.has(a.key));
  const repeat = repeatSplit(trend, w.from, w.to);

  const targetMap = new Map(targets.map((t) => [t.inspectorName, Number(t.jobsPerDay) || 2]));
  let inspectors = insp.rows.map((r) => {
    const target = targetMap.get(r.name);
    const days = Math.max(1, insp.activeDays);
    return {
      name: r.name,
      jobs: r.jobs,
      revenueMinor: r.revenueMinor,
      avgTicketMinor: r.jobs > 0 ? Math.round(r.revenueMinor / r.jobs) : null,
      utilizationPct: target && target > 0 ? Math.round((r.jobs / (days * target)) * 1000) / 10 : null,
    };
  });
  if (inspectors.length === 0) {
    // Junction still backfilling (pre-0036 history): fall back to JS splits.
    inspectors = inspectorPerformance(trend, w.from, w.to, targetMap);
  }

  const serviceCount = Number(serviceCountRow[0]?.n ?? 0);
  const serviceCoverage = {
    orders: Number(coverageRows[0]?.orders ?? 0),
    withServices: Number(coverageRows[0]?.withServices ?? 0),
  };

  // jobs counts DISTINCT orders containing the service, so the card can
  // show penetration (share of period orders). Display stops at the top 10.
  const basket =
    basketRows.length > 0
      ? basketRows.map((r) => ({ name: r.name, jobs: Number(r.jobs), revenueMinor: Number(r.revenueMinor) }))
      : basketMix(trend, w.from, w.to);

  return {
    range: { from: w.from, to: w.to },
    totals,
    deltas: {
      revenuePct: pctChange(totals.revenueMinor, prev.revenueMinor),
      jobsPct: pctChange(totals.jobs, prev.completed || prev.jobs),
      avgTicketPct: pctChange(totals.avgTicketMinor, prev.avgTicketMinor),
      yoyRevenuePct: pctChange(totals.revenueMinor, yoy.revenueMinor),
      yoyJobsPct: pctChange(totals.jobs, yoy.jobs),
    },
    yoy,
    months,
    quarters,
    growth,
    agents,
    droppedAgents: dropped,
    repeat,
    inspectors,
    basket,
    serviceCount,
    serviceCoverage,
    dataQuality: dataQualityNotes(truncated),
  };
}

/** Legacy overview for warehouses predating 0035/0036 (no agent_key). */
async function buildOverviewLegacy(db: Db, orgId: string, w: OverviewWindow) {
  const rows = await db
    .select({
      status: orgOrders.status,
      scheduledAt: orgOrders.scheduledAt,
      totalMinor: orgOrders.totalMinor,
      inspectorNames: orgOrders.inspectorNames,
      buyingAgentName: orgOrders.buyingAgentName,
      buyingAgentEmail: orgOrders.buyingAgentEmail,
      buyingAgentPhone: orgOrders.buyingAgentPhone,
      serviceType: orgOrders.serviceType,
      referralSource: orgOrders.referralSource,
    })
    .from(orgOrders)
    .where(eq(orgOrders.organizationId, orgId))
    .orderBy(desc(orgOrders.scheduledAt))
    .limit(60000);

  const orders: StoredOrder[] = rows.map((r) => ({
    id: "",
    status: r.status ?? "scheduled",
    scheduledAt: r.scheduledAt,
    totalMinor: r.totalMinor,
    inspectorNames: toStoredRow({ status: "", scheduledAt: null, totalMinor: null, inspectorNamesJson: r.inspectorNames ?? "[]", buyingAgentName: null, serviceType: null }).inspectorNames,
    buyingAgentName: r.buyingAgentName,
    buyingAgentEmail: r.buyingAgentEmail,
    buyingAgentPhone: r.buyingAgentPhone,
    serviceNames: toStoredRow({ status: "", scheduledAt: null, totalMinor: null, inspectorNamesJson: "[]", buyingAgentName: null, serviceType: r.serviceType }).serviceNames,
    referralSource: r.referralSource,
  }));

  const targets = await db.select().from(orgInspectorTargets).where(eq(orgInspectorTargets.organizationId, orgId)).limit(100);
  const targetMap = new Map(targets.map((t) => [t.inspectorName, Number(t.jobsPerDay) || 2]));
  const serviceCountRow = await db
    .select({ n: sql<number>`count(*)` })
    .from(orgOrderServices)
    .where(eq(orgOrderServices.organizationId, orgId))
    .limit(1);
  const serviceCount = Number(serviceCountRow[0]?.n ?? 0);
  const coverageRows = await db
    .select({
      orders: sql<number>`count(distinct ${orgOrders.id})`,
      withServices: sql<number>`count(distinct case when ${orgOrderServices.orderId} is not null then ${orgOrders.id} end)`,
    })
    .from(orgOrders)
    .leftJoin(
      orgOrderServices,
      and(eq(orgOrderServices.orderId, orgOrders.id), eq(orgOrderServices.organizationId, orgId)),
    )
    .where(
      and(
        eq(orgOrders.organizationId, orgId),
        ne(orgOrders.status, "cancelled"),
        gte(orgOrders.scheduledAt, w.from),
        lt(orgOrders.scheduledAt, w.to),
      ),
    )
    .limit(1);
  const serviceCoverage = {
    orders: Number(coverageRows[0]?.orders ?? 0),
    withServices: Number(coverageRows[0]?.withServices ?? 0),
  };

  const totals = rangeTotals(orders, w.from, w.to);
  const prev = rangeTotals(orders, w.prevFrom, w.prevTo);
  const yoy = rangeTotals(orders, w.yoyFrom, w.yoyTo);
  const months = monthlySeries(orders, 5);
  const quarters = quarterlySeries(months);
  const historyStartRow = await db
    .select({ min: sql<string | null>`min(${orgOrders.scheduledAt})` })
    .from(orgOrders)
    .where(and(eq(orgOrders.organizationId, orgId), isNotNull(orgOrders.scheduledAt)))
    .limit(1);
  const legacyBounds = historyStartRow[0]?.min ?? null;
  const growth = annualGrowthFullYears(months, firstFullYear(legacyBounds));
  const agents = agentLeaderboard(orders, w.from, w.to);
  const dropped = droppedAgents(orders, w.from, w.to, w.prevFrom, w.prevTo);
  const repeat = repeatSplit(orders, w.from, w.to);
  const inspectors = inspectorPerformance(orders, w.from, w.to, targetMap);
  const basketRows = await db
    .select({
      name: orgOrderServices.name,
      jobs: sql<number>`count(distinct ${orgOrderServices.orderId})`,
      revenueMinor: sql<number>`coalesce(sum(case when ${orgOrders.status} = 'completed' then ${orgOrders.totalMinor} else 0 end), 0)`,
    })
    .from(orgOrderServices)
    .innerJoin(orgOrders, and(eq(orgOrderServices.orderId, orgOrders.id), eq(orgOrders.organizationId, orgId)))
    .where(
      and(
        eq(orgOrderServices.organizationId, orgId),
        ne(orgOrders.status, "cancelled"),
        gte(orgOrders.scheduledAt, w.from),
        lt(orgOrders.scheduledAt, w.to),
      ),
    )
    .groupBy(orgOrderServices.name)
    .orderBy(desc(sql`count(distinct ${orgOrderServices.orderId})`))
    .limit(10);
  const basket =
    basketRows.length > 0
      ? basketRows.map((r) => ({ name: r.name, jobs: Number(r.jobs), revenueMinor: Number(r.revenueMinor) }))
      : basketMix(orders, w.from, w.to);

  return {
    range: { from: w.from, to: w.to },
    totals,
    deltas: {
      revenuePct: pctChange(totals.revenueMinor, prev.revenueMinor),
      jobsPct: pctChange(totals.jobs, prev.completed || prev.jobs),
      avgTicketPct: pctChange(totals.avgTicketMinor, prev.avgTicketMinor),
      yoyRevenuePct: pctChange(totals.revenueMinor, yoy.revenueMinor),
      yoyJobsPct: pctChange(totals.jobs, yoy.jobs),
    },
    yoy,
    months,
    quarters,
    growth,
    agents,
    droppedAgents: dropped,
    repeat,
    inspectors,
    basket,
    serviceCount,
    serviceCoverage,
    dataQuality: dataQualityNotes(rows.length >= 60000),
  };
}

function dataQualityNotes(truncated: boolean): string[] {
  const notes: string[] = [];
  if (truncated) notes.push("Trend history is capped at the newest 60,000 orders in range; KPIs and leaderboards always use the full range.");
  notes.push("ISN date filters accept whole days only, so consecutive comparison windows share a boundary day counted in both.");
  notes.push("ISN exposes no completion flag on windowed reads: a non-cancelled order scheduled in the past is treated as completed.");
  notes.push("ISN service mix builds from per-order detail reads, newest first; very old orders may still lack service detail while enrichment catches up.");
  return notes;
}
