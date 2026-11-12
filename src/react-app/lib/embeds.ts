/**
 * Operator-configured embed snippets (chat widgets, trackers, ...).
 *
 * The snippets are public runtime values (Worker vars EMBED_APP_HTML /
 * EMBED_MARKETING_HTML) fetched from GET /api/runtime-config, so they can
 * change without a client rebuild. They are injected client-side, as the last
 * child of <body> — the position a server-side "before </body>" injection would
 * produce. The Worker never serves the app HTML (Cloudflare Static Assets do),
 * so this is the only available seam.
 *
 * Two rules make this safe to operate:
 * 1. The snippet is PUBLIC. It ships to every visitor and is visible in page
 *    source. Never put a secret in it, and never let a tenant set it.
 * 2. Injection happens once per surface per page load. React StrictMode
 *    double-invokes effects in dev, and a second load of a chat widget script
 *    renders a duplicate widget.
 */
import type { RuntimeConfig } from "./runtime-config";

export const EMBED_SURFACES = ["marketing", "app"] as const;

export type EmbedSurface = (typeof EMBED_SURFACES)[number];

export interface EmbedScript {
  /** Attribute map exactly as written in the snippet (boolean attrs get ""). */
  attrs: Record<string, string>;
  /** Inline script body, empty for external scripts. */
  code: string;
}

export interface SplitEmbedHtml {
  scripts: EmbedScript[];
  /** Everything that is not a <script> tag, in source order. */
  markup: string;
}

const SCRIPT_RE = /<script\b([^>]*?)(?:\/>|>([\s\S]*?)<\/script\s*>)/gi;
const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

/** Parse the attributes of a single tag into a plain map. */
export function parseEmbedAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  ATTR_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTR_RE.exec(raw)) !== null) {
    const name = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    attrs[name] = value;
  }
  return attrs;
}

/**
 * Split a snippet into its <script> tags and the remaining markup.
 *
 * Pure string work on purpose: it is the part worth unit-testing, and this
 * repo has no DOM test environment installed.
 */
export function splitEmbedHtml(html: string): SplitEmbedHtml {
  const scripts: EmbedScript[] = [];
  const markup = html.replace(SCRIPT_RE, (_full, attrRaw: string, body?: string) => {
    scripts.push({ attrs: parseEmbedAttrs(attrRaw ?? ""), code: body ?? "" });
    return "";
  });
  return { scripts, markup };
}

/**
 * Append a snippet to `target`.
 *
 * Scripts are RECREATED with document.createElement instead of being inserted
 * as markup: script elements added via innerHTML (or parsed by DOMParser) are
 * inert and never run. Recreating them keeps them executable and keeps
 * `document.currentScript` working, which several widgets read to find their
 * own script URL.
 */
export function applyEmbedHtml(html: string, doc: Document, target: HTMLElement): void {
  const { scripts, markup } = splitEmbedHtml(html);
  if (markup.trim()) target.insertAdjacentHTML("beforeend", markup);
  for (const script of scripts) {
    const el = doc.createElement("script");
    for (const [name, value] of Object.entries(script.attrs)) el.setAttribute(name, value);
    if (script.code) el.textContent = script.code;
    target.appendChild(el);
  }
}

declare global {
  interface Window {
    __growthsnipeEmbeds?: Record<string, boolean>;
  }
}

const containerId = (surface: EmbedSurface) => `tm-embed-${surface}`;

/** The snippet container, created on demand as the last child of <body>. */
export function ensureEmbedContainer(surface: EmbedSurface, doc: Document): HTMLElement {
  const existing = doc.getElementById(containerId(surface));
  if (existing) return existing;
  const el = doc.createElement("div");
  el.id = containerId(surface);
  el.setAttribute("data-tm-embed", surface);
  doc.body.appendChild(el);
  return el;
}

/** Remove a surface's container and clear its once-per-page guard. */
export function clearEmbedContainer(surface: EmbedSurface, doc: Document): void {
  doc.getElementById(containerId(surface))?.remove();
  if (typeof window !== "undefined" && window.__growthsnipeEmbeds) {
    delete window.__growthsnipeEmbeds[surface];
  }
}

/**
 * The snippet for one surface from the public runtime config.
 *
 * An empty value means "no snippet for this surface". The server already
 * treats blank and oversized values as unset; this trims defensively.
 */
export function embedSnippetFor(surface: EmbedSurface, config: RuntimeConfig): string | null {
  const raw = surface === "marketing" ? config.embedMarketingHtml : config.embedAppHtml;
  const value = raw?.trim() ?? "";
  return value ? value : null;
}


