/**
 * Google Analytics 4 / Google Tag Manager tracking. The tag ID comes from the
 * public runtime config (Worker var GA_MEASUREMENT_ID) so it can change
 * without a client rebuild. When unset, every function below is a no-op and no
 * third-party request is made.
 *
 * Two ID forms are supported:
 * - `G-...`, `AW-...`, `DC-...`: loaded with gtag.js, pageviews use gtag config.
 * - `GTM-...`: loads the Tag Manager container and pushes `page_view` events
 *   to `dataLayer` for SPA navigation.
 *
 * Wiring: main.tsx calls initAnalytics() once and subscribes to the router for
 * SPA pageviews, so marketing, auth, and app pages are all tracked. Pageviews
 * recorded before the config resolves are queued and flushed once the ID is
 * known.
 */
import { loadRuntimeConfig } from "./runtime-config";

declare global {
  interface Window {
    dataLayer?: Array<unknown>;
    gtag?: (...args: unknown[]) => void;
    __growthsnipeGaInit?: boolean;
  }
}

let started = false;
let configResolved = false;
let measurementId = "";
let pendingPageviews: string[] = [];

/** Whether an ID is a Tag Manager container rather than a gtag destination. */
export function isGtmContainerId(id: string): boolean {
  return /^GTM-/i.test(id.trim());
}

/** Inject the Google tag once. Safe to call repeatedly; no-op without an ID. */
function injectTag(id: string): void {
  if (typeof document === "undefined") return;
  if (window.__growthsnipeGaInit) return;
  window.__growthsnipeGaInit = true;
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
  const gtm = isGtmContainerId(id);
  let src: string;
  if (gtm) {
    window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
    src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(id)}`;
  } else {
    window.gtag("js", new Date());
    window.gtag("config", id);
    src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  }
  const script = document.createElement("script");
  script.async = true;
  script.src = src;
  script.onerror = () => {
    console.warn("[analytics] tag script failed to load — check blockers and connectivity");
  };
  if (!gtm) {
    script.onload = () => {
      // Silent when healthy; warn only if the runtime never took over the
      // queue (hits would not send). gtag.js patches dataLayer; GTM does not
      // have to, so this probe is gtag-only.
      window.setTimeout(() => {
        const claimed =
          Array.isArray(window.dataLayer) && window.dataLayer.push !== Array.prototype.push;
        if (!claimed) {
          console.warn("[analytics] tag loaded but the queue was not claimed — hits will not send");
        }
      }, 1500);
    };
  }
  document.head.appendChild(script);
}

function sendPageview(path: string): void {
  if (!measurementId || typeof window === "undefined") return;
  if (isGtmContainerId(measurementId)) {
    // GTM triggers a page view on container load; this event covers SPA
    // navigations and is the hook a GTM Page View trigger listens for.
    window.dataLayer = window.dataLayer ?? [];
    window.dataLayer.push({ event: "page_view", page_path: path });
    return;
  }
  if (typeof window.gtag !== "function") return;
  window.gtag("config", measurementId, { page_path: path });
}

/**
 * Resolve the runtime tag ID, inject the tag once, and flush pageviews
 * recorded during startup.
 */
export function initAnalytics(): void {
  if (started) return;
  started = true;
  void loadRuntimeConfig().then((config) => {
    measurementId = config.gaMeasurementId;
    configResolved = true;
    if (!measurementId) {
      pendingPageviews = [];
      return;
    }
    injectTag(measurementId);
    const queued = pendingPageviews;
    pendingPageviews = [];
    for (const path of queued) sendPageview(path);
  });
}

/** Record an SPA pageview. No-op without an ID, or until startup resolves. */
export function trackPageview(path: string): void {
  if (typeof window === "undefined") return;
  if (!configResolved) {
    pendingPageviews.push(path);
    return;
  }
  sendPageview(path);
}
