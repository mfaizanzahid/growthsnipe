/**
 * ISN query-string builders (pure; no network).
 *
 * Verified params (docs/isn.yaml):
 * - GET /orders: after?, agentuuid?, completed? (boolean), datetimeafter?,
 *   datetimebefore?, insuranceagentuuid?, uuids? (no limit/page params;
 *   `count` = records returned).
 * - GET /clients/search: q?
 * - GET /agents/search: q?
 * - GET /calendarevents: after?, end?, noorderevents?, start?
 * - GET /order|client|agent/{id}: id in path (UUID; numeric accepted on some
 *   endpoints) + order-only flags withallcontrols?, withpropertyphoto?.
 *
 * ISN_PAGE note: ISN list endpoints take NO page/limit params, so canonical
 * `limit`/`cursor` have no server-side equivalent. The adapter returns the WHOLE
 * matching collection in one call (no `nextCursor`); the only bound is the
 * client-side memory backstop (lib/retrieval-limits.ts), and `totalEstimate` is
 * the pre-slice count so any shortfall it causes is disclosed as truncation
 * rather than hidden. Canonical `limit` does NOT reduce what ISN returns.
 * Cursor/`after` polling semantics are unverified — `after` is NOT sent from the
 * canonical cursor (see decision log 2026-09-13).
 *
 * Unmapped canonical inputs are deliberately dropped, never guessed
 * (Spectora precedent: params.ts drops unmapped status/type filters):
 * - searchOrders `query`: no fulltext param exists on /orders. Dropped
 *   (documented) rather than silently client-side filtered as if server did.
 * - searchOrders `status`: live probe showed `completed=true` returns the
 *   completed subset while `completed=false` returns everything (i.e. false
 *   is a no-op, not an "incomplete-only" filter). Only status 'completed'
 *   maps to `completed=true`; every other status is dropped — output
 *   `status` mapping still lets callers (e.g. snapshot revenue) filter on
 *   mapped records.
 * - searchEvents `type`: event items carry only the generic type "event"
 *   with the label in `title`; no server-side type filter exists. Dropped.
 * - Every `cursor`: no paging params; dropped (single page).
 *
 * Dates: live probe accepted `Y-m-d` for datetimeafter/start/end, so inputs
 * are coerced to their `YYYY-MM-DD` prefix (full ISO datetimes unverified).
 */
import type { SearchClientsInput, SearchOrdersInput } from '../types';

function definedEntries(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== '') out[k] = v;
  }
  return out;
}

/** ISN date filters accept `Y-m-d` (live-probed); coerce any datetime
 * input to its date prefix rather than sending an unverified format. */
export function toIsnDate(value: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  return m ? m[1]! : value;
}

/** The `/json` order family requires a full ISO 8601 instant for BOTH `start`
 * and `end` (live-probed: a bare date or a missing value is HTTP 400). ISN
 * expects the un-zoned form `Y-m-dTH:M:S`; a trailing `Z`/offset is stripped
 * because ISN has no timezone of its own. */
export function toIsnInstant(value: string): string {
  const trimmed = value.trim();
  const full = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/.exec(trimmed);
  if (full) return `${full[1]}T${full[2]}`;
  const date = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed);
  if (date) return `${date[1]}T00:00:00`;
  return trimmed;
}

/** Canonical order search -> ISN /orders query. */
export function orderParams(input: SearchOrdersInput): Record<string, unknown> {
  const status = (input.status ?? '').toLowerCase();
  return definedEntries({
    datetimeafter: input.from !== undefined ? toIsnDate(input.from) : undefined,
    datetimebefore: input.to !== undefined ? toIsnDate(input.to) : undefined,
    // Verified: completed=true narrows to the completed subset;
    // completed=false is a no-op, so it is never sent.
    completed: status === 'completed' ? true : undefined,
  });
}

/** Canonical client search -> ISN /clients/search query. */
export function clientParams(input: SearchClientsInput): Record<string, unknown> {
  return definedEntries({ q: input.query });
}

/** Canonical agent search -> ISN /agents/search query. */
export function agentParams(input: { query?: string; limit: number; cursor?: string }): Record<string, unknown> {
  void input.limit;
  void input.cursor;
  return definedEntries({ q: input.query });
}

/** Canonical event search -> ISN /calendarevents query (`start`/`end`
 * verified live; `type` is unmapped — items carry only generic "event"). */
export function eventParams(input: { from?: string; to?: string; type?: string; limit: number; cursor?: string }): Record<string, unknown> {
  void input.type;
  void input.limit;
  void input.cursor;
  return definedEntries({
    start: input.from !== undefined ? toIsnDate(input.from) : undefined,
    end: input.to !== undefined ? toIsnDate(input.to) : undefined,
  });
}

/** Single-record id validation. The id travels in the REST path
 * (encodeURIComponent at the call site); nothing else is sent. */
export function getParams(id: string): { id: string } {
  const trimmed = id.trim();
  if (!trimmed) throw new Error('ISN record id is required');
  return { id: trimmed };
}
