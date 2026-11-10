import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../repositories/db";
import {
  diagnosticEvents,
  diagnosticOrders,
  diagnosticRuns,
} from "../db/schema";
import type {
  DiagnosticFacts,
  DiagnosticNarrative,
  DiagnosticProvider,
  DiagnosticRunStatus,
} from "./types";

export type DiagnosticRunRow = typeof diagnosticRuns.$inferSelect;

export interface NewDiagnosticRun {
  oneTimeOrderId: string;
  email: string;
  now?: number;
}

/** Create the run for a paid order exactly once. Safe to call on retries. */
export async function createOrGetRun(db: Db, input: NewDiagnosticRun): Promise<DiagnosticRunRow> {
  const existing = await getRunByOrderId(db, input.oneTimeOrderId);
  if (existing) return existing;
  const now = input.now ?? Date.now();
  await db
    .insert(diagnosticRuns)
    .values({
      id: crypto.randomUUID(),
      oneTimeOrderId: input.oneTimeOrderId,
      email: input.email.trim().toLowerCase(),
      status: "awaiting_connection",
      stage: "awaiting_connection",
      progress: 0,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();
  const created = await getRunByOrderId(db, input.oneTimeOrderId);
  if (!created) throw new Error("Could not create diagnostic run");
  return created;
}

export async function getRunById(db: Db, id: string): Promise<DiagnosticRunRow | null> {
  const rows = await db.select().from(diagnosticRuns).where(eq(diagnosticRuns.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getRunByOrderId(db: Db, orderId: string): Promise<DiagnosticRunRow | null> {
  const rows = await db
    .select()
    .from(diagnosticRuns)
    .where(eq(diagnosticRuns.oneTimeOrderId, orderId))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateRun(
  db: Db,
  id: string,
  patch: Partial<typeof diagnosticRuns.$inferInsert>,
  now = Date.now(),
): Promise<void> {
  await db
    .update(diagnosticRuns)
    .set({ ...patch, updatedAt: now })
    .where(eq(diagnosticRuns.id, id));
}

export async function setRunStage(
  db: Db,
  id: string,
  status: DiagnosticRunStatus,
  stage: string,
  progress: number,
  now = Date.now(),
): Promise<void> {
  await updateRun(db, id, { status, stage, progress }, now);
}

export async function saveFacts(
  db: Db,
  id: string,
  facts: DiagnosticFacts,
  now = Date.now(),
): Promise<void> {
  await updateRun(db, id, { factsJson: JSON.stringify(facts) }, now);
}

export async function saveNarrative(
  db: Db,
  id: string,
  narrative: DiagnosticNarrative,
  now = Date.now(),
): Promise<void> {
  await updateRun(db, id, { narrativeJson: JSON.stringify(narrative) }, now);
}

export interface DiagnosticOrderInsert {
  id: string;
  runId: string;
  providerOrderId: string;
  status: string;
  scheduledAt: string | null;
  completedAt: string | null;
  totalMinor: number | null;
  currency: string;
  paid: number | null;
  serviceType: string | null;
  servicesJson: string | null;
  servicesEnriched: number;
  inspectorNames: string;
  buyerName: string | null;
  buyerEmail: string | null;
  buyerPhone: string | null;
  buyingAgentName: string | null;
  buyingAgentEmail: string | null;
  buyingAgentPhone: string | null;
  agencyName: string | null;
  sellingAgentName: string | null;
  referralSource: string | null;
  city: string | null;
  address: string | null;
  detailsJson: string | null;
  syncedAt: number;
}

/**
 * Idempotent write: a retried window never duplicates rows.
 *
 * D1 caps bound parameters at 100 per query, so a multi-row insert (22 columns
 * per row) cannot be sent as one statement. Each row is its own statement
 * inside a D1 batch, which counts as a single query against the per-invocation
 * query budget even for thousands of orders.
 */
export async function insertDiagnosticOrders(db: Db, rows: DiagnosticOrderInsert[]): Promise<void> {
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    if (chunk.length === 0) continue;
    const statements = chunk.map((row) =>
      db.insert(diagnosticOrders).values(row).onConflictDoNothing(),
    );
    await db.batch(
      statements as unknown as [typeof statements[number], ...typeof statements[number][]],
    );
  }
}

/** Provider order ids that still need fee/service enrichment. */
export async function claimDiagnosticOrdersForEnrichment(
  db: Db,
  runId: string,
  limit = 40,
): Promise<string[]> {
  const rows = await db
    .select({ providerOrderId: diagnosticOrders.providerOrderId })
    .from(diagnosticOrders)
    .where(and(eq(diagnosticOrders.runId, runId), eq(diagnosticOrders.servicesEnriched, 0)))
    .limit(Math.max(1, Math.min(50, limit)));
  return rows.map((row) => row.providerOrderId);
}

/** Persist one enrichment batch. Every claimed order is marked done, even when
 * the detail read failed, so a permanently unreadable order cannot loop. */
export async function saveDiagnosticOrderServices(
  db: Db,
  runId: string,
  updates: Array<{ providerOrderId: string; servicesJson: string }>,
): Promise<void> {
  for (let i = 0; i < updates.length; i += 200) {
    const chunk = updates.slice(i, i + 200);
    const statements = chunk.map((update) =>
      db
        .update(diagnosticOrders)
        .set({ servicesJson: update.servicesJson, servicesEnriched: 1 })
        .where(
          and(
            eq(diagnosticOrders.runId, runId),
            eq(diagnosticOrders.providerOrderId, update.providerOrderId),
          ),
        ),
    );
    if (statements.length > 0) {
      await db.batch(
        statements as unknown as [typeof statements[number], ...typeof statements[number][]],
      );
    }
  }
}

export async function countDiagnosticOrders(db: Db, runId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)` })
    .from(diagnosticOrders)
    .where(eq(diagnosticOrders.runId, runId))
    .limit(1);
  return Number(rows[0]?.n ?? 0);
}

export async function countPendingEnrichment(db: Db, runId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)` })
    .from(diagnosticOrders)
    .where(and(eq(diagnosticOrders.runId, runId), eq(diagnosticOrders.servicesEnriched, 0)))
    .limit(1);
  return Number(rows[0]?.n ?? 0);
}

export async function listDiagnosticOrders(db: Db, runId: string): Promise<DiagnosticOrderInsert[]> {
  const rows = await db
    .select()
    .from(diagnosticOrders)
    .where(eq(diagnosticOrders.runId, runId));
  return rows as DiagnosticOrderInsert[];
}

export async function clearDiagnosticOrders(db: Db, runId: string): Promise<void> {
  await db.delete(diagnosticOrders).where(eq(diagnosticOrders.runId, runId));
}

export async function logDiagnosticEvent(
  db: Db,
  runId: string,
  stage: string,
  message: string,
  level: "info" | "warn" | "error" = "info",
  now = Date.now(),
): Promise<void> {
  await db.insert(diagnosticEvents).values({
    id: crypto.randomUUID(),
    runId,
    stage,
    level,
    message: message.slice(0, 500),
    createdAt: now,
  });
}

export async function listDiagnosticEvents(db: Db, runId: string, limit = 20) {
  const rows = await db
    .select()
    .from(diagnosticEvents)
    .where(eq(diagnosticEvents.runId, runId))
    .orderBy(diagnosticEvents.createdAt)
    .limit(limit);
  return rows;
}

/** Mark a run failed while keeping the last stage for support. */
export async function failRun(
  db: Db,
  id: string,
  stage: string,
  message: string,
  now = Date.now(),
): Promise<void> {
  await updateRun(
    db,
    id,
    { status: "failed", stage, errorText: message.slice(0, 500) },
    now,
  );
  await logDiagnosticEvent(db, id, stage, message, "error", now);
}

export async function getActiveRunByOrder(db: Db, orderId: string) {
  const rows = await db
    .select()
    .from(diagnosticRuns)
    .where(and(eq(diagnosticRuns.oneTimeOrderId, orderId)))
    .limit(1);
  return rows[0] ?? null;
}

export function runProvider(run: DiagnosticRunRow): DiagnosticProvider | null {
  return run.provider === "spectora" || run.provider === "isn" ? run.provider : null;
}
