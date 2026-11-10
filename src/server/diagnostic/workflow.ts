import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import type { Env } from "../lib/env";
import { createDb } from "../repositories/db";
import { processDiagnosticRun } from "./report";
import { getRunById } from "./store";

export interface DiagnosticWorkflowParams {
  runId: string;
}

/**
 * Durable execution for one Diagnostic run. Collection, analysis, model
 * synthesis, and email all live inside a single idempotent step: the temp
 * order rows are replaced on retry, and an already-ready run is left alone.
 */
export class DiagnosticWorkflow extends WorkflowEntrypoint<Env, DiagnosticWorkflowParams> {
  async run(event: WorkflowEvent<DiagnosticWorkflowParams>, step: WorkflowStep): Promise<unknown> {
    const runId = event.payload?.runId;
    if (typeof runId !== "string" || runId === "") {
      throw new NonRetryableError("DiagnosticWorkflow: missing runId params");
    }
    const db = createDb(this.env.DB);
    return step.do(
      "process",
      {
        retries: { limit: 2, delay: "60 seconds", backoff: "exponential" },
        timeout: "30 minutes",
      },
      async () => {
        await processDiagnosticRun(this.env, db, runId);
        const run = await getRunById(db, runId);
        return { status: run?.status ?? "unknown", stage: run?.stage ?? null };
      },
    );
  }
}
