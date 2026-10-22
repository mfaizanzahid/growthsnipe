/**
 * ISN record -> canonical record mapping.
 *
 * Source hints: docs/isn.yaml #/components/schemas/Order (~line 14551),
 * Client (~14051), Agent (~13936). PINNED LIVE (2026-09-13 probe against
 * goisn.net): flags are `yes`/`no` strings; dates are `Y-m-d H:i:s` local
 * (modified is ISO8601); totalfee is a STRING in major units (dollars);
 * ordertype/foundation/state/city refs are UUIDs (names NOT resolved);
 * client notes arrive as a string (spec says array); agent `show`
 * yes/no is the activity signal; calendar events are
 * {id,start,end,title,type:"event",orderid,deleted,show} with title as the
 * human label. Remaining TODO(PROBE): currency (no currency field observed
 * anywhere), ordertype-name resolution, recurring-event semantics.
 *
 * RE-PINNED LIVE (2026-10-18 probe, `/json/orders` windowed read): orders
 * carry `total_fee` (dollar float), `client_display`/`agent_display`,
 * `inspector1..10_display` (real names), `report_number`, and `show`
 * (`yes`/`no`, deleted). `/json` has NO completion flag, so `fromIsnOrder`
 * falls back to "scheduled in the past => completed" for that shape.
 */
import type { AgentRecord, ClientRecord, EventRecord, OrderRecord } from '../types';
import { toMinorUnits } from '../money';

/** Coerce scalar-ish values to trimmed strings; objects/arrays -> undefined
 * (never throw on the spec's "type varies" fields). */
function str(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') {
    const t = value.trim();
    return t === '' ? undefined : t;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    if (typeof value === 'number' && !Number.isFinite(value)) return undefined;
    return String(value);
  }
  return undefined;
}

/**
 * Parse ISN's string flags. Live probe (2026-09-13, goisn.net) confirmed the
 * vocab is exactly `yes`/`no` (plus `1`/`0`, `true`/`false` accepted
 * defensively). Anything else -> undefined (fail closed, never guess).
 */
function truthyFlag(value: unknown): boolean | undefined {
  const s = str(value)?.toLowerCase();
  if (s === undefined) return undefined;
  if (s === '1' || s === 'true' || s === 'yes' || s === 'y') return true;
  if (s === '0' || s === 'false' || s === 'no' || s === 'n') return false;
  return undefined;
}

function firstString(...values: unknown[]): string | undefined {
  for (const v of values) {
    const s = str(v);
    if (s !== undefined) return s;
  }
  return undefined;
}

function joinAddress(parts: unknown[]): string | undefined {
  const bits = parts.map(str).filter((s): s is string => s !== undefined);
  return bits.length > 0 ? bits.join(', ') : undefined;
}

/** Epoch millis for an ISN instant, or null. ISN emits un-zoned
 * `Y-m-d H:i:s` / `Y-m-dTH:i:s`; the space form is normalized to `T` so V8
 * parses it the same way everywhere. */
function parseInstantMs(value: string | undefined): number | null {
  if (value === undefined) return null;
  const t = new Date(value.includes('T') ? value : value.replace(' ', 'T')).getTime();
  return Number.isNaN(t) ? null : t;
}

/** ISN exposes up to ten inspectors per order; `/json` carries the display
 * names (live-probed 2026-10-18: `inspectorN_display` present on every row)
 * while `/rest` listings only carry the reference field. Names are joined so
 * the analyzer's `splitPeople` can treat a team job as several people. */
function inspectorName(r: Record<string, unknown>): string | undefined {
  const names: string[] = [];
  for (let i = 1; i <= 10; i += 1) {
    const name = str(r[`inspector${i}_display`]);
    if (name !== undefined && !names.includes(name)) names.push(name);
  }
  if (names.length > 0) return names.join(', ');
  return str(r.inspector1);
}

// --- Orders ---------------------------------------------------------------

export type IsnOrderRaw = Record<string, unknown>;

/**
 * Normalize an ISN order. Returns null when the record carries neither `id`
 * nor `oid`, or when it is soft-deleted (`show === "no"`) — canonical ids are
 * never invented and deleted orders are noise, not business. Callers drop
 * nulls and set `totalEstimate` to the mapped length so the drop stays honest.
 *
 * Two vendors shapes feed this function and both are read with union fields:
 *  - `/json/orders` (windowed, live-probed 2026-10-18): money is `total_fee`
 *    (dollar float), names are `*_display`, and there is NO completion flag —
 *    only `canceled` / `canceled_date` / `show`.
 *  - `/rest/orders` (un-windowed listing): money is `totalfee` (dollar
 *    string), flags are `yes`/`no`, and `complete`/`completeddatetime` exist.
 *
 * Because `/json` cannot say "completed", a non-cancelled order whose
 * scheduled instant is already past is reported as completed. Briefing
 * windows always end at local midnight (src/server/briefing/windows.ts), so
 * this is deterministic there and never wall-clock-dependent for a briefing.
 * `asOf` is injectable for tests.
 */
export function fromIsnOrder(raw: unknown, asOf: Date = new Date()): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const id = firstString(r.id, r.oid !== undefined && r.oid !== null ? String(r.oid) : undefined);
  if (id === undefined) return null;

  // Live probe: /json marks deleted orders `show:"no"` (57 of 502 in the
  // sampled window). They are excluded from every count, not just cancelled.
  if (str(r.show)?.toLowerCase() === 'no') return null;

  // Live probe: /rest flags are `yes`/`no` strings that are ALWAYS present, so
  // presence means nothing — only affirmative values count. A soft-deleted
  // order (deleteddatetime set) reads as cancelled.
  const canceledSet =
    truthyFlag(r.canceled) === true ||
    str(r.canceleddatetime) !== undefined ||
    str(r.canceled_date) !== undefined ||
    str(r.deleteddatetime) !== undefined;
  const completedSet = truthyFlag(r.complete) === true || str(r.completeddatetime) !== undefined;
  const scheduledAt = firstString(r.datetime, r.scheduleddatetime, r.datetimeinspection, r.osscheduleddatetime);
  // `/json` has no completion flag; a past, non-cancelled order is complete.
  const occurredMs = parseInstantMs(scheduledAt);
  const occurred = occurredMs !== null && occurredMs < asOf.getTime();
  const status = canceledSet ? 'cancelled' : completedSet || occurred ? 'completed' : 'scheduled';

  const confirmedBy = str(r.confirmedby);
  const confirmedAt = str(r.confirmeddatetime);

  return {
    id,
    clientId: firstString(r.client_id, r.client),
    status,
    // Live probe: ordertype is a reference UUID, not a name — surfacing it
    // as serviceType would mislead. Left undefined (raw UUID stays in
    // details) until a name lookup is verified.
    serviceType: undefined,
    scheduledAt,
    completedAt: str(r.completeddatetime),
    // `/json` sends `total_fee` as a major-unit number (140.33); `/rest`
    // sends `totalfee` as a major-unit string. Both become integer minor
    // units. ISN exposes no currency field and the platform is US-only, so
    // totals are labelled USD; see docs/decision-log.md.
    total: toMinorUnits(firstString(r.total_fee, r.totalfee)),
    currency: 'USD',
    address:
      joinAddress([r.address1, r.address2, r.city, firstString(r.state, r.stateabbreviation), firstString(r.postal_code, r.zip)]) ??
      str(r.address),
    buyerName: firstString(r.client_display, r.buyername),
    inspectorName: inspectorName(r),
    buyingAgentName: firstString(r.agent_display, r.buyersagent),
    sellingAgentName: str(r.sellersagent),
    paid: truthyFlag(r.paid),
    // confirmed only from positive presence; absence stays undefined
    // (never claim "unconfirmed" without a verified negative signal).
    confirmed: confirmedBy !== undefined || confirmedAt !== undefined ? true : undefined,
    referralSource: str(r.referreason),
    createdAt: str(r.createddatetime),
    updatedAt: str(r.modified),
    // Full vendor attrs so no provider detail is lost without contract churn.
    details: { ...r },
  };
}

export function mapOrder(input: Record<string, unknown>): OrderRecord {
  return {
    id: String(input.id),
    clientId: input.clientId !== undefined ? String(input.clientId) : undefined,
    status: input.status !== undefined ? String(input.status) : undefined,
    serviceType: input.serviceType !== undefined ? String(input.serviceType) : undefined,
    scheduledAt: input.scheduledAt !== undefined ? String(input.scheduledAt) : undefined,
    completedAt: input.completedAt !== undefined ? String(input.completedAt) : undefined,
    total: typeof input.total === 'number' ? input.total : undefined,
    currency: input.currency !== undefined ? String(input.currency) : undefined,
    address: input.address !== undefined ? String(input.address) : undefined,
    buyerName: input.buyerName !== undefined ? String(input.buyerName) : undefined,
    inspectorName: input.inspectorName !== undefined ? String(input.inspectorName) : undefined,
    buyingAgentName: input.buyingAgentName !== undefined ? String(input.buyingAgentName) : undefined,
    sellingAgentName: input.sellingAgentName !== undefined ? String(input.sellingAgentName) : undefined,
    paid: typeof input.paid === 'boolean' ? input.paid : undefined,
    confirmed: typeof input.confirmed === 'boolean' ? input.confirmed : undefined,
    referralSource: input.referralSource !== undefined ? String(input.referralSource) : undefined,
    createdAt: input.createdAt !== undefined ? String(input.createdAt) : undefined,
    updatedAt: input.updatedAt !== undefined ? String(input.updatedAt) : undefined,
    details: (input.details ?? undefined) as Record<string, unknown> | undefined,
  };
}

// --- Clients --------------------------------------------------------------

export function fromIsnClient(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id);
  if (id === undefined) return null;
  const first = str(r.first);
  const last = str(r.last);
  const fullName = [first, last].filter((s): s is string => s !== undefined).join(' ') || undefined;
  return {
    id,
    name: str(r.display) ?? fullName ?? str(r.companyname) ?? 'Unknown',
    email: str(r.email),
    phone: firstString(r.mobilephone, r.homephone, r.workphone),
    city: str(r.city),
    state: firstString(r.state, r.stateabbreviation),
    // No created-at field in the spec; modified is the only timestamp.
    createdAt: undefined,
    updatedAt: str(r.modified),
    details: { ...r },
  };
}

export function mapClient(input: Record<string, unknown>): ClientRecord {
  return {
    id: String(input.id),
    name: input.name !== undefined ? String(input.name) : 'Unknown',
    email: input.email !== undefined ? String(input.email) : undefined,
    phone: input.phone !== undefined ? String(input.phone) : undefined,
    city: input.city !== undefined ? String(input.city) : undefined,
    state: input.state !== undefined ? String(input.state) : undefined,
    createdAt: input.createdAt !== undefined ? String(input.createdAt) : undefined,
    updatedAt: input.updatedAt !== undefined ? String(input.updatedAt) : undefined,
  };
}

// --- Agents ---------------------------------------------------------------

export function fromIsnAgent(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id);
  if (id === undefined) return null;
  const first = str(r.first);
  const last = str(r.last);
  const fullName = [first, last].filter((s): s is string => s !== undefined).join(' ') || undefined;
  // Live probe: `show` is the visibility flag (`yes` = active in the app,
  // `no` = hidden). tc/sendsms are channel prefs, not activity signals.
  const show = str(r.show)?.toLowerCase();
  const stats: Record<string, number | string | null> = {};
  const agency = str(r.agency);
  if (agency !== undefined) stats.agency = agency;
  const lastActive = str(r.lastactive);
  if (lastActive !== undefined) stats.lastactive = lastActive;
  return {
    id,
    name: str(r.display) ?? fullName ?? 'Unknown',
    email: str(r.email),
    active: show === 'yes' ? true : show === 'no' ? false : undefined,
    stats: Object.keys(stats).length > 0 ? stats : undefined,
    details: { ...r },
  };
}

export function mapAgent(input: Record<string, unknown>): AgentRecord {
  return {
    id: String(input.id),
    name: input.name !== undefined ? String(input.name) : 'Unknown',
    email: input.email !== undefined ? String(input.email) : undefined,
    active: typeof input.active === 'boolean' ? input.active : undefined,
    stats: (input.stats ?? undefined) as Record<string, number | string | null> | undefined,
  };
}

// --- Events (best-effort: calendarevents items are untyped in the spec) ----

const EVENT_ID_KEYS = ['id', 'uuid', 'eventid', 'event_id', 'eventuuid', 'calendarid'];
const EVENT_AT_KEYS = ['start', 'startdatetime', 'start_datetime', 'datestart', 'datetime', 'scheduleddatetime', 'date', 'createddatetime'];
const EVENT_TYPE_KEYS = ['eventtype', 'event_type', 'type', 'title', 'kind', 'summary'];
const EVENT_ORDER_KEYS = ['orderid', 'order_id', 'orderuuid', 'oid'];

function pickKey(r: Record<string, unknown>, keys: string[]): unknown {
  const lower = new Map<string, unknown>();
  for (const [k, v] of Object.entries(r)) {
    if (!lower.has(k.toLowerCase())) lower.set(k.toLowerCase(), v);
  }
  for (const key of keys) {
    if (lower.has(key)) return lower.get(key);
  }
  return undefined;
}

/**
 * Normalize a calendar event. Live probe (2026-09-13) pinned the real shape:
 * {id, start, end, title, type ("event"), orderid ("" when none),
 * where, description, deleted (null or datetime), show (1/0), ...}.
 * Soft-deleted events are dropped. Returns null when the item carries no id
 * or no start-ish key — ids are never invented and occurredAt is required.
 * Callers keep `totalEstimate` = raw records returned so drops stay visible.
 */
export function fromIsnEvent(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (str(r.deleted) !== undefined) return null;
  const id = str(pickKey(r, EVENT_ID_KEYS));
  const occurredAt = str(pickKey(r, EVENT_AT_KEYS));
  if (id === undefined || occurredAt === undefined) return null;
  const orderId = str(pickKey(r, EVENT_ORDER_KEYS));
  // `type` is always the generic "event"; the human label is `title`.
  const title = str((r as Record<string, unknown>).title);
  return {
    id,
    type: title ?? str(pickKey(r, EVENT_TYPE_KEYS)) ?? 'general',
    occurredAt,
    entityType: orderId !== undefined ? 'order' : undefined,
    entityId: orderId,
    metadata: { ...r },
  };
}

export function mapEvent(input: Record<string, unknown>): EventRecord {
  return {
    id: String(input.id),
    type: String(input.type ?? 'general'),
    occurredAt: String(input.occurredAt),
    entityType: input.entityType !== undefined ? String(input.entityType) : undefined,
    entityId: input.entityId !== undefined ? String(input.entityId) : undefined,
    metadata: (input.metadata ?? undefined) as Record<string, unknown> | undefined,
  };
}
