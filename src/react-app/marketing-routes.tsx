import type { ComponentType } from "react";
import { Landing } from "./pages/marketing/Landing";
import { Blueprint } from "./pages/marketing/Blueprint";
import { Diagnostic } from "./pages/marketing/Diagnostic";
import { LoopLibrary } from "./pages/marketing/LoopLibrary";
import { Engine } from "./pages/marketing/Engine";
import { HowItWorks } from "./pages/marketing/HowItWorks";
import { SnipeSystem } from "./pages/marketing/SnipeSystem";
import { BlogIndex } from "./pages/marketing/BlogIndex";
import { BlogPost } from "./pages/marketing/BlogPost";
import { CaseStudies } from "./pages/marketing/CaseStudies";
import { Resources } from "./pages/marketing/Resources";
import { Privacy } from "./pages/marketing/Privacy";
import { Terms } from "./pages/marketing/Terms";
import { Contact } from "./pages/marketing/Contact";
import { About } from "./pages/marketing/About";
import { Book } from "./pages/marketing/Book";
import { LoopLibraryAccess } from "./pages/marketing/LoopLibraryAccess";
import { Unsubscribe } from "./pages/marketing/Unsubscribe";
import { Faq } from "./pages/marketing/Faq";
import { ResultsDisclaimer } from "./pages/marketing/ResultsDisclaimer";
import { CheckoutDiagnostic } from "./pages/checkout/CheckoutDiagnostic";
import { CheckoutBlueprint } from "./pages/checkout/CheckoutBlueprint";
import { ThankYouDiagnostic } from "./pages/checkout/ThankYouDiagnostic";
import { ThankYouBlueprint } from "./pages/checkout/ThankYouBlueprint";
import { ThankYouLoopLibrary } from "./pages/checkout/ThankYouLoopLibrary";
import { HomeInspectors } from "./pages/marketing/industries/HomeInspectors";
import { Hvac } from "./pages/marketing/industries/Hvac";
import { Plumbing } from "./pages/marketing/industries/Plumbing";
import { Electrical } from "./pages/marketing/industries/Electrical";
import { Roofing } from "./pages/marketing/industries/Roofing";
import { Contractors } from "./pages/marketing/industries/Contractors";
import { PaidAds } from "./pages/marketing/capabilities/PaidAds";
import { Crm } from "./pages/marketing/capabilities/Crm";
import { Intelligence } from "./pages/marketing/capabilities/Intelligence";
import { Voiceiq } from "./pages/marketing/capabilities/Voiceiq";

/**
 * Public marketing routes, shared by the browser router (App.tsx) and the
 * static prerender script. Auth/app/superadmin routes are intentionally
 * excluded — they are interactive or login-gated and stay SPA-only.
 *
 * Retired routes (/features, /integrations, /who-we-help, /pricing) redirect
 * in App.tsx and are not listed here.
 */
export interface MarketingRoute {
  path: string;
  Component: ComponentType;
}

export const MARKETING_ROUTES: MarketingRoute[] = [
  { path: "/", Component: Landing },
  { path: "/blueprint", Component: Blueprint },
  { path: "/diagnostic", Component: Diagnostic },
  { path: "/loop-library", Component: LoopLibrary },
  { path: "/engine", Component: Engine },
  { path: "/home-inspectors", Component: HomeInspectors },
  { path: "/hvac", Component: Hvac },
  { path: "/plumbing", Component: Plumbing },
  { path: "/electrical", Component: Electrical },
  { path: "/roofing", Component: Roofing },
  { path: "/contractors", Component: Contractors },
  { path: "/paid-ads", Component: PaidAds },
  { path: "/crm", Component: Crm },
  { path: "/intelligence", Component: Intelligence },
  { path: "/voiceiq", Component: Voiceiq },
  { path: "/how-it-works", Component: HowItWorks },
  { path: "/snipe-system", Component: SnipeSystem },
  { path: "/about", Component: About },
  { path: "/blog", Component: BlogIndex },
  { path: "/blog/:slug", Component: BlogPost },
  { path: "/case-studies", Component: CaseStudies },
  { path: "/resources", Component: Resources },
  { path: "/faq", Component: Faq },
  { path: "/privacy", Component: Privacy },
  { path: "/terms", Component: Terms },
  { path: "/results-disclaimer", Component: ResultsDisclaimer },
  { path: "/contact", Component: Contact },
  { path: "/book", Component: Book },
  { path: "/loop-library/access", Component: LoopLibraryAccess },
  { path: "/unsubscribe", Component: Unsubscribe },
  { path: "/checkout/diagnostic", Component: CheckoutDiagnostic },
  { path: "/checkout/blueprint", Component: CheckoutBlueprint },
  { path: "/thank-you/diagnostic", Component: ThankYouDiagnostic },
  { path: "/thank-you/blueprint", Component: ThankYouBlueprint },
  { path: "/thank-you/loop-library", Component: ThankYouLoopLibrary },
];
