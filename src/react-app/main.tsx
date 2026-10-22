import React from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import "./styles.css";
import "@sfpy/atoms/styles";
import { App, router } from "./App";
import { initAnalytics, trackPageview } from "./lib/analytics";

const rootEl = document.getElementById("root")!;
const tree = (
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Analytics: load gtag once (no-op without VITE_GA_MEASUREMENT_ID) and
// record every SPA navigation, including the initial load.
initAnalytics();
trackPageview(window.location.pathname);
router.subscribe((state) => {
  trackPageview(state.location.pathname);
});

/**
 * Marketing routes ship prerendered HTML (see scripts/prerender-entry.tsx,
 * stamped with data-prerender-path). Hydrate only when the static content
 * matches the live URL; otherwise (dashboard/auth/unknown URLs served the
 * homepage fallback shell, plain dev shells) mount fresh so users never see
 * a flash of the wrong page or hydration-mismatch errors.
 */
function samePath(a: string, b: string): boolean {
  const norm = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p);
  return norm(a) === norm(b);
}

const prerenderedPath = rootEl.dataset.prerenderPath;
if (prerenderedPath && samePath(prerenderedPath, window.location.pathname)) {
  hydrateRoot(rootEl, tree);
} else {
  if (rootEl.hasChildNodes()) rootEl.innerHTML = "";
  createRoot(rootEl).render(tree);
}
