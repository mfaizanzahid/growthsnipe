import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import type { Env } from "../lib/env";
import type { Db } from "../repositories/db";
import { createDb } from "../repositories/db";
import {
  ENRICH_CLAIM_CAP,
  TerminalSyncError,
  buildOrgAdapter,
  enrichRunTag,
  ensureEnrichmentParent,
  getOrCreateInstance,
  isQuotaError,
  jitterMs,
  listingLinkId,
  msUntilUtcMidnight,
  runEnrichParentCycle,
  runListingLinkBody,
  workflowChildConcurrency,
  workflowChunkSize,
  workflowFanout,
  workflowPaceSeconds,
} from "./sync-tasks";
import { deriveNextListingLink, fetchEnrichBatch, writeEnrichBatch } from "./sync";

/**
 * Sync Workflow entrypoint (runtime shell only — all logic lives in
 * node-safe sync-tasks.ts and is unit-tested there). Roles arrive via
 * params: listing links walk one backfill window and chain, the enrich
 * parent fans out leaf batches in paced cycles, leaves enrich up to CHUNK
 * orders each. TerminalSyncError from any task becomes NonRetryableError
 * (no retries for auth/config faults); everything else retries per step
 * config. Step results stay tiny JSON (counts only); D1 is the cursor.
 *
 * There is no head-link role: hourly heads for drained-live workspaces run
 * cron-inline (step-free), so instances only ever do burst work.
 */

export interface SyncWorkflowParams {
  kind: "listing-link" | "enrich-parent" | "enrich-leaf";
  orgId: string;
  backIndex?: number;
  orderIds?: string[];
  index?: number;
}

export class SyncWorkflow extends WorkflowEntrypoint<Env, SyncWorkflowParams> {
  async run(event: WorkflowEvent<SyncWorkflowParams>, step: WorkflowStep): Promise<unknown> {
    const params = event.payload;
    if (!params || typeof params.orgId !== "string") {
      throw new NonRetryableError("SyncWorkflow: missing orgId params");
    }
    try {
      switch (params.kind) {
        case "listing-link":
          return await this.runListingLink(step, params.orgId, params.backIndex ?? 0);
        case "enrich-parent":
          return await this.runEnrichParent(step, params.orgId);
        case "enrich-leaf":
          return await this.runEnrichLeaf(step, params.orgId, params.orderIds ?? [], params.index ?? 0);
        default:
          throw new NonRetryableError(`SyncWorkflow: unknown kind ${(params as { kind?: unknown }).kind}`);
      }
    } catch (err) {
      if (err instanceof TerminalSyncError) throw new NonRetryableError(err.message);
      throw err;
    }
  }

  private db(): Db {
    return createDb(this.env.DB);
  }

  private binding() {
    const binding = this.env.SYNC_WORKFLOW;
    if (!binding) throw new NonRetryableError("SyncWorkflow: SYNC_WORKFLOW binding missing");
    return binding;
  }

  private async runListingLink(step: WorkflowStep, orgId: string, backIndex: number) {
    const db = this.db();
    // Step results must stay JSON-serializable: the adapter (functions)
    // never crosses a step boundary, so every step rebuilds it cheaply.
    const loaded = await step.do(
      "load",
      { retries: { limit: 2, delay: "10 seconds", backoff: "exponential" }, timeout: "2 minutes" },
      async () => {
        const org = await buildOrgAdapter(this.env, db, orgId);
        return { provider: org?.provider ?? null };
      },
    );
    if (!loaded.provider) return { finished: true, reason: "no-connection", backIndex };
    const provider = loaded.provider;
    const outcome = await step.do(
      "chunk",
      { retries: { limit: 3, delay: "30 seconds", backoff: "exponential" }, timeout: "15 minutes" },
      () => runListingLinkBody(this.env, db, orgId, Date.now()),
    );
    return step.do(
      "chain",
      { retries: { limit: 2, delay: "10 seconds", backoff: "exponential" }, timeout: "2 minutes" },
      async () => {
        // A finished walk starts enrichment immediately (not on the next
        // supervisor tick): the parent fans out from whatever is bare, and
        // the supervisor stays a backstop for crashed or deleted parents.
        // No-op when there is no backlog.
        if (outcome.finished) {
          await ensureEnrichmentParent(this.binding(), db, orgId, provider, Date.now());
          return { finished: true, backIndex };
        }
        // Self-perpetuating serial walk: derive the next index fresh so a
        // retried link can never skip or repeat work beyond idempotent
        // re-fetching. Deterministic ids make duplicate creation safe.
        const next = await deriveNextListingLink(db, orgId, Date.now());
        if (next.action === "finish") {
          await ensureEnrichmentParent(this.binding(), db, orgId, provider, Date.now());
          return { finished: true, backIndex };
        }
        await getOrCreateInstance(this.binding(), listingLinkId(orgId, next.backIndex), {
          kind: "listing-link",
          orgId,
          backIndex: next.backIndex,
        });
        return { finished: false, backIndex };
      },
    );
  }

  private async runEnrichParent(step: WorkflowStep, orgId: string) {
    const db = this.db();
    const loaded = await step.do(
      "load",
      { retries: { limit: 2, delay: "10 seconds", backoff: "exponential" }, timeout: "2 minutes" },
      async () => {
        const org = await buildOrgAdapter(this.env, db, orgId);
        // Run tag recorded once: every fan-out cycle of this parent run
        // derives leaf ids from it, so retries never collide with earlier
        // cycles' completed instances.
        return { provider: org?.provider ?? null, runTag: enrichRunTag(Date.now()) };
      },
    );
    if (!loaded.provider || loaded.provider !== "isn") return { spawned: 0, total: 0, done: true };
    const provider = loaded.provider;
    const runTag = loaded.runTag;
    const paceSeconds = workflowPaceSeconds(this.env);
    let spawned = 0;
    let total = 0;
    // Bounded cycles per parent (each cycle is claim-spawn plus an optional
    // pace sleep): a second parent picks up any remainder via the dated
    // ensure. 200 cycles cover 400k orders, far beyond any real backlog, and
    // stay far under the 1,024-steps-per-workflow free cap.
    for (let cycle = 0; cycle < 200; cycle += 1) {
      const wave = await step.do(
        `claim-spawn-${cycle}`,
        { retries: { limit: 3, delay: "30 seconds", backoff: "exponential" }, timeout: "15 minutes" },
        () =>
          runEnrichParentCycle(
            this.binding(),
            db,
            orgId,
            provider,
            workflowChunkSize(this.env),
            ENRICH_CLAIM_CAP,
            workflowFanout(this.env),
            runTag,
            cycle,
          ),
      );
      spawned += wave.leaves.length;
      total += wave.claimed;
      if (wave.done) return { spawned, total, done: true };
      if (paceSeconds > 0) {
        await step.sleep(`pace-${cycle}`, `${paceSeconds} seconds`);
      }
    }
    return { spawned, total, done: false, capped: true };
  }

  private async runEnrichLeaf(step: WorkflowStep, orgId: string, orderIds: string[], index: number) {
    const db = this.db();
    const conc = workflowChildConcurrency(this.env);
    const delayMs = jitterMs(index);
    if (delayMs > 0) {
      await step.sleep("start-delay", `${Math.ceil(delayMs / 1000)} seconds`);
    }
    const fetched = await step.do(
      "fetch",
      { retries: { limit: 3, delay: "30 seconds", backoff: "exponential" }, timeout: "15 minutes" },
      async () => {
        const org = await buildOrgAdapter(this.env, db, orgId);
        if (!org) return { results: [], failed: 0, firstError: null as string | null };
        return fetchEnrichBatch(org.adapter, orgId, orderIds, conc);
      },
    );
    try {
      const written = await step.do(
        "write",
        { retries: { limit: 3, delay: "30 seconds", backoff: "exponential" }, timeout: "15 minutes" },
        () => writeEnrichBatch(db, orgId, fetched.results),
      );
      return { done: written.done, failed: fetched.failed, attempted: orderIds.length };
    } catch (err) {
      if (isQuotaError(err)) {
        // Daily D1 budget hit: sleep to 00:05 UTC, then one more attempt.
        // Beyond that the error stands (visible) and the next drain retries.
        await step.sleep("quota-wait", `${Math.max(1, Math.ceil(msUntilUtcMidnight(Date.now()) / 60000))} minutes`);
        const written = await step.do(
          "write-retry",
          { retries: { limit: 1, delay: "60 seconds", backoff: "constant" }, timeout: "15 minutes" },
          () => writeEnrichBatch(db, orgId, fetched.results),
        );
        return { done: written.done, failed: fetched.failed, attempted: orderIds.length };
      }
      throw err;
    }
  }
}
