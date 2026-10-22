import type { TradeSlug } from "./trade-pages";

export type PlatformSlug = "spectora" | "isn" | "servicetitan" | "housecall-pro" | "jobber";

export interface IntegrationPageData {
  slug: PlatformSlug;
  platformName: string;
  title: string;
  description: string;
  lede: string;
  questions: { title: string; body: string }[];
  advisors: { name: string; body: string }[];
  tradeLinks: { slug: TradeSlug; label: string }[];
  faqs: { q: string; a: string }[];
  ctaTitle: string;
}

export const INTEGRATION_PAGES: Record<PlatformSlug, IntegrationPageData> = {
  spectora: {
    slug: "spectora",
    platformName: "Spectora",
    title: "Spectora AI Reporting & Insights | Tradesmatic",
    description:
      "Spectora reporting with AI answers for home inspectors. Deep insights and data-backed actions in Claude, ChatGPT, and Gemini, from real-time data.",
    lede:
      "Deep insights for home inspectors, pulled straight from your Spectora inspections. Tradesmatic connects Spectora, ISN, ServiceTitan, Housecall Pro, and Jobber to Claude, ChatGPT, and Gemini in real time. You ask in the AI you already use — Claude, ChatGPT, and Gemini — and get decision-ready answers backed by real data, through our Multi-Trades™ MCP Server.",
    questions: [
      {
        title: "How did this week compare to last?",
        body: "Inspection count, average fee, service mix, and cancellations vs. the prior period, with real data behind each number for better decision-making.",
      },
      {
        title: "Which referral sources are slipping?",
        body: "Agent-by-agent inspection volume and trend shifts, so you see cooling relationships before month-end and can take data-backed actions.",
      },
      {
        title: "What's unconfirmed or gapped in the schedule?",
        body: "Upcoming inspections, open slots, and unconfirmed bookings from your Spectora events, summarized into three priorities for today.",
      },
    ],
    advisors: [
      {
        name: "Business Owner / CEO Advisor",
        body: "What changed and the three things worth attention today.",
      },
      {
        name: "CFO / Performance Analyst",
        body: "Average fee, service mix, and trend evidence across inspections.",
      },
      {
        name: "Marketing / Channel Analyst",
        body: "Which agents and referral sources are earning their keep.",
      },
      {
        name: "Operations Manager",
        body: "Scheduling health and follow-through on open inspections.",
      },
    ],
    tradeLinks: [{ slug: "home-inspectors", label: "AI decision-making for home inspectors" }],
    faqs: [
      {
        q: "How does Tradesmatic use my Spectora data?",
        a: "Tradesmatic reads your Spectora inspections, clients, agents, and events in real time through the Multi-Trades™ MCP Server and answers inside Claude, ChatGPT, and Gemini. Nothing is exported or stored on Tradesmatic servers.",
      },
      {
        q: "Do I need a new AI subscription to use Tradesmatic with Spectora?",
        a: "No. Tradesmatic works with the AI you already use — Claude, ChatGPT, and Gemini — with no new AI subscription required.",
      },
      {
        q: "Does Tradesmatic replace Spectora reporting?",
        a: "No. Spectora remains your system of record. Tradesmatic adds deep insights, better decision-making, and data-backed actions on top of your real-time Spectora data.",
      },
    ],
    ctaTitle: "See what your Spectora data is trying to tell you",
  },
  isn: {
    slug: "isn",
    platformName: "Inspection Support Network (ISN)",
    title: "ISN Business Insights & AI Reporting | Tradesmatic",
    description:
      "ISN business insights for home inspectors. Ask plain questions in Claude, ChatGPT, and Gemini and get deep insights backed by real-time data.",
    lede:
      "Straight answers from your ISN office, in plain language. Tradesmatic connects Spectora, ISN, ServiceTitan, Housecall Pro, and Jobber to Claude, ChatGPT, and Gemini in real time. Ask in the AI you already use — Claude, ChatGPT, and Gemini — and get decision-ready insights backed by real data, through our Multi-Trades™ MCP Server.",
    questions: [
      {
        title: "Which orders need follow-up this week?",
        body: "Open orders, pending bookings, and quiet quotes by age and source, ranked so you know where the next decision matters.",
      },
      {
        title: "Where is agent work trending?",
        body: "Order volume by agent and referral source over time, with real data showing who is growing, flat, or drifting.",
      },
      {
        title: "Who needs attention before they go quiet?",
        body: "Clients and agents with fading order patterns, surfaced with order history for better decision-making and timely data-backed actions.",
      },
    ],
    advisors: [
      {
        name: "Business Owner / CEO Advisor",
        body: "Daily priorities drawn from orders and events.",
      },
      {
        name: "Revenue Manager",
        body: "Pipeline, conversion, and where the next order comes from.",
      },
      {
        name: "Customer Intelligence Manager",
        body: "Who needs attention and who refers, backed by real data.",
      },
      {
        name: "Operations Manager",
        body: "Open orders, capacity, and follow-through.",
      },
    ],
    tradeLinks: [{ slug: "home-inspectors", label: "AI decision-making for home inspectors" }],
    faqs: [
      {
        q: "How does Tradesmatic use my ISN data?",
        a: "Tradesmatic reads your ISN orders, clients, agents, and events in real time through the Multi-Trades™ MCP Server and answers inside Claude, ChatGPT, and Gemini. Tradesmatic does not store your business data on its servers.",
      },
      {
        q: "Do I need to change how my office uses ISN?",
        a: "No. ISN stays exactly as it is. Tradesmatic reads from your current setup and delivers deep insights and decision-ready summaries in the AI you already use — Claude, ChatGPT, and Gemini.",
      },
      {
        q: "What kinds of questions work best?",
        a: "Specific operational questions work best, such as order trends by agent, follow-up backlogs, and week-over-week performance, all answered with real data to support data-backed actions.",
      },
    ],
    ctaTitle: "Ask your ISN data plain questions",
  },
  servicetitan: {
    slug: "servicetitan",
    platformName: "ServiceTitan",
    title: "ServiceTitan AI Insights & Reporting | Tradesmatic",
    description:
      "ServiceTitan AI integration for HVAC, plumbing, electrical, and roofing. Deep insights in Claude, ChatGPT, and Gemini from real-time job data.",
    lede:
      "Revenue, crew load, and pipeline — answered from your actual jobs. Tradesmatic connects Spectora, ISN, ServiceTitan, Housecall Pro, and Jobber to Claude, ChatGPT, and Gemini in real time. Work in the AI you already use — Claude, ChatGPT, and Gemini — with decision-ready answers backed by real data, through our Multi-Trades™ MCP Server.",
    questions: [
      {
        title: "How did booked work trend this month?",
        body: "Completed jobs, average ticket, and service mix vs. prior periods, with real data behind each shift for stronger decision-making.",
      },
      {
        title: "Where are quotes stalling?",
        body: "Open quotes and estimate-to-job conversion by service and crew, so you see follow-up gaps while they are still winnable — the basis for data-backed actions.",
      },
      {
        title: "Where is technician capacity tight?",
        body: "Scheduled jobs and workload patterns drawn from the schedule itself, summarized into what to staff, move, or watch.",
      },
    ],
    advisors: [
      {
        name: "CFO / Performance Analyst",
        body: "Ticket, mix, and trend evidence across jobs.",
      },
      {
        name: "Operations Manager",
        body: "Scheduling health, open work, and crew capacity.",
      },
      {
        name: "Revenue Manager",
        body: "Pipeline, conversion, and pricing patterns.",
      },
      {
        name: "Business Owner / CEO Advisor",
        body: "The three decisions that matter today.",
      },
    ],
    tradeLinks: [
      { slug: "hvac-contractors", label: "AI decision-making for HVAC contractors" },
      { slug: "plumbing-contractors", label: "AI decision-making for plumbing contractors" },
      { slug: "electrical-contractors", label: "AI decision-making for electrical contractors" },
      { slug: "roofing-contractors", label: "AI decision-making for roofing contractors" },
    ],
    faqs: [
      {
        q: "How does Tradesmatic use my ServiceTitan data?",
        a: "Tradesmatic reads your ServiceTitan jobs, quotes, and schedules in real time through the Multi-Trades™ MCP Server and answers inside Claude, ChatGPT, and Gemini. Your business data is not stored on Tradesmatic servers.",
      },
      {
        q: "Which teams is this built for?",
        a: "Tradesmatic is built for owner-operated HVAC, plumbing, electrical, and roofing teams that run on ServiceTitan and want deep insights and better decisions without adding headcount.",
      },
      {
        q: "Do I need a new AI subscription?",
        a: "No. Tradesmatic works with the AI you already use — Claude, ChatGPT, and Gemini — reading your real-time ServiceTitan data to support data-backed actions.",
      },
    ],
    ctaTitle: "Turn ServiceTitan jobs into decisions",
  },
  "housecall-pro": {
    slug: "housecall-pro",
    platformName: "Housecall Pro",
    title: "Housecall Pro Reporting & AI Insights | Tradesmatic",
    description:
      "Housecall Pro reporting with AI answers for small shops. Deep insights in Claude, ChatGPT, and Gemini, backed by real-time job data.",
    lede:
      "A clear read on your week — jobs, leads, and follow-ups. Tradesmatic connects Spectora, ISN, ServiceTitan, Housecall Pro, and Jobber to Claude, ChatGPT, and Gemini in real time. Ask in the AI you already use — Claude, ChatGPT, and Gemini — and get decision-ready answers backed by real data, through our Multi-Trades™ MCP Server.",
    questions: [
      {
        title: "What happened this week, and what is next?",
        body: "Completed visits, open jobs, and upcoming follow-ups by day and tech, distilled into priorities for better decision-making.",
      },
      {
        title: "Which leads went quiet?",
        body: "Unconverted leads and aging quotes by source, with real data showing where a nudge could turn into data-backed actions.",
      },
      {
        title: "Are estimates converting?",
        body: "Estimate-to-job rates by service and time period, so you see what is closing and what needs a second look.",
      },
    ],
    advisors: [
      {
        name: "Business Owner / CEO Advisor",
        body: "What changed and what deserves attention today.",
      },
      {
        name: "Operations Manager",
        body: "Job flow, follow-ups, and crew follow-through.",
      },
      {
        name: "Revenue Manager",
        body: "Quote pipeline and conversion patterns.",
      },
      {
        name: "Customer Intelligence Manager",
        body: "Quiet customers and repeat relationships, backed by real data.",
      },
    ],
    tradeLinks: [
      { slug: "hvac-contractors", label: "AI decision-making for HVAC contractors" },
      { slug: "plumbing-contractors", label: "AI decision-making for plumbing contractors" },
      { slug: "electrical-contractors", label: "AI decision-making for electrical contractors" },
      { slug: "general-contractors", label: "AI decision-making for general contractors" },
      { slug: "pest-control", label: "AI decision-making for pest control" },
    ],
    faqs: [
      {
        q: "How does Tradesmatic use my Housecall Pro data?",
        a: "Tradesmatic reads your Housecall Pro jobs, quotes, and schedules in real time through the Multi-Trades™ MCP Server and answers inside Claude, ChatGPT, and Gemini. Nothing about your business is stored on Tradesmatic servers.",
      },
      {
        q: "Is this a fit for a 2–5 person shop?",
        a: "Yes. Tradesmatic is designed for small owner-operated teams that need deep insights and decision-ready answers from real-time data, with the analysis of a CFO, ops manager, and marketing analyst — without adding headcount.",
      },
      {
        q: "Do my techs need to learn a new tool?",
        a: "No. You keep running Housecall Pro as usual and ask questions in the AI you already use — Claude, ChatGPT, and Gemini.",
      },
    ],
    ctaTitle: "Get a real read on your Housecall Pro week",
  },
  jobber: {
    slug: "jobber",
    platformName: "Jobber",
    title: "Jobber Analytics & AI Insights | Tradesmatic",
    description:
      "Jobber analytics for general contractors. Ask Claude, ChatGPT, and Gemini plain questions and get deep insights from real-time data.",
    lede:
      "From quote to paid — know where every job stands. Tradesmatic connects Spectora, ISN, ServiceTitan, Housecall Pro, and Jobber to Claude, ChatGPT, and Gemini in real time. Ask in the AI you already use — Claude, ChatGPT, and Gemini — and get decision-ready answers backed by real data, through our Multi-Trades™ MCP Server.",
    questions: [
      {
        title: "Where do jobs stall between quote and paid?",
        body: "Quote-to-job-to-invoice flow with aging and drop-off points, backed by real data for better decision-making.",
      },
      {
        title: "What should we book before the season turns?",
        body: "Returning clients and recurring work patterns worth lining up early, translated into data-backed actions.",
      },
      {
        title: "Which open invoices need a follow-up?",
        body: "Outstanding balances by client and age, ranked so you chase the right ones first.",
      },
    ],
    advisors: [
      {
        name: "Business Owner / CEO Advisor",
        body: "Daily priorities across quotes, jobs, and invoices.",
      },
      {
        name: "Revenue Manager",
        body: "Pipeline health and where the next dollar comes from.",
      },
      {
        name: "Operations Manager",
        body: "Scheduling health, open jobs, and follow-through.",
      },
      {
        name: "Quality / Risk Manager",
        body: "Callback and complaint patterns before they become bad reviews.",
      },
    ],
    tradeLinks: [{ slug: "general-contractors", label: "AI decision-making for general contractors" }],
    faqs: [
      {
        q: "How does Tradesmatic use my Jobber data?",
        a: "Tradesmatic reads your Jobber jobs, quotes, and schedules in real time through the Multi-Trades™ MCP Server and answers inside Claude, ChatGPT, and Gemini. Your business data is not stored on Tradesmatic servers.",
      },
      {
        q: "Does Tradesmatic work for smaller multi-trade teams on Jobber?",
        a: "Yes. Tradesmatic is designed for owner-operated general contracting and smaller multi-trade teams that want deep insights and decision-ready answers from their real-time Jobber data.",
      },
      {
        q: "Do I need to migrate or re-enter anything?",
        a: "No. Jobber stays your system of record. Tradesmatic reads your current jobs, quotes, and schedules and delivers insights in the AI you already use — Claude, ChatGPT, and Gemini.",
      },
    ],
    ctaTitle: "Follow every Jobber quote to paid",
  },
};

export function getIntegrationPage(slug: string): IntegrationPageData | undefined {
  return (INTEGRATION_PAGES as Record<string, IntegrationPageData>)[slug];
}
