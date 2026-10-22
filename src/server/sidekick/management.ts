import type { Env } from '../lib/env';
import { decryptJson } from '../lib/crypto';
import { loadConnection } from '../mcp/auth';
import { createProviderAdapter } from '../providers/registry';
import type { OrderRecord, Page, ProviderKey } from '../providers/types';
import { sumMinor } from '../providers/money';
import { SNAPSHOT_MAX_PAGES, SNAPSHOT_PAGE_LIMIT } from '../lib/retrieval-limits';

/**
 * Dashboard snapshot bounds. These live in lib/retrieval-limits.ts alongside the
 * briefing budget because they are the same kind of control (server-driven
 * pagination with no client to stop the loop) — but they are deliberately
 * DIFFERENT values: the dashboard is one on-demand request over a fixed 30-day
 * window, while a briefing is unattended and may read two windows. Do not
 * silently merge the two constants; see the module for the derivation.
 */
export { SNAPSHOT_MAX_PAGES, SNAPSHOT_PAGE_LIMIT } from '../lib/retrieval-limits';

/** Rolling lookback window for snapshots (days). */
export const SNAPSHOT_WINDOW_DAYS = 30;

/**
 * Follow nextCursor up to SNAPSHOT_MAX_PAGES. Spectora pages until the cursor
 * runs out; ISN never returns a cursor, so its first call already returns the
 * whole window and the loop stops immediately. `truncated` is true only when the
 * provider's own total exceeds what we hold (or more pages remained unfetched) —
 * the "bounded retrieval" caveat renders only then.
 */
export async function fetchSnapshotPages<T>(
  fetchPage: (cursor?: string, limit?: number) => Promise<Page<T>>,
): Promise<{ items: T[]; truncated: boolean; totalEstimate?: number }> {
  const items: T[] = [];
  let cursor: string | undefined;
  let totalEstimate: number | undefined;
  let sawCursor = false;
  for (let page = 0; page < SNAPSHOT_MAX_PAGES; page++) {
    const res = await fetchPage(cursor, SNAPSHOT_PAGE_LIMIT);
    items.push(...res.items);
    if (typeof res.totalEstimate === 'number') totalEstimate = res.totalEstimate;
    if (!res.nextCursor) {
      cursor = undefined;
      break;
    }
    sawCursor = true;
    cursor = res.nextCursor;
  }

  return {
    items,
    truncated: typeof totalEstimate === 'number' ? totalEstimate > items.length : sawCursor,
    totalEstimate,
  };
}

function normName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const n = value.toLowerCase().replace(/\s+/g, ' ').trim();
  return n === '' ? null : n;
}

/** Identifier-shaped values are not people (ISN returns UUIDs here). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Recent agents = distinct agents named on the window's own orders
 * (inspector / buying-agent / selling-agent). Derived from the fetched
 * inspection data — no separate agents-directory lookup, so the count can
 * never be skewed by directory pagination. Names are case/whitespace
 * normalized; the buyer is a client, not an agent, and is excluded.
 *
 * Identifier-shaped values are skipped: ISN returns UUIDs in `inspector1` /
 * `buyersagent`, which would otherwise be reported as a distinct "agent" per
 * order (the dashboard once showed 148 agents for 106 orders because of this).
 */
export function countRecentAgents(orders: OrderRecord[]): number {
  const names = new Set<string>();
  for (const o of orders) {
    for (const n of [o.inspectorName, o.buyingAgentName, o.sellingAgentName]) {
      const nn = normName(n);
      if (nn && !UUID_RE.test(nn)) names.add(nn);
    }
  }
  return names.size;
}

/**
 * Facts derived from the window's orders. Cancelled orders are hidden from the
 * order and agent counts (a cancelled job never happened, so counting it
 * inflates "orders this month" and invents agents who only appeared on a
 * cancelled job); revenue was already completed-only and open orders already
 * exclude cancelled.
 */
export function orderFacts(orders: OrderRecord[]): Pick<
  ManagementSnapshot["facts"],
  "recentOrders" | "recentCompletedRevenue" | "openOrders" | "recentAgents"
> {
  const active = orders.filter((o) => String(o.status).toLowerCase() !== "cancelled");
  return {
    recentOrders: active.length,
    // `total` is integer minor units (cents) — adapters normalize at the boundary.
    recentCompletedRevenue: sumMinor(
      orders.filter((o) => String(o.status).toLowerCase() === "completed").map((o) => o.total),
    ),
    openOrders: orders.filter(
      (o) => !["completed", "cancelled"].includes(String(o.status).toLowerCase()),
    ).length,
    recentAgents: countRecentAgents(active),
  };
}

export interface ManagementSnapshot {
  generatedAt: string;
  provider: ProviderKey;
  window: { from: string; to: string };
  facts: {
    recentOrders: number;
    /** Completed revenue in integer minor units (cents). */
    recentCompletedRevenue: number;
    openOrders: number;
    recentAgents: number;
    eventCount: number;
  };
  caveats: string[];
}

export async function buildManagementSnapshot(
  env: Env,
  organizationId: string,
  provider: ProviderKey,
): Promise<ManagementSnapshot> {
  const c = await loadConnection(env, organizationId, provider);
  if (!c) throw new Error(`No ${provider} connection configured.`);
  if (!env.MCP_ENCRYPTION_KEY) throw new Error('Server is missing MCP_ENCRYPTION_KEY.');
  const a = createProviderAdapter(
    env,
    { provider, credentials: await decryptJson<Record<string, string>>(env.MCP_ENCRYPTION_KEY, c.encryptedCredentials) },
  );
  const to = new Date();
  const from = new Date(to.getTime() - SNAPSHOT_WINDOW_DAYS * 86400000);
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  // Orders drive every fact (agents are derived from the window's own orders,
  // so no separate agents-directory lookup can skew the count). Orders fail
  // loud; the helper follows cursors up to SNAPSHOT_MAX_PAGES so busy Spectora
  // windows are not capped, while ISN returns its whole window on the first
  // call. `limit` is the page size (a no-op for ISN, which honors whole-window
  // reads) — the caveat below appears only if the provider still reports more.
  const orders = await fetchSnapshotPages((cursor, limit) =>
    a.searchOrders({ limit: limit ?? SNAPSHOT_PAGE_LIMIT, from: fromIso, to: toIso, cursor }),
  );
  const caveats: string[] = [];
  if (orders.truncated) {
    const total = orders.totalEstimate !== undefined ? ` of ~${orders.totalEstimate}` : '';
    caveats.push(
      `Order retrieval bounded at ${orders.items.length}${total} records — counts and revenue cover the retrieved subset only.`,
    );
  }
  // Events are auxiliary: a provider-side validation failure must degrade to
  // eventCount 0 with a caveat, never 502 the whole snapshot card.
  let eventCount = 0;
  try {
    const events = await a.searchEvents({ limit: 100, from: fromIso, to: toIso });
    eventCount = events.items.length;
  } catch (err) {
    const detail = err instanceof Error && err.message ? err.message.slice(0, 200) : 'provider request failed';
    caveats.push(`Events unavailable for this window (${detail}); event count shown as 0.`);
  }
  const facts = orderFacts(orders.items);
  return {
    generatedAt: new Date().toISOString(),
    provider,
    window: { from: fromIso, to: toIso },
    facts: { ...facts, eventCount },
    caveats,
  };
}
