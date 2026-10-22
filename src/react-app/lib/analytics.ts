/**
 * Google Analytics (gtag.js) tracking. The measurement ID comes from the
 * `VITE_GA_MEASUREMENT_ID` build-time env variable — when unset, every
 * function below is a no-op and no third-party request is made.
 *
 * Wiring: main.tsx calls initAnalytics() once and subscribes to the router
 * for SPA pageviews, so marketing, auth, and app pages are all tracked.
 */
declare global {
  interface Window {
    dataLayer?: Array<unknown>;
    gtag?: (...args: unknown[]) => void;
    __tradesmaticGaInit?: boolean;
  }
}

export function gaMeasurementId(): string {
  return (import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined)?.trim() ?? "";
}

/** Inject gtag.js once. Safe to call repeatedly; no-op without an ID. */
export function initAnalytics(): void {
  const id = gaMeasurementId();
  if (!id || typeof document === "undefined") return;
  if (window.__tradesmaticGaInit) return;
  window.__tradesmaticGaInit = true;
  window.dataLayer = window.dataLayer ?? [];
  // NOTE: push the `arguments` object exactly like Google's snippet — the
  // tag runtime silently drops queue entries pushed as real arrays (proven
  // by headless A/B probes: identical init with `...args` arrays never
  // fires, `arguments` objects fire). Do not "modernize" this.
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  // Declare the default explicitly instead of relying on gtag's implicit
  // grant: unspecified consent state is version/region-dependent, and an
  // undeclared default is the one remaining unverified link when hits
  // silently never fire. Matches the disclosed behavior (Privacy §3).
  window.gtag("consent", "default", {
    ad_storage: "granted",
    analytics_storage: "granted",
    ad_user_data: "granted",
    ad_personalization: "granted",
  });
  window.gtag("js", new Date());
  window.gtag("config", id);
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  script.onerror = () => {
    console.warn("[analytics] tag script failed to load — check blockers and connectivity");
  };
  script.onload = () => {
    // Silent when healthy; warn only if the runtime never took over the
    // queue (hits would not send).
    window.setTimeout(() => {
      const claimed =
        Array.isArray(window.dataLayer) && window.dataLayer.push !== Array.prototype.push;
      if (!claimed) {
        console.warn("[analytics] tag loaded but the queue was not claimed — hits will not send");
      }
    }, 1500);
  };
  document.head.appendChild(script);
}

/** Record an SPA pageview. No-op without an ID (or before init). */
export function trackPageview(path: string): void {
  const id = gaMeasurementId();
  if (!id || typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("config", id, { page_path: path });
}
