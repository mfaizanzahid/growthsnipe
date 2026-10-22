import type { ComponentType } from "react";
import { Landing } from "./pages/marketing/Landing";
import { Features } from "./pages/marketing/Features";
import { HowItWorks } from "./pages/marketing/HowItWorks";
import { Advisors } from "./pages/marketing/Advisors";
import { Integrations } from "./pages/marketing/Integrations";
import { IntegrationPage } from "./pages/marketing/IntegrationPage";
import { Technology } from "./pages/marketing/Technology";
import { Associations } from "./pages/marketing/Associations";
import { WhoWeHelp } from "./pages/marketing/WhoWeHelp";
import { TradePage } from "./pages/marketing/TradePage";
import { BlogIndex } from "./pages/marketing/BlogIndex";
import { BlogPost } from "./pages/marketing/BlogPost";
import { Pricing } from "./pages/marketing/Pricing";
import { Privacy } from "./pages/marketing/Privacy";
import { Terms } from "./pages/marketing/Terms";
import { Contact } from "./pages/marketing/Contact";
import { Security } from "./pages/marketing/Security";
import { About } from "./pages/marketing/About";

/**
 * Public marketing routes, shared by the browser router (App.tsx) and the
 * static prerender script. Auth/app/superadmin routes are intentionally
 * excluded — they are interactive or login-gated and stay SPA-only.
 */
export interface MarketingRoute {
  path: string;
  Component: ComponentType;
}

export const MARKETING_ROUTES: MarketingRoute[] = [
  { path: "/", Component: Landing },
  { path: "/features", Component: Features },
  { path: "/how-it-works", Component: HowItWorks },
  { path: "/advisors", Component: Advisors },
  { path: "/integrations", Component: Integrations },
  { path: "/integrations/:platform", Component: IntegrationPage },
  { path: "/technology", Component: Technology },
  { path: "/associations", Component: Associations },
  { path: "/who-we-help", Component: WhoWeHelp },
  { path: "/who-we-help/:trade", Component: TradePage },
  { path: "/security", Component: Security },
  { path: "/about", Component: About },
  { path: "/blog", Component: BlogIndex },
  { path: "/blog/:slug", Component: BlogPost },
  { path: "/pricing", Component: Pricing },
  { path: "/privacy", Component: Privacy },
  { path: "/terms", Component: Terms },
  { path: "/contact", Component: Contact },
];
