import { z } from "zod";
import type { Env as BaseEnv } from "../types";

// Merged Env: billing template base + Sidekick V1 additions.
// Sidekick fields are optional so existing billing tests and routes keep
// working; MCP/scheduler paths validate their own keys at runtime.
export interface Env extends BaseEnv {
  MCP_BASE_URL?: string;
  MCP_TOKEN_PEPPER?: string;
  MCP_ENCRYPTION_KEY?: string;
  AI_PROVIDER?: string;
  AI_MODEL?: string;
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  BRIEFING_FROM_EMAIL?: string;
  DEFAULT_TIMEZONE?: string;
  /**
   * Page-fetch budget for ONE briefing analysis window. Only lower this if a
   * deployment is hitting a real platform limit; see lib/retrieval-limits.ts.
   */
  BRIEFING_MAX_PAGES?: string;
  /**
   * Memory backstop for one ISN read. ISN returns whole collections with no
   * paging, so this caps what a single read retains; see lib/retrieval-limits.ts.
   */
  ISN_SAFETY_LIMIT?: string;
  /**
   * Per-order detail reads per sync run for ISN service enrichment
   * (no bulk endpoint exists). Default 1000; raise to fill histories faster
   * at the cost of more vendor requests per run, lower to be gentler.
   */
  ANALYTICS_ENRICH_PER_RUN?: string;
  /**
   * Concurrent detail reads during enrichment. Default 24 (capped at 32);
   * ISN is not rate limited but asks for considerate polling.
   */
  ANALYTICS_ENRICH_CONCURRENCY?: string;
  /**
   * Dev-only manual cron tick (`POST /api/dev/cron-tick`). `vite dev` never
   * dispatches cron events, so this flag (set to "1" in `.dev.vars`, never
   * in production) exposes the scheduled handler over HTTP for local
   * verification. Runs the exact same job set as the minutely trigger.
   */
  DEV_CRON_TRIGGER?: string;
  /** Sync Workflow entrypoint binding (workflows in wrangler.jsonc). */
  SYNC_WORKFLOW?: SyncWorkflowBinding;
  /**
   * Route per-org sync through durable Workflow links + enrichment fan-out
   * instead of the inline loop ("1"). Default off: cron-inline stays the
   * path until this is deliberately enabled per environment.
   */
  ANALYTICS_SYNC_VIA_WORKFLOW?: string;
  /** Orders per enrichment leaf (default 45, max 45: the 50-subrequest cap). */
  SYNC_WORKFLOW_CHUNK?: string;
  /** Leaf instances per fan-out wave (default 50, max 50: well under the
   * 100-concurrent free cap with margin for queued overflow). */
  SYNC_WORKFLOW_FANOUT?: string;
  /** Vendor detail reads inside one leaf (default 4, max 8: leaves already
   * run 50-way parallel, so per-leaf concurrency stays low). */
  SYNC_WORKFLOW_CHILD_CONCURRENCY?: string;
  /** Parent pacing sleep between waves, seconds (default 60: must exceed
   * worst-case leaf latency or waves re-claim in-flight rows, max 3600). */
  SYNC_WORKFLOW_PACE_SECONDS?: string;
}

/** Minimal Workflow binding surface used by triggers and tasks. */
export interface SyncWorkflowInstanceHandle {
  id: string;
  status(): Promise<{
    status: string;
    error?: unknown;
  }>;
  delete(): Promise<void>;
  terminate(): Promise<void>;
}

export interface SyncWorkflowBinding {
  create(options: { id?: string; params?: unknown }): Promise<SyncWorkflowInstanceHandle>;
  createBatch(batch: Array<{ id?: string; params?: unknown }>): Promise<SyncWorkflowInstanceHandle[]>;
  get(id: string): Promise<SyncWorkflowInstanceHandle>;
}

const envSchema = z.object({
  SAFEPAY_ENV: z.enum(["sandbox", "live"]),
  SAFEPAY_API_BASE: z.string().url(),
});

export function assertProviderEnv(env: Env): void {
  envSchema.parse(env);
}

export function assertSidekickEnv(env: Env): void {
  if (!env.DB) throw new Error("DB binding is required");
  if (!env.MCP_ENCRYPTION_KEY) throw new Error("MCP_ENCRYPTION_KEY is required");
}
