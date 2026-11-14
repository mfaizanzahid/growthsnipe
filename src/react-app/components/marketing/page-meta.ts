/**
 * Static per-page title + meta description map for marketing routes.
 * Param routes (/blog/:slug) set their own meta from page data.
 */
export const PAGE_META: Record<string, { title: string; description: string }> = {
  "/": {
    title: "GrowthSnipe | Plan-to-Booked Growth for Home-Service Companies",
    description:
      "More than leads. GrowthSnipe builds and runs the plan, marketing systems, call handling and follow-up that turn demand into booked home-service jobs.",
  },
  "/blueprint": {
    title: "SNIPE Blueprint™ | Your 12-Month Home-Service Growth Plan",
    description:
      "Get a personalized 12-month growth plan built around your business numbers, pricing, capacity, marketing channels and customer journey.",
  },
  "/diagnostic": {
    title: "SNIPE Diagnostic™ | Find the Leaks in Your Home-Service Business",
    description:
      "Get a 12-month performance review, quantified Leak Map and 30-minute review call to identify where your home-service growth process is losing opportunities.",
  },
  "/loop-library": {
    title: "SNIPE Loops™ | Home-Service Follow-Up & Automation Recipes",
    description:
      "Get free follow-up scripts, automation recipes and customer lifecycle workflows for home inspectors, HVAC, plumbing, electrical, roofing and contractors.",
  },
  "/engine": {
    title: "SNIPE Engine™ | Managed Growth Marketing & Operations for Home Services",
    description:
      "Choose SNIPE Engine™ for a connected growth system covering paid acquisition, CRM, call handling, follow-up, revenue loops and analytics. Priced privately.",
  },
  "/home-inspectors": {
    title: "Home Inspection Marketing & Growth Systems | GrowthSnipe",
    description:
      "Grow your home inspection business with agent-partner development, better booking capture, inspection add-ons, customer follow-up and performance intelligence.",
  },
  "/hvac": {
    title: "HVAC Marketing & Growth Systems | GrowthSnipe",
    description:
      "Turn HVAC enquiries, service calls, estimates and maintenance opportunities into a more connected growth and follow-up system.",
  },
  "/plumbing": {
    title: "Plumbing Marketing & Growth Systems | GrowthSnipe",
    description:
      "Improve plumbing lead capture, call handling, estimate follow-up, service packaging and repeat customer growth with GrowthSnipe.",
  },
  "/electrical": {
    title: "Electrical Contractor Marketing & Growth Systems | GrowthSnipe",
    description:
      "Build a stronger electrical contractor pipeline with better enquiry capture, estimate follow-up, local marketing and customer lifecycle automation.",
  },
  "/roofing": {
    title: "Roofing Marketing & Growth Systems | GrowthSnipe",
    description:
      "Turn roofing enquiries and inspections into a better-managed estimate pipeline with lead capture, persistent follow-up and performance reporting.",
  },
  "/contractors": {
    title: "General Contractor & Remodeling Marketing Systems | GrowthSnipe",
    description:
      "Build a stronger remodeling and contractor pipeline with project qualification, estimate nurture, referral development and growth intelligence.",
  },
  "/paid-ads": {
    title: "Paid Ads for Home-Service Companies | GrowthSnipe",
    description:
      "Home-service paid advertising managed around qualified enquiries, booked work, acquisition cost and business capacity, not clicks alone.",
  },
  "/crm": {
    title: "SNIPE CRM™ | Lead Capture, Follow-Up & Customer Growth System",
    description:
      "SNIPE CRM brings your leads, calls, customer records and follow-up workflows into one connected home-service growth system.",
  },
  "/intelligence": {
    title: "SNIPE Intelligence™ | Real-Time Home-Service Growth Analytics Dashboard",
    description:
      "See the numbers behind your home-service growth: lead sources, response, bookings, job value, campaign performance and operating priorities.",
  },
  "/voiceiq": {
    title: "SNIPE VoiceIQ™ | Call Coverage & Conversation Quality for Home Services",
    description:
      "Improve home-service call capture and quality with configured Voice AI fallback, call routing, conversation insights and follow-up workflows.",
  },
  "/how-it-works": {
    title: "How It Works | From Growth Plan to Booked Jobs",
    description:
      "See how GrowthSnipe diagnoses your business, builds a 12-month growth plan, installs the system and operates the growth process with you.",
  },
  "/snipe-system": {
    title: "The SNIPE System | Growth Method for Home-Service Companies",
    description:
      "Explore the five-pillar SNIPE System: Size the Gap, Net-Ticket Architecture, Instant Capture, Pipeline Engine, Expand and Evaluate.",
  },
  "/about": {
    title: "About GrowthSnipe | Plan It. Install It. Run It.",
    description:
      "Meet GrowthSnipe, the Plan-to-Booked Growth Partner helping owner-operated home-service businesses connect strategy, marketing and operations.",
  },
  "/case-studies": {
    title: "GrowthSnipe Case Studies & Growth Breakdowns",
    description:
      "Explore examples of how the SNIPE System analyzes lead capture, booking, ticket size, referrals and repeat revenue for home-service businesses.",
  },
  "/resources": {
    title: "Home-Service Growth Resources | GrowthSnipe",
    description:
      "Practical guides, calculators, scripts and growth frameworks for home inspectors, HVAC contractors, plumbers, electricians, roofers and general contractors.",
  },
  "/faq": {
    title: "GrowthSnipe FAQ | Pricing, Process & Services",
    description:
      "Answers about GrowthSnipe pricing, SNIPE Diagnostic™, SNIPE Blueprint™, SNIPE Engine™, advertising, integrations and working together.",
  },
  "/book": {
    title: "Book a Free Growth Fit Call | GrowthSnipe",
    description:
      "Book a 20-minute Growth Fit Call to discuss your home-service business, growth goals and the right next step with GrowthSnipe.",
  },
  "/loop-library/access": {
    title: "Your SNIPE Loops™ | GrowthSnipe",
    description: "Your free SNIPE Loops™ access: follow-up workflows and scripts for your home-service business.",
  },
  "/unsubscribe": {
    title: "Unsubscribe | GrowthSnipe",
    description: "Opt out of GrowthSnipe marketing emails.",
  },
  "/checkout/diagnostic": {
    title: "Get Your SNIPE Diagnostic™ | GrowthSnipe",
    description:
      "Purchase the SNIPE Diagnostic™: a 12-month performance review with a quantified Leak Map and 30-minute review call.",
  },
  "/checkout/blueprint": {
    title: "Get Your SNIPE Blueprint™ | GrowthSnipe",
    description:
      "Purchase the SNIPE Blueprint™: a personalized 12-month growth plan with a 90-minute presentation.",
  },
  "/thank-you/diagnostic": {
    title: "Your Diagnostic Is Underway | GrowthSnipe",
    description: "Thank you for purchasing the SNIPE Diagnostic™. Next steps for your data checklist and review.",
  },
  "/thank-you/blueprint": {
    title: "Let's Build Your Growth Plan | GrowthSnipe",
    description: "Thank you for purchasing the SNIPE Blueprint™. Next steps for intake and your presentation.",
  },
  "/thank-you/loop-library": {
    title: "Your SNIPE Loops™ Are Ready | GrowthSnipe",
    description: "Check your inbox for access to free SNIPE Loops™ follow-up workflows and scripts.",
  },
  "/results-disclaimer": {
    title: "Results Disclaimer | GrowthSnipe",
    description: "How to read GrowthSnipe case studies, illustrations and planning figures.",
  },
  "/blog": {
    title: "Blog: Straight Talk for Home-Service Owners | GrowthSnipe",
    description:
      "No hype, no jargon. Practical notes on missed calls, average ticket, paid media, and the numbers that decide a home-service month.",
  },
  "/contact": {
    title: "Contact GrowthSnipe",
    description:
      "Book a discovery call, ask for a Revenue Leak Scorecard, or ask about SNIPE Engine™.",
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
