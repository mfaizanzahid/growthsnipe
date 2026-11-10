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
const WINDOW_DAYS = 365;
const ISN_CHUNK_DAYS = 90;
const SPECTORA_MAX_PAGES = 40;
const SPECTORA_CANCEL_MAX_PAGES = 12;
const ENRICH_CAP = 1500;
const ENRICH_CONCURRENCY = 8;

export interface DiagnosticWindow {
  from: string;
  to: string;
  monthsCovered: number;
}

export function diagnosticWindow(now = Date.now()): DiagnosticWindow {
  const from = new Date(now - WINDOW_DAYS * DAY_MS).toISOString();
  const to = new Date(now).toISOString();
  return { from, to, monthsCovered: 12 };
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
  return items.filter((item) => item.name !== NO_CHARGE_MARKER);
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
): Promise<CollectedDiagnosticOrders> {
  const adapter = createProviderAdapter(env, { provider, credentials });
  const fetched = provider === "spectora" ? await fetchSpectora(adapter, window) : await fetchIsn(adapter, window);

  let enrichedById = new Map<string, BasketItem[]>();
  if (provider === "isn" && fetched.orders.length > 0) {
    const ids = fetched.orders.slice(0, ENRICH_CAP).map((o) => o.id);
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
    truncated: fetched.truncated || (provider === "isn" && fetched.orders.length > ENRICH_CAP),
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
): Promise<{ retrieved: number; truncated: boolean }> {
  const collected = await collectDiagnosticOrders(env, runId, provider, credentials, window, now);
  await clearDiagnosticOrders(db, runId);
  await insertDiagnosticOrders(db, collected.rows);
  return { retrieved: collected.retrieved, truncated: collected.truncated };
}
