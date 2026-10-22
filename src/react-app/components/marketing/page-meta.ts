/**
 * Static per-page title + meta description map for marketing routes.
 * Param routes (/blog/:slug) set their own meta from page data.
 */
export const PAGE_META: Record<string, { title: string; description: string }> = {
  "/": {
    title: "GrowthSnipe | Growth, with the math done",
    description:
      "GrowthSnipe finds the revenue leak in your home-service business, fixes it, and shows you the booked jobs. SNIPE Intelligence™ analytics and SNIPE VoiceIQ™ call auditing.",
  },
  "/features": {
    title: "Features: Scorecard, VoiceIQ, and Paid Media | GrowthSnipe",
    description:
      "One weekly scorecard, call scoring, and paid media judged on cost per booked inspection. See what SNIPE Intelligence™ and SNIPE VoiceIQ™ measure.",
  },
  "/how-it-works": {
    title: "How It Works: Live in 21 Days | GrowthSnipe",
    description:
      "Connect your systems, rebuild the booking path, launch capture and campaigns, then optimize against one scorecard. The 21-day GrowthSnipe runway.",
  },
  "/integrations": {
    title: "Integrations: We Work Inside Your Stack | GrowthSnipe",
    description:
      "GrowthSnipe works with Spectora, ISN, ServiceTitan, Housecall Pro, Jobber, GoHighLevel, Google, and Meta. Nothing migrates.",
  },
  "/about": {
    title: "About GrowthSnipe | Plan Plus Operator",
    description:
      "Why GrowthSnipe starts with the leak: a productized growth company that sizes the gap, builds the system, and stays to run it.",
  },
  "/pricing": {
    title: "Pricing: SNIPE Intelligence™ and Engine Plans | GrowthSnipe",
    description:
      "Start SNIPE Intelligence™ free for 30 days, no card required. Compare the offer ladder and Engine Core and Command engagements.",
  },
  "/who-we-help": {
    title: "Who We Help: Home-Service Owners | GrowthSnipe",
    description:
      "Built for owner-operated home-service businesses, starting with home inspectors on Spectora and ISN, then HVAC, plumbing, electrical, and roofing.",
  },
  "/case-studies": {
    title: "Case Studies: What the Work Looks Like | GrowthSnipe",
    description:
      "Illustrative GrowthSnipe engagements: missed calls, flat average ticket, and paid media without a cost per booked job.",
  },
  "/blog": {
    title: "Blog: Straight Talk for Home-Service Owners | GrowthSnipe",
    description:
      "No hype, no jargon. Practical notes on missed calls, average ticket, paid media, and the numbers that decide a home-service month.",
  },
  "/contact": {
    title: "Contact GrowthSnipe",
    description:
      "Book a discovery call, ask for a Revenue Leak Scorecard, or ask about Engine Core and Engine Command.",
  },
  "/privacy": {
    title: "Privacy Policy | GrowthSnipe",
    description: "How GrowthSnipe handles business data, account connections, and billing information.",
  },
  "/terms": {
    title: "Terms of Service | GrowthSnipe",
    description: "The terms for using GrowthSnipe: plans and trials, acceptable use, and billing.",
  },
};
