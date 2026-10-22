import { and, desc, eq, gte, inArray, like, lt, lte, or, sql } from "drizzle-orm";
import { appLogs, organizations } from "../../../db/schema";
import type { Db } from "../repositories/db";
import { createDb } from "../repositories/db";
import type { Env } from "../types";
import { nowMs } from "./time";

export type LogLevel = "info" | "warn" | "error";

export type LogSurface =
  | "api"
  | "auth"
  | "billing"
  | "org"
  | "mcp"
  | "webhook"
  | "cron"
  | "superadmin";

export const LOG_SURFACES: readonly LogSurface[] = [
  "api",
  "auth",
  "billing",
  "org",
  "mcp",
  "webhook",
  "cron",
  "superadmin",
];

export const LOG_LEVELS: readonly LogLevel[] = ["info", "warn", "error"];

export interface LogInput {
  level?: LogLevel;
  event: string;
  surface: LogSurface;
  message: string;
  path?: string | null;
  method?: string | null;
  statusCode?: number | null;
  userId?: string | null;
  userEmail?: string | null;
  orgId?: string | null;
  orgName?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  /** City the request came from, from Cloudflare's request.cf geo. */
  city?: string | null;
  /** ISO 3166-1 alpha-2 country code, from request.cf geo. */
  country?: string | null;
  detail?: unknown;
}

export interface AppLogRow {
  id: string;
  createdAt: string;
  level: string;
  event: string;
  surface: string;
  message: string;
  path: string | null;
  method: string | null;
  statusCode: number | null;
  userId: string | null;
  userEmail: string | null;
  orgId: string | null;
  orgName: string | null;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
  city: string | null;
  country: string | null;
  detail: unknown;
}

export interface LogQuery {
  q?: string;
  level?: string;
  surface?: string;
  from?: number;
  to?: number;
  page?: number;
  limit?: number;
}

export interface LogPage {
  logs: AppLogRow[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

const MAX_MESSAGE = 500;
const MAX_DETAIL = 4000;
const MAX_STRING = 1000;
const MAX_DEPTH = 4;

/** Keys whose values must never reach the log store. */
const SENSITIVE_KEY =
  /pass(word)?|secret|token|authorization|cookie|api[-_]?key|cvv|card[-_]?number|\bpan\b/i;

function clip(value: string | null | undefined, max: number): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return trimmed.length > max ? `${trimmed.slice(0, max)}...` : trimmed;
}

/**
 * JSON-safe copy of arbitrary metadata with secret-bearing values stripped.
 * Depth is capped and long strings are truncated so a log row stays small.
 */
export function redactDetail(input: unknown, depth = 0): unknown {
  if (input == null) return null;
  if (input instanceof Error) {
    return {
      name: input.name,
      message: clip(input.message, MAX_MESSAGE),
      stack: clip(input.stack ?? null, 2000),
    };
  }
  if (typeof input === "string") return input.slice(0, MAX_STRING);
  if (typeof input === "number" || typeof input === "boolean") return input;
  if (depth >= MAX_DEPTH) return "[truncated]";
  if (Array.isArray(input)) {
    return input.slice(0, 20).map((item) => redactDetail(item, depth + 1));
  }
  if (typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : redactDetail(value, depth + 1);
    }
    return out;
  }
  return null;
}

function serializeDetail(detail: unknown): string | null {
  if (detail === undefined) return null;
  try {
    const text = JSON.stringify(redactDetail(detail));
    if (!text || text === "null") return null;
    return text.length > MAX_DETAIL ? `${text.slice(0, MAX_DETAIL)}...` : text;
  } catch {
    return null;
  }
}

/**
 * Append one log row.
 *
 * Logging must never break the request it is observing: a D1 failure here is
 * swallowed (and reported on the console) rather than propagated.
 */
export async function writeAppLog(db: Db, input: LogInput): Promise<void> {
  try {
    await db.insert(appLogs).values({
      id: crypto.randomUUID(),
      createdAt: nowMs(),
      level: input.level ?? "info",
      event: input.event,
      surface: input.surface,
      message: clip(input.message, MAX_MESSAGE) ?? input.event,
      path: clip(input.path, 300),
      method: clip(input.method, 10),
      statusCode: input.statusCode ?? null,
      userId: input.userId ?? null,
      userEmail: clip(input.userEmail, 200),
      orgId: input.orgId ?? null,
      orgName: clip(input.orgName, 200),
      ip: clip(input.ip, 64),
      userAgent: clip(input.userAgent, 300),
      requestId: clip(input.requestId, 80),
      city: clip(input.city, 120),
      country: clip(input.country, 8),
      detailJson: serializeDetail(input.detail),
    });
  } catch (err) {
    console.warn(
      "[app-logs] write failed:",
      err instanceof Error ? err.message : "unknown error",
    );
  }
}

/**
 * Log a domain event using the D1 handle on the environment.
 *
 * Service-layer code (billing, orgs, cron) has `env` but no request context,
 * so this is the entry point there. It never throws.
 */
export async function logEvent(env: Env, input: LogInput): Promise<void> {
  // No D1 binding (unit tests, local tooling): nothing to log to.
  if (!env.DB) return;
  try {
    await writeAppLog(createDb(env.DB), input);
  } catch {
    // writeAppLog already swallows its own errors; this guards the db handle.
  }
}

/**
 * Resolve a workspace name for a log row. Best effort - a missing workspace
 * must not stop the event from being recorded.
 */
export async function resolveOrgName(db: Db, orgId: string | null | undefined): Promise<string | null> {
  if (!orgId) return null;
  try {
    const rows = await db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    return rows[0]?.name ?? null;
  } catch {
    return null;
  }
}

/** Cloudflare request geo, when the runtime provides it. */
export function requestGeo(request: Request): { city: string | null; country: string | null } {
  const cf = (request as Request & { cf?: { city?: string; country?: string } }).cf;
  return {
    city: cf?.city ?? null,
    country: cf?.country ?? null,
  };
}

/** Delete specific log rows by id. Returns the number removed. */
export async function deleteAppLogs(db: Db, ids: string[]): Promise<number> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return 0;
  const deleted = await db
    .delete(appLogs)
    .where(inArray(appLogs.id, unique))
    .returning({ id: appLogs.id });
  return deleted.length;
}

/** Days to keep platform logs. Default 90; clamp to a sane range. */
export function retentionDays(env: { LOG_RETENTION_DAYS?: string }): number {
  const parsed = Number.parseInt(env.LOG_RETENTION_DAYS ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 90;
  return Math.min(parsed, 3650);
}

/** Delete rows older than the retention window. Returns the number removed. */
export async function purgeAppLogs(db: Db, days: number): Promise<number> {
  const cutoff = nowMs() - days * 24 * 60 * 60 * 1000;
  const counted = await db
    .select({ n: sql<number>`count(*)` })
    .from(appLogs)
    .where(lt(appLogs.createdAt, cutoff));
  const total = Number(counted[0]?.n ?? 0);
  if (total > 0) await db.delete(appLogs).where(lt(appLogs.createdAt, cutoff));
  return total;
}

export async function queryAppLogs(db: Db, query: LogQuery): Promise<LogPage> {
  const page = Math.max(1, Math.floor(query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Math.floor(query.limit ?? 50)));
  const conditions = [];

  const q = query.q?.trim();
  if (q) {
    const needle = `%${q}%`;
    conditions.push(
      or(
        like(appLogs.message, needle),
        like(appLogs.event, needle),
        like(appLogs.userEmail, needle),
        like(appLogs.orgName, needle),
        like(appLogs.path, needle),
      ),
    );
  }
  if (query.level) conditions.push(eq(appLogs.level, query.level));
  if (query.surface) conditions.push(eq(appLogs.surface, query.surface));
  if (query.from != null) conditions.push(gte(appLogs.createdAt, query.from));
  if (query.to != null) conditions.push(lte(appLogs.createdAt, query.to));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select()
    .from(appLogs)
    .where(where)
    // id breaks ties between rows written in the same millisecond, so paging
    // through a busy window stays stable (no duplicate or skipped rows).
    .orderBy(desc(appLogs.createdAt), desc(appLogs.id))
    .limit(limit)
    .offset((page - 1) * limit);

  const counted = await db
    .select({ n: sql<number>`count(*)` })
    .from(appLogs)
    .where(where);
  const total = Number(counted[0]?.n ?? 0);

  return {
    logs: rows.map((row) => ({
      id: row.id,
      createdAt: new Date(row.createdAt).toISOString(),
      level: row.level,
      event: row.event,
      surface: row.surface,
      message: row.message,
      path: row.path,
      method: row.method,
      statusCode: row.statusCode,
      userId: row.userId,
      userEmail: row.userEmail,
      orgId: row.orgId,
      orgName: row.orgName,
      ip: row.ip,
      userAgent: row.userAgent,
      requestId: row.requestId,
      city: row.city,
      country: row.country,
      detail: row.detailJson ? safeParse(row.detailJson) : null,
    })),
    page,
    limit,
    total,
    hasMore: page * limit < total,
  };
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return json;
  }
}

/** Client IP as seen by Cloudflare. */
export function clientIp(headers: Headers): string | null {
  const cf = headers.get("cf-connecting-ip");
  if (cf) return cf;
  const forwarded = headers.get("x-forwarded-for");
  return forwarded ? (forwarded.split(",")[0]?.trim() ?? null) : null;
}

/** Cloudflare request id, used to correlate a log row with a Worker request. */
export function requestId(headers: Headers): string | null {
  return headers.get("cf-ray");
}
