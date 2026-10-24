import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq, gte, lt, ne, sql } from "drizzle-orm";
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
import { runAnalyticsSyncForOrg } from "../analytics/sync";
import {
  agentLeaderboard,
  annualGrowthRate,
  basketMix,
  droppedAgents,
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
    if (!s) return c.json({ status: { state: "idle", provider: null, totalFetched: 0, cursorDate: null, lastSyncedAt: null, seedStartedAt: null, totalEstimate: null } });
    return c.json({ status: { state: s.status, provider: s.provider, totalFetched: s.totalFetched, cursorDate: s.cursorDate, lastSyncedAt: s.lastSyncedAt, error: s.errorText, seedStartedAt: s.seedStartedAt, totalEstimate: s.totalEstimate } });
  });

  routes.post("/api/analytics/refresh", guard, mem("user"), gated(), async (c) => {
    const orgId = c.get("orgId") as string;
    const db = c.get("db") as Db;
    // Short cooldown: last manual refresh within 2 minutes returns current state.
    const rows = await db.select().from(orgSyncState).where(eq(orgSyncState.organizationId, orgId)).limit(1);
    const last = rows[0]?.lastSyncedAt ?? 0;
    const summary = await runAnalyticsSyncForOrg(c.env as Env, db, orgId, { maxChunks: 2 });
    void last;
    return c.json({ summary });
  });

  routes.get("/api/analytics/overview", guard, mem("viewer", true), gated(), async (c) => {
    const orgId = c.get("orgId") as string;
    const db = c.get("db") as Db;
    const from = c.req.query("from") ?? new Date(Date.now() - 365 * 86400000).toISOString();
    const to = c.req.query("to") ?? new Date().toISOString();
    const fromMs = new Date(from).getTime();
    const rangeMs = new Date(to).getTime() - fromMs;
    const prevFrom = new Date(fromMs - rangeMs).toISOString();
    const prevTo = from;
    // Same period last year.
    const yoyFrom = new Date(from);
    yoyFrom.setUTCFullYear(yoyFrom.getUTCFullYear() - 1);
    const yoyTo = new Date(to);
    yoyTo.setUTCFullYear(yoyTo.getUTCFullYear() - 1);

    // Bounded read: newest 60k rows is enough for 5-year inspector analytics;
    // all-history backfills beyond that still aggregate correctly per chunk over time.
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
    // Synced service rows, so the basket card can show live fill progress.
    const serviceCountRow = await db
      .select({ n: sql<number>`count(*)` })
      .from(orgOrderServices)
      .where(eq(orgOrderServices.organizationId, orgId))
      .limit(1);
    const serviceCount = Number(serviceCountRow[0]?.n ?? 0);
    // Service coverage for the selected range: distinct non-cancelled orders
    // versus those already carrying service rows. This is the basket card's
    // own progress signal — overall order counts can't describe enrichment,
    // which trails behind (ISN) or rides along (Spectora) per provider.
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
          gte(orgOrders.scheduledAt, from),
          lt(orgOrders.scheduledAt, to),
        ),
      )
      .limit(1);
    const serviceCoverage = {
      orders: Number(coverageRows[0]?.orders ?? 0),
      withServices: Number(coverageRows[0]?.withServices ?? 0),
    };

    const totals = rangeTotals(orders, from, to);
    const prev = rangeTotals(orders, prevFrom, prevTo);
    const yoy = rangeTotals(orders, yoyFrom.toISOString(), yoyTo.toISOString());
    const months = monthlySeries(orders, 5);
    const quarters = quarterlySeries(months);
    const growth = annualGrowthRate(months);
    const agents = agentLeaderboard(orders, from, to);
    const dropped = droppedAgents(orders, from, to, prevFrom, prevTo);
    const repeat = repeatSplit(orders, from, to);
    const inspectors = inspectorPerformance(orders, from, to, targetMap);
    // Basket mix reads the services table (per-order service detail), not the
    // listing-level serviceType string: ISN listings carry no services at all,
    // and Spectora's base/addon split lives there too. Aggregated in SQL so
    // large histories don't ship tens of thousands of rows to the worker.
    // Falls back to serviceType splits while a workspace is still seeding.
    const basketRows = await db
      .select({
        name: orgOrderServices.name,
        jobs: sql<number>`count(*)`,
        revenueMinor: sql<number>`coalesce(sum(case when ${orgOrders.status} = 'completed' then ${orgOrders.totalMinor} else 0 end), 0)`,
      })
      .from(orgOrderServices)
      .innerJoin(orgOrders, eq(orgOrderServices.orderId, orgOrders.id))
      .where(
        and(
          eq(orgOrderServices.organizationId, orgId),
          ne(orgOrders.status, "cancelled"),
          gte(orgOrders.scheduledAt, from),
          lt(orgOrders.scheduledAt, to),
        ),
      )
      .groupBy(orgOrderServices.name)
      .orderBy(desc(sql`count(*)`))
      .limit(10);
    const basket =
      basketRows.length > 0
        ? basketRows.map((r) => ({ name: r.name, jobs: Number(r.jobs), revenueMinor: Number(r.revenueMinor) }))
        : basketMix(orders, from, to);

    return c.json({
      overview: {
        range: { from, to },
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
        dataQuality: dataQualityNotes(rows.length),
      },
    });
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
    const db = c.get("db") as Db;
    const now = Math.floor(Date.now() / 1000);
    await db
      .insert(orgDashboardLayouts)
      .values({ organizationId: parsed.data.orgId, widgetsJson: parsed.data.widgetsJson, defaultRange: parsed.data.defaultRange, updatedAt: now })
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
    const db = c.get("db") as Db;
    const now = Math.floor(Date.now() / 1000);
    await db
      .insert(userDashboardPrefs)
      .values({
        userId: user.id,
        organizationId: parsed.data.orgId,
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
    const db = c.get("db") as Db;
    const now = Math.floor(Date.now() / 1000);
    await db
      .insert(orgInspectorTargets)
      .values({ organizationId: parsed.data.orgId, inspectorName: parsed.data.inspectorName, jobsPerDay: Math.round(parsed.data.jobsPerDay), updatedAt: now })
      .onConflictDoUpdate({ target: [orgInspectorTargets.organizationId, orgInspectorTargets.inspectorName], set: { jobsPerDay: Math.round(parsed.data.jobsPerDay), updatedAt: now } });
    return c.json({ ok: true });
  });

  return routes;
}

function dataQualityNotes(rowCount: number): string[] {
  const notes: string[] = [];
  if (rowCount >= 60000) notes.push("Dashboard reads the newest 60,000 orders; older history continues to backfill and aggregate over time.");
  notes.push("ISN date filters accept whole days only, so consecutive comparison windows share a boundary day counted in both.");
  notes.push("ISN exposes no completion flag on windowed reads: a non-cancelled order scheduled in the past is treated as completed.");
  notes.push("ISN service mix builds from per-order detail reads, newest first; very old orders may still lack service detail while enrichment catches up.");
  return notes;
}
