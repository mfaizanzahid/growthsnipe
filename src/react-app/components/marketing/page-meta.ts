/**
 * Static per-page title + meta description map for marketing routes.
 * Param routes (/integrations/:platform, /who-we-help/:trade, /blog/:slug)
 * set their own meta from page data — they have no entry here on purpose.
 */
export const PAGE_META: Record<string, { title: string; description: string }> = {
  "/": {
    title: "AI Decision-Making Platform for Home Service Businesses",
    description:
      "Tradesmatic connects Spectora, ISN, ServiceTitan, Housecall Pro, and Jobber to Claude, ChatGPT, and Gemini for deep insights and data-backed actions.",
  },
  "/features": {
    title: "Features: Turn Business Data into Decisions",
    description:
      "Real-time business insights for contractors. Tradesmatic turns your booking software into deep insights and data-backed actions.",
  },
  "/how-it-works": {
    title: "How It Works: Real-Time Data to Action in 4 Steps",
    description:
      "How Tradesmatic works: connect your business software to Claude, ChatGPT, and Gemini in real time for deep insights and data-backed actions.",
  },
  "/advisors": {
    title: "AI Advisors for Home Service Businesses",
    description:
      "Meet 7 AI advisors for home service pros: CEO, CFO, ops, revenue, customer, marketing, and quality — working from your real-time data.",
  },
  "/integrations": {
    title: "Integrations: Connect Your Business Software",
    description:
      "Tradesmatic works with Spectora, ISN, ServiceTitan, Housecall Pro, and Jobber — connected in real time to Claude, ChatGPT, and Gemini.",
  },
  "/security": {
    title: "Security: We Don't Store Your Business Data",
    description:
      "Tradesmatic never stores your business data. Real-time, pass-through architecture with encrypted credentials and audited actions. Read how it works.",
  },
  "/about": {
    title: "About Tradesmatic: 15 Years in Home Services",
    description:
      "Built by a team with 15 years serving home service businesses. Why we built a decision-making platform on our Multi-Trades™ MCP Server.",
  },
  "/pricing": {
    title: "Pricing: Plans That Fit Your Home Service Shop",
    description:
      "Simple contractor pricing with a free 30-day trial, no card required. Dashboard and AI connection in every plan. Prices in USD. See what's included.",
  },
  "/technology": {
    title: "MCP Server for Trades With Real-Time Insights",
    description:
      "MCP server for trades: Tradesmatic connects your booking software to Claude, ChatGPT, and Gemini for real-time, decision-ready answers.",
  },
  "/associations": {
    title: "Association Member Benefit for Home Services",
    description:
      "Give members deep insights and better decision-making with preferred pricing, a pilot program, and co-branded materials from Tradesmatic.",
  },
  "/who-we-help": {
    title: "Real-Time Business Insights for Contractors",
    description:
      "Real-time business insights for contractors: Tradesmatic connects each trade's software to Claude, ChatGPT, and Gemini for better decisions.",
  },
  "/blog": {
    title: "Blog: Straight Talk for Home Service Owners | Tradesmatic",
    description:
      "No AI hype, no jargon — deep insights and decision-making habits for people who run home service businesses.",
  },
  "/contact": {
    title: "Contact the Tradesmatic Team | Tradesmatic",
    description:
      "Talk to a human at Tradesmatic about your trade, your software, or a partnership for your member group.",
  },
  "/privacy": {
    title: "Privacy Policy | Tradesmatic",
    description:
      "How Tradesmatic handles your data: real-time pass-through, nothing stored, and what we keep and why.",
  },
  "/terms": {
    title: "Terms of Service | Tradesmatic",
    description:
      "The terms for using Tradesmatic: plans and trials, acceptable use, and how billing works.",
  },
};
