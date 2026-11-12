import { Hono } from "hono";
import type { Env } from "../types";

/**
 * Public runtime configuration consumed by the browser at startup.
 *
 * These values are public by design: the GA measurement ID and embed snippets
 * ship to every visitor and are visible in page source. They live in Worker
 * runtime vars (wrangler.jsonc) so they can change without rebuilding the
 * client. Never put a secret in any of them.
 */
export const RUNTIME_CONFIG_MAX_EMBED_BYTES = 64 * 1024;

export interface RuntimeConfig {
  ga_measurement_id: string;
  embed_app_html: string | null;
  embed_marketing_html: string | null;
}

function trimOrEmpty(value: string | undefined): string {
  return (value ?? "").trim();
}

/** Trim a snippet and treat blank or oversized values as unset. */
export function normalizeEmbedHtml(value: string | undefined): string | null {
  const trimmed = trimOrEmpty(value);
  if (!trimmed) return null;
  // A truncated script is a broken script; none is safer than half an embed.
  if (trimmed.length > RUNTIME_CONFIG_MAX_EMBED_BYTES) return null;
  return trimmed;
}

export function runtimeConfigFromEnv(env: Partial<Env>): RuntimeConfig {
  return {
    ga_measurement_id: trimOrEmpty(env.GA_MEASUREMENT_ID),
    embed_app_html: normalizeEmbedHtml(env.EMBED_APP_HTML),
    embed_marketing_html: normalizeEmbedHtml(env.EMBED_MARKETING_HTML),
  };
}

export const runtimeConfigRoutes = new Hono<{ Bindings: Env }>();

runtimeConfigRoutes.get("/api/runtime-config", (c) => {
  c.header("Cache-Control", "public, max-age=60");
  return c.json(runtimeConfigFromEnv(c.env ?? {}));
});
