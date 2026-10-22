import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import {
  applyEmbedHtml,
  clearEmbedContainer,
  embedSnippetFor,
  ensureEmbedContainer,
  type EmbedSurface,
} from "../lib/embeds";

/**
 * Injects the operator-configured snippet for one surface as the last child of
 * <body> (the position a server-side "before </body>" injection would use).
 *
 * The snippet is a public build-time value (VITE_EMBED_*_HTML), inlined into
 * the client bundle. It ships to every visitor of that surface and is visible
 * in the downloaded bundle, so it must never contain a secret.
 */
export function EmbedScripts({ surface }: { surface: EmbedSurface }) {
  const { pathname } = useLocation();
  // Superadmin screens are out of scope for the app snippet: they are a
  // different audience (staff, not customers).
  const skip = surface === "app" && pathname.startsWith("/superadmin");

  useEffect(() => {
    if (skip || typeof window === "undefined") return;
    const html = embedSnippetFor(surface);
    if (!html) return;
    if (window.__tradesmaticEmbeds?.[surface]) return;
    window.__tradesmaticEmbeds = { ...(window.__tradesmaticEmbeds ?? {}), [surface]: true };
    const container = ensureEmbedContainer(surface, document);
    applyEmbedHtml(html, document, container);

    return () => {
      // Drop the container so an SPA navigation between surfaces does not
      // leave the other surface's widget on screen. This also clears the
      // once-per-page guard, so a later mount re-injects cleanly.
      clearEmbedContainer(surface, document);
    };
  }, [surface, skip]);

  return null;
}
