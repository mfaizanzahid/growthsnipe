/**
 * Public runtime configuration fetched once per page load.
 *
 * The values live in Worker runtime vars (GA_MEASUREMENT_ID,
 * EMBED_APP_HTML, EMBED_MARKETING_HTML) and are served by
 * GET /api/runtime-config. They are public by design: analytics IDs and embed
 * snippets ship to every visitor. Never put a secret in them.
 */

export interface RuntimeConfig {
  gaMeasurementId: string;
  embedAppHtml: string | null;
  embedMarketingHtml: string | null;
}

export const EMPTY_RUNTIME_CONFIG: RuntimeConfig = {
  gaMeasurementId: "",
  embedAppHtml: null,
  embedMarketingHtml: null,
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function textOrNull(value: unknown): string | null {
  const trimmed = text(value);
  return trimmed ? trimmed : null;
}

/** Normalize an untyped API response without trusting its shape. */
export function parseRuntimeConfig(input: unknown): RuntimeConfig {
  if (!input || typeof input !== "object") return EMPTY_RUNTIME_CONFIG;
  const data = input as Record<string, unknown>;
  return {
    gaMeasurementId: text(data.ga_measurement_id),
    embedAppHtml: textOrNull(data.embed_app_html),
    embedMarketingHtml: textOrNull(data.embed_marketing_html),
  };
}

let cached: Promise<RuntimeConfig> | null = null;

/**
 * Load the runtime config, sharing one in-flight request across callers.
 * A failed request degrades to empty config (no analytics, no embeds) rather
 * than blocking the UI.
 */
export function loadRuntimeConfig(): Promise<RuntimeConfig> {
  if (cached) return cached;
  cached = fetch("/api/runtime-config", {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  })
    .then(async (response) => (response.ok ? parseRuntimeConfig(await response.json()) : EMPTY_RUNTIME_CONFIG))
    .catch(() => EMPTY_RUNTIME_CONFIG);
  return cached;
}
