import { createContext } from "react";

/**
 * True only while the static prerender script renders a page (never in the
 * browser — the default is false and no provider is mounted client-side).
 * Pages read this to swap JS-only states (loading skeletons) for
 * crawler-meaningful static copy in prerendered HTML.
 */
export const PrerenderContext = createContext(false);
