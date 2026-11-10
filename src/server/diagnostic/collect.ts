import type { BusinessProviderAdapter, OrderRecord } from "../providers/types";
import { createProviderAdapter } from "../providers/registry";
import type { Db } from "../repositories/db";
import type { Env } from "../types";
import { extractBasket, fetchEnrichBatch, NO_CHARGE_MARKER, type BasketItem } from "../analytics/sync";
import { splitPeople } from "../briefing/analyze";
import {
  clearDiagnosticOrders,
  insertDiagnosticOrders,
  type DiagnosticOrderInsert,
} from "./store";
import type { DiagnosticCredentialMap } from "./credentials";
import type { DiagnosticProvider } from "./types";

const DAY_MS = 86_400_000;
const ISN_CHUNK_DAYS = 90;
const SPECTORA_MAX_PAGES = 40;
const SPECTORA_CANCEL_MAX_PAGES = 12;
const ENRICH_CONCURRENCY = 24;

export interface DiagnosticWindow {
  from: string;
  to: string;
  monthsCovered: number;
}

/**
 * The last 12 FULL months. A run started mid-November reviews November 1st of
 * the prior year through October 31st, so the last month is always complete and
 * every report is comparable.
 */
export function diagnosticWindow(now = Date.now()): DiagnosticWindow {
  const d = new Date(now);
  const end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 12, 1);
  return {
    from: new Date(start).toISOString(),
    to: new Date(end).toISOString(),
    monthsCovered: 12,
  };
}

function pickString(source: Record<string, unknown> | undefined, keys: string[]): string | null {
  if (!source) return null;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function cityFrom(order: OrderRecord): string | null {
  const details = (order.details ?? {}) as Record<string, unknown>;
  const explicit = pickString(details, ["city", "client_city", "property_city"]);
  if (explicit) return explicit;
  const address = order.address ?? "";
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    // Typical US format: "123 Main St, Austin, TX 78701". Return Austin.
    const candidate = parts[parts.length - 2]!;
    if (!/^\d/.test(candidate) && candidate.length <= 60) return candidate;
  }
  return null;
}

function basketFor(order: OrderRecord, enriched: BasketItem[] | null): BasketItem[] {
  const details = (order.details ?? {}) as Record<string, unknown>;
  const fromDetails = extractBasket(details, order.serviceType);
  const items = enriched && enriched.length > 0 ? enriched : fromDetails;
  // ISN returns the full fee catalog with amount 0 for fees not on the order.
  // Match the dashboard: keep unknown (null) and charged lines, drop zeroes.
  return items.filter((item) => item.name !== NO_CHARGE_MARKER && item.amountMinor !== 0);
}

function toRow(
  order: OrderRecord,
  provider: DiagnosticProvider,
  runId: string,
  enriched: BasketItem[] | null,
  now: number,
): DiagnosticOrderInsert {
  const details = (order.details ?? {}) as Record<string, unknown>;
  const services = basketFor(order, enriched);
  const servicesEnriched = provider === "spectora" || enriched !== null ? 1 : 0;
  return {
    id: `${runId}:${provider}:${order.id}`,
    runId,
    providerOrderId: order.id,
    status: (order.status ?? "scheduled").toLowerCase(),
    scheduledAt: order.scheduledAt ?? null,
    completedAt: order.completedAt ?? null,
    totalMinor: typeof order.total === "number" ? order.total : null,
    currency: order.currency ?? "USD",
    paid: order.paid === true ? 1 : order.paid === false ? 0 : null,
    serviceType: order.serviceType ?? null,
    servicesJson: JSON.stringify(services),
    servicesEnriched,
    inspectorNames: JSON.stringify(splitPeople(order.inspectorName)),
    buyerName: order.buyerName ?? pickString(details, ["client_display", "buyerName"]),
    buyerEmail: pickString(details, ["client_email", "buyerEmail", "buyer_email"]),
    buyerPhone: pickString(details, ["client_mobile", "client_phone", "buyerPhone", "buyer_phone"]),
    buyingAgentName: order.buyingAgentName ?? pickString(details, ["agent_display"]),
    buyingAgentEmail: pickString(details, ["agent_email", "buyingAgentEmail", "buying_agent_email"]),
    buyingAgentPhone: pickString(details, ["agent_mobile", "agent_phone", "buyingAgentPhone", "buying_agent_phone"]),
    agencyName: pickString(details, ["agency_name", "agencyName", "agency_display"]),
    sellingAgentName: order.sellingAgentName ?? pickString(details, ["sellingAgentName"]),
    referralSource: order.referralSource ?? pickString(details, ["referreason", "referReason", "referralSource"]),
    city: cityFrom(order),
    address: order.address ?? null,
    detailsJson: null,
    syncedAt: now,
  };
}

async function fetchSpectora(adapter: BusinessProviderAdapter, window: DiagnosticWindow): Promise<{ orders: OrderRecord[]; truncated: boolean }> {
  const orders: OrderRecord[] = [];
  const seen = new Set<string>();
  let truncated = false;
  let cursor: string | undefined;
  for (let page = 0; page < SPECTORA_MAX_PAGES; page += 1) {
    const res = await adapter.searchOrders({ limit: 200, from: window.from, to: window.to, cursor });
    for (const order of res.items) {
      if (!seen.has(order.id)) {
        seen.add(order.id);
        orders.push(order);
      }
    }
    if (!res.nextCursor) break;
    cursor = res.nextCursor;
    if (page === SPECTORA_MAX_PAGES - 1) truncated = true;
  }
  // Spectora's default listing excludes cancelled inspections; fetch them as a
  // separate population and merge (live-verified 2026-10-17).
  let cancelCursor: string | undefined;
  for (let page = 0; page < SPECTORA_CANCEL_MAX_PAGES; page += 1) {
    const res = await adapter.searchOrders({
      limit: 200,
      from: window.from,
      to: window.to,
      status: "cancelled",
      cursor: cancelCursor,
    });
    for (const order of res.items) {
      if (!seen.has(order.id)) {
        seen.add(order.id);
        orders.push({ ...order, status: "cancelled" });
      }
    }
    if (!res.nextCursor) break;
    cancelCursor = res.nextCursor;
    if (page === SPECTORA_CANCEL_MAX_PAGES - 1) truncated = true;
  }
  return { orders, truncated };
}

async function fetchIsn(adapter: BusinessProviderAdapter, window: DiagnosticWindow): Promise<{ orders: OrderRecord[]; truncated: boolean }> {
  const orders: OrderRecord[] = [];
  const seen = new Set<string>();
  const endMs = new Date(window.to).getTime();
  let cursorMs = new Date(window.from).getTime();
  while (cursorMs < endMs) {
    const nextMs = Math.min(cursorMs + ISN_CHUNK_DAYS * DAY_MS, endMs);
    const from = new Date(cursorMs).toISOString();
    const to = new Date(nextMs).toISOString();
    const res = await adapter.searchOrders({ limit: 50000, from, to });
    for (const order of res.items) {
      if (!seen.has(order.id)) {
        seen.add(order.id);
        orders.push(order);
      }
    }
    cursorMs = nextMs;
  }
  return { orders, truncated: false };
}

/**
 * Fetch and persist the 12-month order set for one run. Idempotent: the temp
 * rows for the run are cleared first, then written in chunks. ISN service
 * detail is enriched from per-order reads (bounded) because /json windows do
 * not carry it.
 */
export interface CollectedDiagnosticOrders {
  rows: DiagnosticOrderInsert[];
  retrieved: number;
  truncated: boolean;
}

/**
 * Fetch the 12-month order set and map it to temp-row shapes without writing.
 * Kept separate from persistence so tests and one-off tooling can analyze a
 * real provider connection without a D1 binding.
 */
export async function collectDiagnosticOrders(
  env: Env,
  runId: string,
  provider: DiagnosticProvider,
  credentials: DiagnosticCredentialMap,
  window: DiagnosticWindow,
  now = Date.now(),
  opts: { enrich?: boolean } = {},
): Promise<CollectedDiagnosticOrders> {
  const adapter = createProviderAdapter(env, { provider, credentials });
  const fetched = provider === "spectora" ? await fetchSpectora(adapter, window) : await fetchIsn(adapter, window);

  let enrichedById = new Map<string, BasketItem[]>();
  if (provider === "isn" && fetched.orders.length > 0 && opts.enrich !== false) {
    // Enrich every order (no cap): ISN fee detail lives only on the per-order
    // read, and job penetration is only as good as the share of jobs covered.
    const ids = fetched.orders.map((o) => o.id);
    const prefix = `diag:${runId}`;
    const result = await fetchEnrichBatch(adapter, prefix, ids, ENRICH_CONCURRENCY);
    enrichedById = new Map(
      result.results.map((r) => {
        const key = `${prefix}:isn:`;
        const id = r.orderId.startsWith(key) ? r.orderId.slice(key.length) : r.orderId;
        return [id, r.items] as const;
      }),
    );
  }

  const rows = fetched.orders.map((order) =>
    toRow(order, provider, runId, enrichedById.get(order.id) ?? null, now),
  );
  return {
    rows,
    retrieved: rows.length,
    truncated: fetched.truncated,
  };
}

/** Fetch and persist the 12-month order set for one run. Idempotent. */
export async function collectAndPersist(
  env: Env,
  db: Db,
  runId: string,
  provider: DiagnosticProvider,
  credentials: DiagnosticCredentialMap,
  window: DiagnosticWindow,
  now = Date.now(),
  opts: { enrich?: boolean } = {},
): Promise<{ retrieved: number; truncated: boolean }> {
  const collected = await collectDiagnosticOrders(env, runId, provider, credentials, window, now, opts);
  await clearDiagnosticOrders(db, runId);
  await insertDiagnosticOrders(db, collected.rows);
  return { retrieved: collected.retrieved, truncated: collected.truncated };
}

/**
 * One bounded enrichment batch. Returns services for every claimed order,
 * using an empty basket when the detail read failed, so the caller can mark the
 * batch complete and the workflow always makes progress.
 */
export async function fetchDiagnosticEnrichment(
  env: Env,
  runId: string,
  provider: DiagnosticProvider,
  credentials: DiagnosticCredentialMap,
  providerOrderIds: string[],
): Promise<Array<{ providerOrderId: string; servicesJson: string }>> {
  if (provider !== "isn" || providerOrderIds.length === 0) {
    return providerOrderIds.map((providerOrderId) => ({ providerOrderId, servicesJson: "[]" }));
  }
  const adapter = createProviderAdapter(env, { provider, credentials });
  const prefix = `diag:${runId}`;
  const result = await fetchEnrichBatch(adapter, prefix, providerOrderIds, ENRICH_CONCURRENCY);
  const key = `${prefix}:isn:`;
  const byId = new Map(
    result.results.map((r) => {
      const id = r.orderId.startsWith(key) ? r.orderId.slice(key.length) : r.orderId;
      return [id, r.items] as const;
    }),
  );
  return providerOrderIds.map((providerOrderId) => ({
    providerOrderId,
    servicesJson: JSON.stringify(
      (byId.get(providerOrderId) ?? []).filter(
        (item) => item.name !== NO_CHARGE_MARKER && item.amountMinor !== 0,
      ),
    ),
  }));
}
