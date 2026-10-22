import type { SearchClientsInput, SearchOrdersInput } from '../types';

/**
 * Spectora REST query builders (direct `GET {base}/v2/...`, Bearer API key;
 * see docs/spectora-contract.md + https://developer.spectora.com/api/*).
 * Each builder returns a flat query object serialized by the REST client
 * (arrays become repeated `key[]` params, per the events filter docs).
 * Pagination is page-based: `page[number]` (1-based) + `page[size]` (max 200).
 * The canonical `cursor` carries the page number as a string.
 */

export const SPECTORA_PAGE_MAX = 200;

export function pageNumber(cursor?: string): number {
  const n = cursor ? Number.parseInt(cursor, 10) : Number.NaN;
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

export function pageSize(limit: number): number {
  if (!Number.isFinite(limit) || limit < 1) return 25;
  // page[size] max 200 upstream (list-agents reference + contract §page
  // params, verified 2026-10-05). Canonical MCP limit stays 100, so this cap
  // is headroom, not a target.
  return Math.min(Math.floor(limit), SPECTORA_PAGE_MAX);
}

/** Next-page cursor from JSON:API pagination meta (undefined when exhausted/unknown). */
export function nextCursor(meta: unknown): string | undefined {
  if (!meta || typeof meta !== 'object') return undefined;
  const p = (meta as { pagination?: { current?: unknown; next?: unknown; last?: unknown } }).pagination;
  if (!p) return undefined;
  const current = typeof p.current === 'number' ? p.current : undefined;
  const next = typeof p.next === 'number' ? p.next : undefined;
  const last = typeof p.last === 'number' ? p.last : undefined;
  if (next === undefined || current === undefined) return undefined;
  if (last !== undefined && next > last) return undefined;
  if (next <= current) return undefined;
  return String(next);
}

function definedEntries(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== '') out[k] = v;
  }
  return out;
}

export function orderParams(input: SearchOrdersInput): Record<string, unknown> {
  // Canonical orders are inspections in Spectora's vendor model; same endpoint.
  const qp: Record<string, unknown> = {
    'page[number]': pageNumber(input.cursor),
    'page[size]': pageSize(input.limit),
    'filter[fulltext]': input.query,
    'filter[datetime_greater_than]': input.from,
    'filter[datetime_less_than]': input.to,
  };
  // Only verified status mapping: canceled/cancelled. All other statuses are
  // intentionally unmapped (no verified REST equivalent) — see decision log.
  const s = (input.status ?? '').toLowerCase();
  if (s === 'canceled' || s === 'cancelled') qp['filter[canceled]'] = true;
  return definedEntries(qp);
}

export function contactParams(input: SearchClientsInput): Record<string, unknown> {
  return definedEntries({
    'page[number]': pageNumber(input.cursor),
    'page[size]': pageSize(input.limit),
    'filter[fulltext]': input.query,
  });
}

export function agentParams(input: { query?: string; limit: number; cursor?: string }): Record<string, unknown> {
  return definedEntries({
    'page[number]': pageNumber(input.cursor),
    'page[size]': pageSize(input.limit),
    'filter[fulltext]': input.query,
  });
}

/** Upstream `filter[start_datetime_between]` accepts date-only YYYY-MM-DD —
 * full ISO datetimes are rejected live as "Invalid ISO date" (2026-09-13).
 * Normalize any datetime input to its date prefix; pass through otherwise. */
export function toEventDate(value: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  return m ? m[1]! : value;
}

export function eventParams(input: { from?: string; to?: string; type?: string; limit: number; cursor?: string }): Record<string, unknown> {
  const qp: Record<string, unknown> = {
    'page[number]': pageNumber(input.cursor),
    'page[size]': pageSize(input.limit),
  };
  if (input.from || input.to) {
    const range = [input.from, input.to].filter((d): d is string => !!d).map(toEventDate);
    if (range.length > 0) qp['filter[start_datetime_between]'] = range;
  }
  // Only verified event types pass through; anything else is unmapped.
  if (input.type === 'radon_drop' || input.type === 'radon_pickup') qp['filter[event_type]'] = input.type;
  return definedEntries(qp);
}

/** Single-record id validation. The id travels in the REST path
 * (encodeURIComponent at the call site); nothing else is sent. */
export function getParams(id: string): { id: string } {
  const trimmed = id.trim();
  if (!trimmed) throw new Error('Spectora record id is required');
  return { id: trimmed };
}
