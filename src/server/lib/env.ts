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
