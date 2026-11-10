import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import type { Env } from "../lib/env";
import { createDb } from "../repositories/db";
import {
  enrichDiagnosticRunBatch,
  finalizeDiagnosticRun,
  prepareDiagnosticRun,
} from "./report";
import { claimDiagnosticOrdersForEnrichment, getRunById } from "./store";

export interface DiagnosticWorkflowParams {
  runId: string;
}

/**
 * Durable execution for one Diagnostic run.
 *
 * The listing is fetched once, then ISN fee enrichment runs in bounded batches
 * of 40 orders per step. Each step gets a fresh subrequest budget, which is why
 * the full 12 months can be enriched without hitting the per-invocation cap.
 * Everything is idempotent: temp rows are replaced by prepare, enrichment
 * claims only unenriched rows, and a ready run is left alone.
 */
export class DiagnosticWorkflow extends WorkflowEntrypoint<Env, DiagnosticWorkflowParams> {
  async run(event: WorkflowEvent<DiagnosticWorkflowParams>, step: WorkflowStep): Promise<unknown> {
    const runId = event.payload?.runId;
    if (typeof runId !== "string" || runId === "") {
      throw new NonRetryableError("DiagnosticWorkflow: missing runId params");
    }
    const db = createDb(this.env.DB);

    const prepared = await step.do(
      "prepare",
      {
        retries: { limit: 2, delay: "30 seconds", backoff: "exponential" },
        timeout: "15 minutes",
      },
      () => prepareDiagnosticRun(this.env, db, runId),
    );

    let enriched = 0;
    if (prepared.pendingEnrichment) {
      // 400 waves of 40 covers 16,000 orders, well above any 12-month tenant.
      for (let wave = 0; wave < 400; wave += 1) {
        const ids = await step.do(
          `claim-${wave}`,
          {
            retries: { limit: 2, delay: "10 seconds", backoff: "exponential" },
            timeout: "2 minutes",
          },
          () => claimDiagnosticOrdersForEnrichment(db, runId, 40),
        );
        if (ids.length === 0) break;
        enriched += await step.do(
          `enrich-${wave}`,
          {
            retries: { limit: 3, delay: "30 seconds", backoff: "exponential" },
            timeout: "10 minutes",
          },
          () => enrichDiagnosticRunBatch(this.env, db, runId, ids),
        );
      }
    }

    return step.do(
      "finalize",
      {
        retries: { limit: 2, delay: "60 seconds", backoff: "exponential" },
        timeout: "20 minutes",
      },
      async () => {
        await finalizeDiagnosticRun(this.env, db, runId);
        const run = await getRunById(db, runId);
        return { status: run?.status ?? "unknown", stage: run?.stage ?? null, enriched };
      },
    );
  }
}
