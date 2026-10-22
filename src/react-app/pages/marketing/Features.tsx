import { Link } from "react-router-dom";
import {
  BellAlertIcon,
  ChatBubbleLeftRightIcon,
  CircleStackIcon,
  ClipboardDocumentCheckIcon,
  Cog6ToothIcon,
  ShieldCheckIcon,
  UserGroupIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import { Button } from "../../components/ui/button";
import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import {
  CtaBand,
  IconTile,
  PageHero,
  SectionHeading,
  TrustCallout,
} from "../../components/marketing/MarketingBits";

const FEATURES = [
  {
    icon: CircleStackIcon,
    title: "Real-time data access",
    body: "Every answer is pulled live from your connected software at the moment you ask — never a stale export or last week's spreadsheet. Clients, orders, agents, and events, read as they stand right now.",
  },
  {
    icon: UserGroupIcon,
    title: "Seven AI Advisors",
    body: "Specialist roles covering CEO priorities, financial performance, operations, revenue, customer intelligence, marketing, and quality/risk. A full specialist team working from your real-time data, sharing one business context.",
  },
  {
    icon: BellAlertIcon,
    title: "Scheduled briefings",
    body: "Morning Briefing, Weekly Review, and Monthly Review delivered to your inbox automatically. Numbers, anomalies, and the three things worth attention today. Available on plans that include briefings — see our pricing plans for detail.",
  },
  {
    icon: WrenchScrewdriverIcon,
    title: "Data-backed actions",
    body: "Permissioned follow-through inside your connected software: tagging, notes, and follow-up flags. Read first, suggest second, execute only with your approval — every write audited.",
  },
  {
    icon: ChatBubbleLeftRightIcon,
    title: "Works with the AI you already use",
    body: "Claude, ChatGPT, and Gemini. No new AI subscription, no new chat app to learn. Your existing AI subscription becomes a business-aware advisor team.",
  },
  {
    icon: ShieldCheckIcon,
    title: "No data storage",
    body: "Real-time, pass-through architecture. Nothing about your jobs, clients, or schedules sits on Tradesmatic's servers.",
  },
  {
    icon: Cog6ToothIcon,
    title: "Multi-Trades™ MCP Server",
    body: "One proprietary connective layer across every supported platform and trade. Same questions work whether you run Spectora, ISN, ServiceTitan, Housecall Pro, or Jobber.",
  },
  {
    icon: ClipboardDocumentCheckIcon,
    title: "Business context that sticks",
    body: "A short onboarding profile (services, team, goals, seasonality) means advisors read February as February, not a bad June. You never re-explain your business in a new session.",
  },
];

const PILLARS = [
  {
    icon: ClipboardDocumentCheckIcon,
    title: "Decision-making platform, not a connector",
    body: "The connection is plumbing. You buy judgment: deep insights, better decisions, and data-backed actions.",
  },
  {
    icon: CircleStackIcon,
    title: "Real-time, not exported",
    body: "The number you see is the number in your system right now. No CSVs, no copy-paste, no snapshots.",
  },
  {
    icon: UserGroupIcon,
    title: "A team, not a tool",
    body: "Seven advisor roles, one shared context. Finance sees the same week operations sees, so advice never contradicts itself.",
  },
  {
    icon: WrenchScrewdriverIcon,
    title: "Answers and action",
    body: "Insight that stops at “interesting” wastes your evening. Advisors pair each answer with real data and a clear next step — with your say-so.",
  },
];

export function Features() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Features"
        title="Everything you need to turn data into decisions."
        lede="Tradesmatic connects Spectora, ISN, ServiceTitan, Housecall Pro, and Jobber to Claude, ChatGPT, and Gemini in real time. Tradesmatic is a decision-making platform that delivers deep insights and data-backed actions inside the AI you already use — through our proprietary Multi-Trades™ MCP Server."
      />

      <section className="mx-auto w-full max-w-6xl px-4 pb-14">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <IconTile key={f.title} icon={f.icon} title={f.title} body={f.body} />
          ))}
        </div>
      </section>

      <section className="border-t bg-muted/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-14">
          <SectionHeading
            eyebrow="Pillars"
            title="Four commitments underneath"
          />
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {PILLARS.map((p) => (
              <IconTile
                key={p.title}
                icon={p.icon}
                title={p.title}
                body={p.body}
              />
            ))}
          </div>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button variant="outline" asChild>
              <Link to="/advisors">Meet your AI advisor team</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/how-it-works">See how Tradesmatic works in four steps</Link>
            </Button>
          </div>
        </div>
      </section>

      <TrustCallout />

      <CtaBand
        title="See what your numbers say"
        body="Start your free 30-day trial — no credit card required. Connect in under 5 minutes and ask your first question today."
      />
    </MarketingLayout>
  );
}
