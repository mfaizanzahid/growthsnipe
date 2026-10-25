import { and, asc, desc, eq, gte, isNotNull, lt, ne, or, sql } from "drizzle-orm";
import type { Db } from "../repositories/db";
import { orgOrderInspectors, orgOrders } from "../db/schema";

/**
 * Ranged SQL aggregates for the analytics warehouse. Every query leads with
 * organization_id and compares the bare scheduled_at TEXT column with
 * >= / < (never wrapped in DATE()/substr in the filter) so D1 can use the
 * (organization_id, scheduled_at) and (organization_id, status, scheduled_at)
 * composite indexes. Dates are ISO-8601 UTC and sort lexicographically.
 */

export interface SqlTotals {
  jobs: number;
  completed: number;
  pending: number;
  cancelled: number;
  revenueMinor: number;
}

export async function getRangeTotals(db: Db, orgId: string, from: string, to: string): Promise<SqlTotals> {
  const rows = await db
    .select({
      jobs: sql<number>`count(case when ${orgOrders.status} <> 'cancelled' then 1 end)`,
      completed: sql<number>`count(case when ${orgOrders.status} = 'completed' then 1 end)`,
      pending: sql<number>`count(case when ${orgOrders.status} not in ('completed','cancelled') then 1 end)`,
      cancelled: sql<number>`count(case when ${orgOrders.status} = 'cancelled' then 1 end)`,
      revenueMinor: sql<number>`coalesce(sum(case when ${orgOrders.status} = 'completed' then ${orgOrders.totalMinor} else 0 end), 0)`,
    })
    .from(orgOrders)
    .where(
      and(
        eq(orgOrders.organizationId, orgId),
        gte(orgOrders.scheduledAt, from),
        lt(orgOrders.scheduledAt, to),
      ),
    )
    .limit(1);
  const r = rows[0];
  return {
    jobs: Number(r?.jobs ?? 0),
    completed: Number(r?.completed ?? 0),
    pending: Number(r?.pending ?? 0),
    cancelled: Number(r?.cancelled ?? 0),
    revenueMinor: Number(r?.revenueMinor ?? 0),
  };
}

export interface SqlMonth {
  month: string;
  jobs: number;
  completed: number;
  revenueMinor: number;
}

export async function getMonthlyTotals(db: Db, orgId: string, from: string, to: string): Promise<SqlMonth[]> {
  const rows = await db
    .select({
      month: sql<string>`substr(${orgOrders.scheduledAt}, 1, 7)`,
      jobs: sql<number>`count(case when ${orgOrders.status} <> 'cancelled' then 1 end)`,
      completed: sql<number>`count(case when ${orgOrders.status} = 'completed' then 1 end)`,
      revenueMinor: sql<number>`coalesce(sum(case when ${orgOrders.status} = 'completed' then ${orgOrders.totalMinor} else 0 end), 0)`,
    })
    .from(orgOrders)
    .where(
      and(
        eq(orgOrders.organizationId, orgId),
        gte(orgOrders.scheduledAt, from),
        lt(orgOrders.scheduledAt, to),
      ),
    )
    .groupBy(sql`substr(${orgOrders.scheduledAt}, 1, 7)`)
    .orderBy(asc(sql`substr(${orgOrders.scheduledAt}, 1, 7)`))
    .limit(500);
  return rows.map((r) => ({
    month: String(r.month ?? ""),
    jobs: Number(r.jobs ?? 0),
    completed: Number(r.completed ?? 0),
    revenueMinor: Number(r.revenueMinor ?? 0),
  })).filter((r) => r.month !== "");
}

export interface SqlAgentRow {
  key: string;
  name: string;
  jobs: number;
  revenueMinor: number;
  lastSeen: string | null;
}

export async function getAgentLeaderboard(
  db: Db,
  orgId: string,
  from: string,
  to: string,
  limit = 20,
): Promise<SqlAgentRow[]> {
  const rows = await db
    .select({
      key: orgOrders.agentKey,
      name: sql<string>`max(${orgOrders.buyingAgentName})`,
      jobs: sql<number>`count(*)`,
      revenueMinor: sql<number>`coalesce(sum(case when ${orgOrders.status} = 'completed' then ${orgOrders.totalMinor} else 0 end), 0)`,
      lastSeen: sql<string | null>`max(${orgOrders.scheduledAt})`,
    })
    .from(orgOrders)
    .where(
      and(
        eq(orgOrders.organizationId, orgId),
        gte(orgOrders.scheduledAt, from),
        lt(orgOrders.scheduledAt, to),
        ne(orgOrders.status, "cancelled"),
        isNotNull(orgOrders.buyingAgentName),
        isNotNull(orgOrders.agentKey),
      ),
    )
    .groupBy(orgOrders.agentKey)
    .orderBy(desc(sql`coalesce(sum(case when ${orgOrders.status} = 'completed' then ${orgOrders.totalMinor} else 0 end), 0)`), desc(sql`count(*)`))
    .limit(Math.max(1, Math.min(100, limit)));
  return rows.map((r) => ({
    key: String(r.key ?? ""),
    name: String(r.name ?? ""),
    jobs: Number(r.jobs ?? 0),
    revenueMinor: Number(r.revenueMinor ?? 0),
    lastSeen: (r.lastSeen as string | null) ?? null,
  })).filter((r) => r.key !== "");
}

export interface SqlInspectorRow {
  name: string;
  jobs: number;
  revenueMinor: number;
}

export async function getInspectorStats(
  db: Db,
  orgId: string,
  from: string,
  to: string,
): Promise<{ rows: SqlInspectorRow[]; activeDays: number }> {
  const rows = await db
    .select({
      name: orgOrderInspectors.inspectorName,
      jobs: sql<number>`count(*)`,
      revenueMinor: sql<number>`coalesce(sum(case when ${orgOrders.status} = 'completed' then ${orgOrders.totalMinor} else 0 end), 0)`,
    })
    .from(orgOrderInspectors)
    .innerJoin(
      orgOrders,
      and(eq(orgOrders.id, orgOrderInspectors.orderId), eq(orgOrders.organizationId, orgOrderInspectors.organizationId)),
    )
    .where(
      and(
        eq(orgOrderInspectors.organizationId, orgId),
        gte(orgOrders.scheduledAt, from),
        lt(orgOrders.scheduledAt, to),
        ne(orgOrders.status, "cancelled"),
      ),
    )
    .groupBy(orgOrderInspectors.inspectorName)
    .orderBy(desc(sql`count(*)`))
    .limit(200);
  const dayRows = await db
    .select({ n: sql<number>`count(distinct substr(${orgOrders.scheduledAt}, 1, 10))` })
    .from(orgOrders)
    .where(
      and(
        eq(orgOrders.organizationId, orgId),
        gte(orgOrders.scheduledAt, from),
        lt(orgOrders.scheduledAt, to),
        ne(orgOrders.status, "cancelled"),
      ),
    )
    .limit(1);
  return {
    rows: rows.map((r) => ({ name: String(r.name ?? ""), jobs: Number(r.jobs ?? 0), revenueMinor: Number(r.revenueMinor ?? 0) })).filter((r) => r.name !== ""),
    // Exact single-row aggregate: the old grouped fetch capped at 2000 days
    // and inflated utilization on ranges wider than ~5.5 years (All time).
    activeDays: Number(dayRows[0]?.n ?? 0),
  };
}

/** True keyset cursor: opaque base64url JSON of the last row's (scheduledAt, id). */
export interface OrdersCursor {
  scheduledAt: string;
  id: string;
}

export function encodeCursor(c: OrdersCursor): string {
  const bytes = new TextEncoder().encode(JSON.stringify(c));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeCursor(raw: string): OrdersCursor | null {
  try {
    const b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const bin = atob(padded);
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof parsed !== "object" || parsed === null) return null;
    const { scheduledAt, id } = parsed as Record<string, unknown>;
    if (typeof scheduledAt !== "string" || typeof id !== "string") return null;
    if (scheduledAt === "" || id === "") return null;
    return { scheduledAt, id };
  } catch {
    return null;
  }
}

export interface OrderListRow {
  id: string;
  status: string;
  scheduledAt: string | null;
  totalMinor: number | null;
  buyingAgentName: string | null;
  agentKey: string | null;
}

export async function listOrdersKeyset(
  db: Db,
  orgId: string,
  from: string,
  to: string,
  limit: number,
  cursor: OrdersCursor | null,
): Promise<{ rows: OrderListRow[]; nextCursor: string | null }> {
  const lim = Math.max(1, Math.min(100, Math.floor(limit) || 50));
  const base = and(
    eq(orgOrders.organizationId, orgId),
    isNotNull(orgOrders.scheduledAt),
    gte(orgOrders.scheduledAt, from),
    lt(orgOrders.scheduledAt, to),
  );
  const where = cursor
    ? and(
        base,
        or(
          lt(orgOrders.scheduledAt, cursor.scheduledAt),
          and(eq(orgOrders.scheduledAt, cursor.scheduledAt), lt(orgOrders.id, cursor.id)),
        ),
      )
    : base;
  const rows = await db
    .select({
      id: orgOrders.id,
      status: orgOrders.status,
      scheduledAt: orgOrders.scheduledAt,
      totalMinor: orgOrders.totalMinor,
      buyingAgentName: orgOrders.buyingAgentName,
      agentKey: orgOrders.agentKey,
    })
    .from(orgOrders)
    .where(where)
    .orderBy(desc(orgOrders.scheduledAt), desc(orgOrders.id))
    .limit(lim + 1);
  const page = rows.slice(0, lim);
  const hasMore = rows.length > lim;
  const last = page[page.length - 1];
  return {
    rows: page.map((r) => ({
      id: r.id,
      status: r.status ?? "scheduled",
      scheduledAt: r.scheduledAt,
      totalMinor: r.totalMinor,
      buyingAgentName: r.buyingAgentName,
      agentKey: r.agentKey,
    })),
    nextCursor: hasMore && last?.scheduledAt ? encodeCursor({ scheduledAt: last.scheduledAt, id: last.id }) : null,
  };
}
