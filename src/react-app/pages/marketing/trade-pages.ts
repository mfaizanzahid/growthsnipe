import type { ComponentType } from "react";
import type { PlatformSlug } from "./integration-pages";
import {
  HomeModernIcon,
  Cog6ToothIcon,
  WrenchIcon,
  BoltIcon,
  BuildingOfficeIcon,
  UsersIcon,
  BugAntIcon,
} from "@heroicons/react/24/outline";

export type TradeSlug =
  | "home-inspectors"
  | "hvac-contractors"
  | "plumbing-contractors"
  | "electrical-contractors"
  | "roofing-contractors"
  | "general-contractors"
  | "pest-control";

export interface TradePageData {
  slug: TradeSlug;
  tradeName: string;
  cardBlurb: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  eyebrow: string;
  lede: string;
  problemTitle: string;
  problemBody: string;
  pains: { title: string; body: string }[];
  advisors: { name: string; body: string }[];
  integrationsBody: string;
  integrationLinks: { slug: PlatformSlug; label: string }[];
  extraSection?: { eyebrow: string; title: string; items: { title: string; body: string }[] };
  testimonial?: { quote: string; name: string; detail: string };
  faqs: { q: string; a: string }[];
  ctaTitle: string;
  ctaBody: string;
}

export const TRADE_PAGES: Record<TradeSlug, TradePageData> = {
  "home-inspectors": {
    slug: "home-inspectors",
    tradeName: "Home Inspectors",
    cardBlurb: "Slow months, realtor drift, and review risk, diagnosed from your own jobs.",
    icon: HomeModernIcon,
    title: "AI for Home Inspectors | Real-Time Business Insights",
    description:
      "AI for home inspectors: deep insights from Spectora and ISN inside Claude, ChatGPT, and Gemini.",
    eyebrow: "For home inspectors",
    lede:
      "Tradesmatic connects Spectora, ISN, ServiceTitan, Housecall Pro, and Jobber to Claude, ChatGPT, and Gemini in real time. For home inspectors, that means deep insights and data-backed actions inside the AI you already use — built from your inspections, clients, agents, and events.",
    problemTitle: "A slow month with no explanation",
    problemBody:
      "Tradesmatic is a decision-making platform for owner-operated inspection businesses. Through our Multi-Trades™ MCP Server, it connects your inspection software to the AI you already use, so every answer is decision-ready and backed by real data.",
    pains: [
      {
        title: "A February dip you can't explain",
        body: "Jobs fall from 28 to 17 and gut feel says “seasonality.” The real answer — two referring agents went quiet while online leads held — is sitting in your Spectora or ISN data.",
      },
      {
        title: "Referral data scattered everywhere",
        body: "Agent, repeat-client, and online bookings live in different views. Nobody lines them up week to week, so a fading source goes unnoticed for a month.",
      },
      {
        title: "Trouble that surfaces as a review",
        body: "A callback pattern or an unhappy buyer builds quietly for weeks, then appears as a one-star review you can't undo. You needed the pattern flagged early, not after.",
      },
    ],
    advisors: [
      {
        name: "Business Owner / CEO Advisor",
        body: "Your daily driver: what changed since yesterday and the three things worth your attention today, drawn from your latest inspections and bookings.",
      },
      {
        name: "Marketing / Channel Analyst",
        body: "Which agents and channels are earning their keep. Catches a referring agent sliding from four jobs a month to one, with real data behind it.",
      },
      {
        name: "Customer Intelligence Manager",
        body: "Who needs attention, who refers, and who is drifting — past clients due for a check-in and agents who stopped sending work.",
      },
      {
        name: "Quality / Risk Manager",
        body: "Complaint and callback patterns surfaced before they become a bad review, so one awkward job stays one awkward job.",
      },
    ],
    integrationsBody:
      "Tradesmatic connects Spectora and ISN to Claude, ChatGPT, and Gemini in real time — inspections, clients, agents, and events read when you ask, nothing migrated, nothing re-typed. Your business data is never stored on our servers.",
    integrationLinks: [
      { slug: "spectora", label: "Tradesmatic for Spectora" },
      { slug: "isn", label: "Tradesmatic for ISN" },
    ],
    extraSection: {
      eyebrow: "A Monday routine",
      title: "Three questions that run your week",
      items: [
        {
          title: "“How did we do last week?”",
          body: "Jobs, average fee, and mix versus the prior four weeks, with the one shift that explains the difference.",
        },
        {
          title: "“Which referral sources are slipping?”",
          body: "Agent-by-agent trend with real data, so one call goes to the right agent on Monday, not all of them in March.",
        },
        {
          title: "“What needs me today?”",
          body: "Open quotes, unconfirmed bookings, and follow-ups worth flagging for data-backed actions in your connected software.",
        },
      ],
    },
    testimonial: {
      quote:
        "My top agent went from three referrals a month to zero and I didn't catch it for six weeks. Now the Monday briefing flags it first — one lunch fixed what cost me four jobs.",
      name: "Tom Becker",
      detail: "Owner, Blue Ridge Home Inspections",
    },
    faqs: [
      {
        q: "How does Tradesmatic work with Spectora or ISN?",
        a: "Tradesmatic connects Spectora and ISN to Claude, ChatGPT, and Gemini in real time through our Multi-Trades™ MCP Server. You ask a plain question in the AI you already use and get deep insights built from your inspections, clients, agents, and events — with nothing to migrate and nothing stored on our servers.",
      },
      {
        q: "Do I need a new AI subscription?",
        a: "No. Tradesmatic works with the AI you already use — Claude, ChatGPT, and Gemini — so your existing subscription becomes a business-aware advisor team. Setup is a copy-paste configuration that takes minutes.",
      },
      {
        q: "Is my inspection data stored anywhere?",
        a: "No. Tradesmatic reads your business data in real time from your connected software and never stores it on our servers. Disconnect at any time and access ends with it. See our security page for the full explanation.",
      },
    ],
    ctaTitle: "Ask your business a question tonight",
    ctaBody:
      "Connect your inspection software, add your context once, and get deep insights and data-backed actions in the AI you already use. Start your free 30-day trial — no credit card required.",
  },
  "hvac-contractors": {
    slug: "hvac-contractors",
    tradeName: "HVAC Contractors",
    cardBlurb: "Ticket mix, maintenance conversion, and capacity before peak season hits.",
    icon: Cog6ToothIcon,
    title: "AI for HVAC Contractors | Real-Time Job Insights",
    description:
      "AI for HVAC contractors: deep insights from ServiceTitan inside Claude, ChatGPT, and Gemini.",
    eyebrow: "For HVAC contractors",
    lede:
      "Tradesmatic connects Spectora, ISN, ServiceTitan, Housecall Pro, and Jobber to Claude, ChatGPT, and Gemini in real time. For HVAC shops, that means ticket mix, maintenance agreements, and crew capacity in one morning view — deep insights and data-backed actions inside the AI you already use.",
    problemTitle: "Busy season hides what shoulder season exposes",
    problemBody:
      "Tradesmatic is a decision-making platform for owner-operated HVAC businesses. Through our Multi-Trades™ MCP Server, your jobs, clients, and events become decision-ready answers backed by real data.",
    pains: [
      {
        title: "A slow month with no diagnosis",
        body: "Maintenance calls dip in October and nobody can say whether it's demand, quoting, or capacity. The mix shift is in your job data.",
      },
      {
        title: "Numbers scattered across views",
        body: "Tickets, agreements, and callbacks live apart, so a slipping close rate on replacements hides behind a busy repair week.",
      },
      {
        title: "No time for analysis between calls",
        body: "You're dispatching, quoting, and covering no-shows. The analysis waits until Sunday night — or never happens.",
      },
    ],
    advisors: [
      {
        name: "CFO / Performance Analyst",
        body: "Ticket, mix, and replacement-vs-repair trends with real data.",
      },
      {
        name: "Operations Manager",
        body: "Scheduling health, open work, and crew capacity.",
      },
      {
        name: "Revenue Manager",
        body: "Pipeline, conversion, and agreement renewals — where the next dollar comes from.",
      },
    ],
    integrationsBody:
      "Tradesmatic connects ServiceTitan to Claude, ChatGPT, and Gemini in real time. Smaller shops run the same workflow through Housecall Pro or Jobber.",
    integrationLinks: [
      { slug: "servicetitan", label: "Tradesmatic for ServiceTitan" },
      { slug: "housecall-pro", label: "Tradesmatic for Housecall Pro" },
      { slug: "jobber", label: "Tradesmatic for Jobber" },
    ],
    faqs: [
      {
        q: "Which questions should an HVAC owner ask first?",
        a: "Start with “How did ticket mix shift this month?”, “Which techs close replacements versus repairs?”, and “Which agreement renewals are due?” Each answer comes from your real-time job data with the numbers shown, so better decisions take minutes, not a Sunday of spreadsheet work.",
      },
      {
        q: "Does it work with the AI I already pay for?",
        a: "Yes. Tradesmatic works with the AI you already use — Claude, ChatGPT, and Gemini — with no new AI subscription required. Your existing tool becomes the place you ask about scheduling, pricing, and capacity.",
      },
      {
        q: "Do you store my customer or job data?",
        a: "No. Tradesmatic reads your connected software in real time through the Multi-Trades™ MCP Server and never stores business data on our servers.",
      },
    ],
    ctaTitle: "See your ticket mix before Monday",
    ctaBody:
      "Connect your job software and ask the AI you already use what changed, what's slipping, and what to do next. Start your free 30-day trial — no credit card required.",
  },
  "plumbing-contractors": {
    slug: "plumbing-contractors",
    tradeName: "Plumbing Contractors",
    cardBlurb: "Average ticket, add-on quoting, and repeat-client follow-up without digging through reports.",
    icon: WrenchIcon,
    title: "AI for Plumbers | Real-Time Ticket & Job Insights",
    description:
      "AI for plumbers: deep insights on tickets and jobs from ServiceTitan, in Claude, ChatGPT, and Gemini.",
    eyebrow: "For plumbing contractors",
    lede:
      "Tradesmatic connects Spectora, ISN, ServiceTitan, Housecall Pro, and Jobber to Claude, ChatGPT, and Gemini in real time. For plumbers, that means average ticket, add-on quoting, and repeat-client follow-up without digging through reports — deep insights and data-backed actions inside the AI you already use.",
    problemTitle: "The ticket looks fine until you split it",
    problemBody:
      "Tradesmatic is a decision-making platform for owner-operated plumbing businesses. Through our Multi-Trades™ MCP Server, every answer is pulled from your real-time jobs and clients — never stale, never guessed.",
    pains: [
      {
        title: "An average ticket that drifts down quietly",
        body: "Add-on quoting slips $35 a job and nobody notices for six weeks, because the top-line revenue still looks fine.",
      },
      {
        title: "Repeat clients nobody follows up",
        body: "Past water-heater and repipe customers sit in your software while emergency calls get all the attention. The next job was already yours.",
      },
      {
        title: "Generic AI that doesn't know your numbers",
        body: "Claude, ChatGPT, and Gemini start every session from zero: no ticket history, no tech mix, no season. You get advice; you still do the analysis.",
      },
    ],
    advisors: [
      {
        name: "CFO / Performance Analyst",
        body: "Ticket, add-on rate, and trend evidence.",
      },
      {
        name: "Revenue Manager",
        body: "Quoting conversion and pricing power.",
      },
      {
        name: "Customer Intelligence Manager",
        body: "Repeat clients drifting, with real data on who to call back.",
      },
    ],
    integrationsBody:
      "Tradesmatic connects ServiceTitan to Claude, ChatGPT, and Gemini in real time. Smaller plumbing teams use the same workflow through Housecall Pro or Jobber.",
    integrationLinks: [
      { slug: "servicetitan", label: "Tradesmatic for ServiceTitan" },
      { slug: "housecall-pro", label: "Tradesmatic for Housecall Pro" },
      { slug: "jobber", label: "Tradesmatic for Jobber" },
    ],
    faqs: [
      {
        q: "Can it show why my average ticket changed?",
        a: "Yes. Ask which services, techs, or weeks moved the ticket and by how much. Answers are built from your real-time job data, so you see whether quoting, mix, or discounts explain the shift — then take data-backed actions like fixing a quote template.",
      },
      {
        q: "Which AI tools does it work with?",
        a: "Tradesmatic works with the AI you already use — Claude, ChatGPT, and Gemini. Ask in whichever one you prefer; the deep insights come from the same connected business data.",
      },
      {
        q: "What happens to my data if I cancel?",
        a: "Nothing stays behind: Tradesmatic never stores your business data on its servers, so cancelling ends real-time access with nothing retained to clean up.",
      },
    ],
    ctaTitle: "Find the $35 hiding in your ticket",
    ctaBody:
      "Connect your software and ask where quoting is leaking, who to follow up, and what to fix first. Start your free 30-day trial — no credit card required.",
  },
  "electrical-contractors": {
    slug: "electrical-contractors",
    tradeName: "Electrical Contractors",
    cardBlurb: "Scheduling health, quoting conversion, and which jobs actually earn their keep.",
    icon: BoltIcon,
    title: "AI for Electricians | Real-Time Business Insights",
    description:
      "AI for electricians: scheduling, quoting, and job insights from ServiceTitan in Claude, ChatGPT, and Gemini.",
    eyebrow: "For electrical contractors",
    lede:
      "Tradesmatic connects Spectora, ISN, ServiceTitan, Housecall Pro, and Jobber to Claude, ChatGPT, and Gemini in real time. For electrical shops, that means scheduling health, quoting conversion, and which jobs actually earn their keep — deep insights and data-backed actions inside the AI you already use.",
    problemTitle: "A full board that still pays unevenly",
    problemBody:
      "Tradesmatic is a decision-making platform for owner-operated electrical businesses. Through our Multi-Trades™ MCP Server, your schedule, quotes, and jobs become decision-ready answers backed by real data.",
    pains: [
      {
        title: "Quotes that die quietly",
        body: "Panel upgrades and service calls get quoted, then stall. Nobody tracks who never got the follow-up, so the week looks full while revenue leaks.",
      },
      {
        title: "Job mix nobody prices honestly",
        body: "Troubleshooting calls eat hours while installs pay the bills, but the blended numbers hide which work earns its keep.",
      },
      {
        title: "A schedule reviewed in the truck",
        body: "Capacity, open work, and callbacks get triaged between stops. There is no calm moment for better decisions.",
      },
    ],
    advisors: [
      {
        name: "Operations Manager",
        body: "Scheduling health, open work, and capacity recovery.",
      },
      {
        name: "Revenue Manager",
        body: "Quote conversion and pricing power.",
      },
      {
        name: "CFO / Performance Analyst",
        body: "Service mix and margin pattern with real data, never vague.",
      },
    ],
    integrationsBody:
      "Tradesmatic connects ServiceTitan to Claude, ChatGPT, and Gemini in real time. Smaller electrical teams run the same workflow through Housecall Pro or Jobber.",
    integrationLinks: [
      { slug: "servicetitan", label: "Tradesmatic for ServiceTitan" },
      { slug: "housecall-pro", label: "Tradesmatic for Housecall Pro" },
      { slug: "jobber", label: "Tradesmatic for Jobber" },
    ],
    faqs: [
      {
        q: "Can it tell me which quotes need follow-up?",
        a: "Yes. Ask which open quotes are aging, worth the most, and most likely to close, then flag follow-ups as data-backed actions in your connected software. Every suggestion cites your real-time quote and job data.",
      },
      {
        q: "I already use ChatGPT — do I need something new?",
        a: "No. Tradesmatic works with the AI you already use — Claude, ChatGPT, and Gemini — so the tool you already open becomes the one that knows your schedule, quotes, and ticket mix.",
      },
      {
        q: "Is my business data stored on your servers?",
        a: "No. Tradesmatic reads your connected software in real time and never stores business data on our servers. Only your short business-context profile is saved, and you control or delete it any time.",
      },
    ],
    ctaTitle: "Know which quotes still close this week",
    ctaBody:
      "Connect your software, ask what needs attention, and act before the board goes soft. Start your free 30-day trial — no credit card required.",
  },
  "roofing-contractors": {
    slug: "roofing-contractors",
    tradeName: "Roofing Contractors",
    cardBlurb: "Pipeline, referral sources, and seasonal dips you can plan around instead of react to.",
    icon: BuildingOfficeIcon,
    title: "AI for Roofers | Real-Time Pipeline Insights",
    description:
      "AI for roofers: pipeline and referral insights from ServiceTitan inside Claude, ChatGPT, and Gemini.",
    eyebrow: "For roofing contractors",
    lede:
      "Tradesmatic connects Spectora, ISN, ServiceTitan, Housecall Pro, and Jobber to Claude, ChatGPT, and Gemini in real time. For roofers, that means pipeline, referral sources, and seasonal dips you can plan around instead of react to — deep insights and data-backed actions inside the AI you already use.",
    problemTitle: "Storm season covers a thin pipeline",
    problemBody:
      "Tradesmatic is a decision-making platform for owner-operated roofing businesses. Through our Multi-Trades™ MCP Server, inspections, quotes, and jobs become decision-ready answers backed by real data.",
    pains: [
      {
        title: "A pipeline that looks full until it isn't",
        body: "Inspections stack up but close rates sag, and the gap shows up as an empty install calendar three weeks later.",
      },
      {
        title: "Referral sources nobody compares",
        body: "Insurance, realtor, repeat, and online leads run side by side with no trend line, so a drying source hides behind one good storm month.",
      },
      {
        title: "Seasonality you feel but can't plan",
        body: "Every winter surprises the same way: same dip, same scramble, no numbers on when to shift crews to repairs and maintenance.",
      },
    ],
    advisors: [
      {
        name: "Revenue Manager",
        body: "Pipeline, conversion, and where the next job comes from.",
      },
      {
        name: "Marketing / Channel Analyst",
        body: "Which referral sources are earning their keep.",
      },
      {
        name: "Business Owner / CEO Advisor",
        body: "The three things worth attention today, from real-time data.",
      },
    ],
    integrationsBody:
      "Tradesmatic connects ServiceTitan to Claude, ChatGPT, and Gemini in real time. Smaller roofing crews use the same workflow through Housecall Pro or Jobber.",
    integrationLinks: [
      { slug: "servicetitan", label: "Tradesmatic for ServiceTitan" },
      { slug: "housecall-pro", label: "Tradesmatic for Housecall Pro" },
      { slug: "jobber", label: "Tradesmatic for Jobber" },
    ],
    faqs: [
      {
        q: "Can it show where my next jobs come from?",
        a: "Yes. Ask for pipeline by stage and source with close-rate trends, all from your real-time data. You see whether insurance, realtor, or repeat work carries next month — and where one follow-up push pays most.",
      },
      {
        q: "Which AI tools can I ask in?",
        a: "Whichever you already use: Tradesmatic works with Claude, ChatGPT, and Gemini. The deep insights are the same in each, because they come from your connected business software, not the AI's training data.",
      },
      {
        q: "Do you store my roofing job data?",
        a: "No. Tradesmatic never stores your business data on our servers — it reads your connected software in real time when you ask, and access ends if you disconnect.",
      },
    ],
    ctaTitle: "See next month's installs today",
    ctaBody:
      "Connect your software and ask what's in the pipeline, what's slipping, and where to push. Start your free 30-day trial — no credit card required.",
  },
  "general-contractors": {
    slug: "general-contractors",
    tradeName: "General Contractors",
    cardBlurb: "Quotes, jobs, and invoices across trades, with the three decisions that matter today on top.",
    icon: UsersIcon,
    title: "AI for General Contractors | Real-Time Insights",
    description:
      "AI for general contractors: quotes, jobs, and decisions from Jobber inside Claude, ChatGPT, and Gemini.",
    eyebrow: "For general contractors",
    lede:
      "Tradesmatic connects Spectora, ISN, ServiceTitan, Housecall Pro, and Jobber to Claude, ChatGPT, and Gemini in real time. For GCs running quotes, jobs, and invoices across trades, that means the three decisions that matter today on top — deep insights and data-backed actions inside the AI you already use.",
    problemTitle: "Five trades, one blurred picture",
    problemBody:
      "Tradesmatic is a decision-making platform for owner-operated general contracting businesses. Through our Multi-Trades™ MCP Server, quotes, jobs, clients, and events become decision-ready answers backed by real data.",
    pains: [
      {
        title: "A slow month spread across trades",
        body: "No single trade looks broken, but together they're down 20%. The answer needs all your job data in one view, not five exports.",
      },
      {
        title: "Quotes, jobs, and invoices that never meet",
        body: "Bids go out, work gets done, invoices lag — and nobody connects the three, so cash timing surprises you monthly.",
      },
      {
        title: "Quality risk across crews and subs",
        body: "A callback pattern on one crew builds quietly until a client review or a lost repeat account forces the conversation.",
      },
    ],
    advisors: [
      {
        name: "Business Owner / CEO Advisor",
        body: "Daily priorities across trades.",
      },
      {
        name: "Operations Manager",
        body: "Scheduling health, open work, and sub follow-through.",
      },
      {
        name: "Quality / Risk Manager",
        body: "Callback and complaint patterns before they cost an account.",
      },
    ],
    integrationsBody:
      "Tradesmatic connects Jobber to Claude, ChatGPT, and Gemini in real time. Smaller multi-trade teams run the same workflow through Housecall Pro, and larger crews connect through ServiceTitan.",
    integrationLinks: [
      { slug: "jobber", label: "Tradesmatic for Jobber" },
      { slug: "housecall-pro", label: "Tradesmatic for Housecall Pro" },
      { slug: "servicetitan", label: "Tradesmatic for ServiceTitan" },
    ],
    faqs: [
      {
        q: "How does this help a GC juggling multiple trades?",
        a: "It puts quotes, jobs, clients, and events from your connected software into one real-time view inside Claude, ChatGPT, or Gemini. Ask “which trade is dragging this month?” or “which invoices are stuck?” and get answers with real data instead of five separate reports.",
      },
      {
        q: "Do I need to change how my team works?",
        a: "No. Tradesmatic reads your existing software through the Multi-Trades™ MCP Server — nothing migrates, nothing re-trains. Your crew keeps booking and billing as usual; you get the decision-making layer on top.",
      },
      {
        q: "Is my client and job data stored?",
        a: "No. Tradesmatic never stores your business data on our servers. It reads your connected software in real time when you ask a question.",
      },
    ],
    ctaTitle: "One view across every trade you run",
    ctaBody:
      "Connect your software and start each day knowing the three decisions that matter. Start your free 30-day trial — no credit card required.",
  },
  "pest-control": {
    slug: "pest-control",
    tradeName: "Pest Control",
    cardBlurb: "Route density, plan renewals, and customers quietly drifting away.",
    icon: BugAntIcon,
    title: "AI for Pest Control | Real-Time Route Insights",
    description:
      "AI for pest control: routes, repeats, and retention from Housecall Pro in Claude, ChatGPT, and Gemini.",
    eyebrow: "For pest control operators",
    lede:
      "Tradesmatic connects Spectora, ISN, ServiceTitan, Housecall Pro, and Jobber to Claude, ChatGPT, and Gemini in real time. For pest control, that means routes, repeats, and retention in one morning view — deep insights and data-backed actions inside the AI you already use.",
    problemTitle: "Recurring revenue that quietly leaks",
    problemBody:
      "Tradesmatic is a decision-making platform for owner-operated pest control businesses. Through our Multi-Trades™ MCP Server, your jobs, clients, and events become decision-ready answers backed by real data.",
    pains: [
      {
        title: "Cancellations nobody catches in time",
        body: "A dozen quarterly accounts drift off between cycles. Each one looks small; together they're the slow month you can't explain.",
      },
      {
        title: "Routes full, margins thin",
        body: "Trucks run all day but reschedules, one-offs, and callbacks eat the density that makes routes pay. The pattern is in your job data.",
      },
      {
        title: "Reviews that punish one missed visit",
        body: "A skipped follow-up or a callback handled late becomes the review new customers read first. The warning signs were there weeks earlier.",
      },
    ],
    advisors: [
      {
        name: "Customer Intelligence Manager",
        body: "Who is drifting and who renews, with real data.",
      },
      {
        name: "Operations Manager",
        body: "Route density, reschedules, and open callbacks.",
      },
      {
        name: "Quality / Risk Manager",
        body: "Complaint patterns before they become bad reviews.",
      },
    ],
    integrationsBody:
      "Tradesmatic connects Housecall Pro to Claude, ChatGPT, and Gemini in real time. Teams on Jobber run the same workflow through Jobber.",
    integrationLinks: [
      { slug: "housecall-pro", label: "Tradesmatic for Housecall Pro" },
      { slug: "jobber", label: "Tradesmatic for Jobber" },
    ],
    faqs: [
      {
        q: "Can it flag accounts about to cancel?",
        a: "Yes. Ask which recurring clients missed visits, opened complaints, or skipped renewals, with real data on each account. You get a short call list while a save is still possible — then log follow-ups as data-backed actions.",
      },
      {
        q: "Which AI tools does it work with?",
        a: "Tradesmatic works with the AI you already use — Claude, ChatGPT, and Gemini. Ask about routes, retention, or callbacks in whichever one you already open each day.",
      },
      {
        q: "Do you store my customer list?",
        a: "No. Tradesmatic reads your connected software in real time and never stores business data on our servers. Disconnect any time and access ends with it.",
      },
    ],
    ctaTitle: "Keep every route — and every account",
    ctaBody:
      "Connect your software and see who's drifting, which routes pay, and what to do first. Start your free 30-day trial — no credit card required.",
  },
};

export function getTradePage(slug: string): TradePageData | undefined {
  return (TRADE_PAGES as Record<string, TradePageData>)[slug];
}
