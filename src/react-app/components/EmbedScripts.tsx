import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import {
  applyEmbedHtml,
  clearEmbedContainer,
  embedSnippetFor,
  ensureEmbedContainer,
  type EmbedSurface,
} from "../lib/embeds";
import { loadRuntimeConfig } from "../lib/runtime-config";

/**
 * Injects the operator-configured snippet for one surface as the last child of
 * <body> (the position a server-side "before </body>" injection would use).
 *
 * The snippet is a public runtime value (EMBED_*_HTML, served by
 * GET /api/runtime-config). It ships to every visitor of that surface, so it
 * must never contain a secret.
 */
export function EmbedScripts({ surface }: { surface: EmbedSurface }) {
  const { pathname } = useLocation();
  // Superadmin screens are out of scope for the app snippet: they are a
  // different audience (staff, not customers).
  const skip = surface === "app" && pathname.startsWith("/superadmin");

  useEffect(() => {
    if (skip || typeof window === "undefined") return;
    let cancelled = false;

    void loadRuntimeConfig().then((config) => {
      if (cancelled) return;
      const html = embedSnippetFor(surface, config);
      if (!html) return;
      if (window.__growthsnipeEmbeds?.[surface]) return;
      window.__growthsnipeEmbeds = { ...(window.__growthsnipeEmbeds ?? {}), [surface]: true };
      const container = ensureEmbedContainer(surface, document);
      applyEmbedHtml(html, document, container);
    });

    return () => {
      // Drop the container so an SPA navigation between surfaces does not
      // leave the other surface's widget on screen. This also clears the
      // once-per-page guard, so a later mount re-injects cleanly.
      cancelled = true;
      clearEmbedContainer(surface, document);
    };
  }, [surface, skip]);

  return null;
}
