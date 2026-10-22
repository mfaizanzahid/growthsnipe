import type { AgentRecord, ClientRecord, EventRecord, OrderRecord } from '../types';
import { toMinorUnits } from '../money';

function camel(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

function plain(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[camel(k)] = plain(v);
    return out;
  }
  return value;
}

export interface JsonApiResource {
  id?: unknown;
  attributes?: unknown;
  relationships?: unknown;
}

/**
 * Flatten a Spectora JSON:API resource into the camelCase record the map*
 * functions read. Relationship ids worth keeping are hoisted explicitly.
 */
export function fromJsonApi(item: JsonApiResource): Record<string, any> {
  const attrs = (plain(item.attributes) ?? {}) as Record<string, any>;
  const flat: Record<string, any> = { ...attrs, id: item.id };
  if (Array.isArray(flat.tagList)) flat.tags = flat.tagList.map(String);
  else if (Array.isArray(flat.tags)) {
    flat.tags = flat.tags.map((t: any) => (typeof t === 'string' ? t : (t?.name ?? String(t))));
  }
  const rels = (item.relationships ?? {}) as Record<string, any>;
  const relId = (r: any): string | undefined => (r?.data?.id !== undefined ? String(r.data.id) : undefined);
  const buyer = relId(rels.buyer);
  if (buyer !== undefined) flat.clientId = buyer;
  const buying = relId(rels.buyingAgent);
  if (buying !== undefined) flat.buyingAgentId = buying;
  const selling = relId(rels.sellingAgent);
  if (selling !== undefined) flat.sellingAgentId = selling;
  return flat;
}

/**
 * Vendor inspection → canonical order fields, from verified REST attributes
 * only: status from canceled_at/is_client_complete, total from quote (USD
 * product default), schedule/address/service from datetime/full_address/
 * service_names. (Spectora calls orders "inspections"; the canonical word is
 * order so the model stays neutral across trades.)
 */
export function deriveOrder(flat: Record<string, any>): Record<string, any> {
  const out = { ...flat };
  if (out.status === undefined) {
    out.status = out.canceledAt ? 'cancelled' : out.isClientComplete ? 'completed' : 'scheduled';
  }
  if (out.total === undefined) {
    // Vendor `quote` is major units ("450.0"); canonical totals are cents.
    const minor = toMinorUnits(out.quote);
    if (minor !== undefined) out.total = minor;
  }
  if (out.currency === undefined) out.currency = 'USD';
  if (out.scheduledAt === undefined && out.datetime) out.scheduledAt = out.datetime;
  if (out.address === undefined) out.address = out.fullAddress ?? out.propertyAddress;
  if (out.serviceType === undefined && out.serviceNames) out.serviceType = out.serviceNames;
  if (out.notes === undefined) out.notes = out.description ?? out.requestNotes;
  if (out.buyerName === undefined) out.buyerName = out.buyerNames;
  // Carry the full normalized vendor attributes so no provider detail is lost.
  out.details = { ...flat };
  return out;
}

/** Contact phone fallback across Spectora's phone fields. */
export function deriveContact(flat: Record<string, any>): Record<string, any> {
  const out = { ...flat };
  if (out.phone === undefined || out.phone === null || out.phone === '') {
    out.phone = out.mobilePhone ?? out.homePhone;
  }
  return out;
}

/** Agent display name + inspection-count stats. */
export function deriveAgent(flat: Record<string, any>): Record<string, any> {
  const out = { ...flat };
  if (out.name === undefined) {
    out.name = [out.firstName, out.lastName].filter(Boolean).join(' ') || 'Unknown';
  }
  out.stats = {
    buyingAgentInspections: out.buyingAgentInspections ?? null,
    sellingAgentInspections: out.sellingAgentInspections ?? null,
    totalInspectionsCount: out.totalInspectionsCount ?? null,
  };
  return out;
}

/** Event type/occurredAt mapping (general calendar events have no event_type). */
export function deriveEvent(flat: Record<string, any>): Record<string, any> {
  const out = { ...flat };
  if (out.type === undefined) out.type = out.eventType ?? 'general';
  if (out.occurredAt === undefined) out.occurredAt = out.startDatetime;
  if (out.entityType === undefined && out.inspectionId !== undefined && out.inspectionId !== null) {
    out.entityType = 'inspection';
    out.entityId = String(out.inspectionId);
  }
  return out;
}

export function mapClient(input: Record<string, any>): ClientRecord {
  return {
    id: String(input.id),
    name: input.name ?? ([input.firstName, input.lastName].filter(Boolean).join(' ') || 'Unknown'),
    email: input.email, phone: input.phone, city: input.city, state: input.state, source: input.source,
    createdAt: input.createdAt, updatedAt: input.updatedAt,
    tags: Array.isArray(input.tags) ? input.tags.map(String) : undefined,
  };
}
export function mapOrder(input: Record<string, any>): OrderRecord {
  return {
    id: String(input.id), clientId: input.clientId ? String(input.clientId) : undefined,
    status: input.status, serviceType: input.serviceType ?? input.inspectionType,
    scheduledAt: input.scheduledAt, completedAt: input.completedAt,
    total: typeof input.total === 'number' ? input.total : undefined, currency: input.currency,
    assignedToId: input.assignedToId, address: input.address, notes: input.notes,
    buyerName: input.buyerName, inspectorName: input.inspectorName,
    buyingAgentName: input.buyingAgentName, sellingAgentName: input.sellingAgentName,
    paid: typeof input.paid === 'boolean' ? input.paid : undefined,
    confirmed: typeof input.confirmed === 'boolean' ? input.confirmed : undefined,
    referralSource: input.referralSource, createdAt: input.createdAt, updatedAt: input.updatedAt,
    details: (input.details ?? undefined) as Record<string, unknown> | undefined,
  };
}
export function mapAgent(input: Record<string, any>): AgentRecord {
  return { id: String(input.id), name: input.name ?? 'Unknown', email: input.email, active: input.active, stats: input.stats };
}
export function mapEvent(input: Record<string, any>): EventRecord {
  return { id: String(input.id), type: String(input.type), occurredAt: String(input.occurredAt ?? input.createdAt), entityType: input.entityType, entityId: input.entityId ? String(input.entityId) : undefined, metadata: input.metadata };
}
