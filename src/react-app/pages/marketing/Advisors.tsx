import { Link } from "react-router-dom";
import {
  BriefcaseIcon,
  ChartBarIcon,
  ClipboardDocumentCheckIcon,
  CurrencyDollarIcon,
  MegaphoneIcon,
  ShieldExclamationIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import {
  CtaBand,
  PageHero,
  Testimonial,
  TrustCallout,
} from "../../components/marketing/MarketingBits";

const ADVISORS = [
  {
    icon: BriefcaseIcon,
    name: "Business Owner / CEO Advisor",
    tag: "Your daily driver",
    body: "What changed since yesterday, and the three things worth attention today. Ask: “What should I focus on today?” Backed by real data, not gut feel.",
    ask: "“What should I focus on today?”",
  },
  {
    icon: ChartBarIcon,
    name: "CFO / Performance Analyst",
    tag: "Revenue, average ticket, service mix, trends",
    body: "Shows the numbers behind the numbers — and never calls revenue “profit” without the breakdown to prove it. Ask: “Why was last month slower?”",
    ask: "“Why was last month slower?”",
  },
  {
    icon: ClipboardDocumentCheckIcon,
    name: "Operations Manager",
    tag: "Scheduling health, open work, capacity, follow-through",
    body: "Overdue visits, unconfirmed bookings, follow-ups nobody closed. Ask: “What is slipping this week?”",
    ask: "“What is slipping this week?”",
  },
  {
    icon: CurrencyDollarIcon,
    name: "Revenue Manager",
    tag: "Pipeline, conversion, pricing power",
    body: "Where quotes stall and where the next dollar comes from, read from your order history. Ask: “Where is the next dollar?”",
    ask: "“Where is the next dollar?”",
  },
  {
    icon: UsersIcon,
    name: "Customer Intelligence Manager",
    tag: "Attention, referrals, drift",
    body: "Quiet clients and cooling referral ties flagged with real data behind each callout. Ask: “Which relationships need attention?”",
    ask: "“Which relationships need attention?”",
  },
  {
    icon: MegaphoneIcon,
    name: "Marketing / Channel Analyst",
    tag: "Channel and referral-source performance",
    body: "Which referral sources and channels produce paying work — and which just produce activity. Ask: “Which sources are slipping?”",
    ask: "“Which sources are slipping?”",
  },
  {
    icon: ShieldExclamationIcon,
    name: "Quality / Risk Manager",
    tag: "Patterns before they become reviews",
    body: "Complaint and callback patterns surfaced while still fixable, before they cost a review or an account. Ask: “Anything in recent jobs worry you?”",
    ask: "“Anything in recent jobs worry you?”",
  },
];

export function Advisors() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="AI advisors"
        title="Meet your team."
        lede="Tradesmatic connects Spectora, ISN, ServiceTitan, Housecall Pro, and Jobber to Claude, ChatGPT, and Gemini in real time. A full specialist team working from your real-time data — inside the AI you already use, through our Multi-Trades™ MCP Server."
      />

      <section className="mx-auto w-full max-w-6xl px-4 pb-14">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ADVISORS.map((a) => (
            <Card key={a.name} className="flex flex-col">
              <CardHeader>
                <span className="mb-2 flex size-10 items-center justify-center rounded-lg border bg-muted/50">
                  <a.icon className="size-5 text-primary" aria-hidden />
                </span>
                <CardTitle className="text-base">{a.name}</CardTitle>
                <CardDescription>{a.tag}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3">
                <CardDescription>{a.body}</CardDescription>
                <p className="mt-auto pt-2 text-sm font-medium">{a.ask}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-t bg-muted/40">
        <div className="mx-auto w-full max-w-4xl px-4 py-14 text-center">
          <h2 className="text-2xl font-bold tracking-tight">One context, seven viewpoints</h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            Finance sees the same week operations sees. Same live data, so advice never
            contradicts itself — and every answer carries real data behind it.
          </p>
          <h2 className="mt-10 text-2xl font-bold tracking-tight">Briefings in your inbox</h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            Morning, weekly, and monthly emails from the CEO Advisor: numbers, anomalies, what
            needs attention. Availability varies by plan — see our pricing plans for which plans
            include scheduled briefings.
          </p>
          <div className="mx-auto mt-8 max-w-md text-left">
            <Testimonial
              quote="It's the CFO I can't hire. When March looked slow, it walked me through why — a mix shift, not a demand problem — with the jobs right there to prove it."
              name="Sam Whitfield"
              detail="Owner, Whitfield Heating & Air"
            />
          </div>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button variant="outline" asChild>
              <Link to="/how-it-works">How the advisors get their real-time data</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/pricing">See plans that include briefings</Link>
            </Button>
          </div>
        </div>
      </section>

      <TrustCallout />

      <CtaBand
        title="Ask your first advisor today"
        body="Start your free 30-day trial — no credit card required."
      />
    </MarketingLayout>
  );
}
