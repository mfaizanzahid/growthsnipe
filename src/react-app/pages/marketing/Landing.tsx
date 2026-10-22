import { Link } from "react-router-dom";
import {
  BellAlertIcon,
  BoltIcon,
  BugAntIcon,
  BuildingOfficeIcon,
  ChartBarIcon,
  ChatBubbleLeftRightIcon,
  ClipboardDocumentCheckIcon,
  Cog6ToothIcon,
  CurrencyDollarIcon,
  ExclamationTriangleIcon,
  HomeModernIcon,
  LinkIcon,
  MegaphoneIcon,
  UserGroupIcon,
  UsersIcon,
  WrenchIcon,
} from "@heroicons/react/24/outline";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import {
  AdvisorHub,
  BarsChart,
  BriefingMockup,
  CtaBand,
  DonutChart,
  Eyebrow,
  HeroBackdrop,
  IconTile,
  SectionHeading,
  StatBand,
  Testimonial,
  TrendChart,
  TrustCallout,
} from "../../components/marketing/MarketingBits";

const STEPS = [
  {
    title: "Connect your software",
    body: "Link Spectora, ISN, ServiceTitan, Housecall Pro, or Jobber to Tradesmatic. Secure connection; nothing migrates.",
  },
  {
    title: "Add business context",
    body: "A short profile — services, team, goals, seasonality — so every insight is specific to your business, not generic.",
  },
  {
    title: "Connect your AI",
    body: "Plug the Multi-Trades™ MCP Server into Claude, ChatGPT, or Gemini. A copy-paste configuration turns your existing AI subscription into a business-aware advisor team.",
  },
  {
    title: "Ask and act",
    body: "Ask questions, receive scheduled briefings, and take permissioned actions in your connected software — all backed by real-time data.",
  },
];

const DECIDE_CARDS = [
  {
    question: "“How did we do this week?”",
    chart: <TrendChart />,
    chartClassName: "h-36 w-full",
    answer: "Revenue climbed — and the dip mid-month is the one you acted on.",
    evidence: "38 jobs, revenue by week",
  },
  {
    question: "“Which referrals are drying up?”",
    chart: <BarsChart />,
    chartClassName: "h-36 w-full",
    answer: "Realtor flow dropped. One call gets it back on track.",
    evidence: "41 leads, broken down by source",
  },
  {
    question: "“Where's the next job most likely to come from?”",
    chart: <DonutChart />,
    chartClassName: "mx-auto size-36",
    answer: "Repeat clients — that's where to spend your follow-up time.",
    evidence: "Revenue, by source",
  },
];

const PROBLEM_CARDS = [
  {
    title: "A slow month you can't explain",
    body: "Revenue dips and the only explanation is gut feel. The real answer is in your jobs data — if you had time to dig it out.",
  },
  {
    title: "Referral data you never compare",
    body: "Agent, repeat, and online leads live in different corners of your software. Nobody lines them up, so fading sources go unnoticed.",
  },
  {
    title: "Trouble that surfaces as a review",
    body: "A callback pattern or unhappy customer builds quietly for weeks — until it appears as a one-star review you can't undo.",
  },
];

const FEATURES_PREVIEW = [
  {
    icon: ChatBubbleLeftRightIcon,
    title: "Ask in the AI you already use",
    body: "Ask Claude, ChatGPT, and Gemini a plain question and get an answer built from your real numbers — real data, not guesses.",
  },
  {
    icon: BellAlertIcon,
    title: "Scheduled owner briefings",
    body: "Morning Briefing, Weekly Review, and Monthly Review arrive in your inbox: what changed, what needs attention, what to do next.",
  },
  {
    icon: UserGroupIcon,
    title: "A full specialist team",
    body: "Seven advisors covering ownership, finance, operations, revenue, customers, marketing, and quality — without adding headcount.",
  },
  {
    icon: ClipboardDocumentCheckIcon,
    title: "Data-backed actions",
    body: "Flag a follow-up, tag a record, or nudge a schedule directly in your connected software. You confirm before anything changes.",
  },
  {
    icon: Cog6ToothIcon,
    title: "Business context that sticks",
    body: "Your services, team, goals, and seasonality are saved once, so you never re-explain your business in a new session.",
  },
];

const ADVISOR_PREVIEW = [
  {
    icon: ClipboardDocumentCheckIcon,
    title: "Business Owner / CEO Advisor",
    body: "Your daily driver: what changed and the three things worth your attention today.",
  },
  {
    icon: CurrencyDollarIcon,
    title: "CFO / Performance Analyst",
    body: "Revenue, average ticket, service mix, and trend evidence — with the numbers shown, never vague.",
  },
  {
    icon: Cog6ToothIcon,
    title: "Operations Manager",
    body: "Scheduling health, open work, and capacity: where the week is slipping and how to recover it.",
  },
  {
    icon: ChartBarIcon,
    title: "Revenue Manager",
    body: "Pipeline, conversion, and pricing power: where the next dollar most likely comes from.",
  },
  {
    icon: UsersIcon,
    title: "Customer Intelligence Manager",
    body: "Who needs attention, who refers, and who is drifting — all backed by your real data.",
  },
  {
    icon: MegaphoneIcon,
    title: "Marketing / Channel Analyst",
    body: "Which referral sources and channels are earning their keep, and which are fading.",
  },
  {
    icon: ExclamationTriangleIcon,
    title: "Quality / Risk Manager",
    body: "Complaint and callback patterns, surfaced before they become a bad review or a lost account.",
  },
];

const INTEGRATIONS = [
  {
    name: "Spectora",
    slug: "spectora",
    body: "Read your inspections, clients, agents, and events in real time.",
  },
  {
    name: "Inspection Support Network (ISN)",
    slug: "isn",
    body: "Read your orders, clients, agents, and events in real time.",
  },
  {
    name: "ServiceTitan",
    slug: "servicetitan",
    body: "Read your jobs, clients, agents, and events in real time.",
  },
  {
    name: "Housecall Pro",
    slug: "housecall-pro",
    body: "Read your jobs, clients, agents, and events in real time.",
  },
  {
    name: "Jobber",
    slug: "jobber",
    body: "Read your jobs, clients, agents, and events in real time.",
  },
];

const TRADE_CARDS = [
  {
    icon: HomeModernIcon,
    title: "Home inspectors",
    body: "On Spectora or ISN. Diagnose a slow month, track agent referrals, and protect your reputation — before review season tells you.",
    to: "/who-we-help/home-inspectors",
  },
  {
    icon: Cog6ToothIcon,
    title: "HVAC contractors",
    body: "Ticket mix, maintenance agreements, and crew capacity in one morning view.",
    to: "/who-we-help/hvac-contractors",
  },
  {
    icon: WrenchIcon,
    title: "Plumbing contractors",
    body: "Average ticket, add-on quoting, and repeat-client follow-up without digging through reports.",
    to: "/who-we-help/plumbing-contractors",
  },
  {
    icon: BoltIcon,
    title: "Electrical contractors",
    body: "Scheduling health, quoting conversion, and which jobs actually earn their keep.",
    to: "/who-we-help/electrical-contractors",
  },
  {
    icon: BuildingOfficeIcon,
    title: "Roofing contractors",
    body: "Pipeline, referral sources, and seasonal dips you can plan around instead of react to.",
    to: "/who-we-help/roofing-contractors",
  },
  {
    icon: UsersIcon,
    title: "General contractors",
    body: "Quotes, jobs, and invoices across trades, with the three decisions that matter today on top.",
    to: "/who-we-help/general-contractors",
  },
  {
    icon: BugAntIcon,
    title: "Pest control",
    body: "Route density, plan renewals, and customers quietly drifting away.",
    to: "/who-we-help/pest-control",
  },
];

export function Landing() {
  return (
    <MarketingLayout>
      <section className="relative overflow-hidden">
        <HeroBackdrop />
        <div className="mx-auto w-full max-w-6xl px-4 py-16 text-center sm:py-20">
          <Eyebrow>For home service businesses</Eyebrow>
          <h1 className="mx-auto max-w-4xl text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            Deep insights. Better decisions. Data-backed action.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Tradesmatic connects Claude, ChatGPT, and Gemini to your business software in real
            time — through our Multi-Trades™ MCP Server — so you get straight answers backed by
            your real numbers, and the ability to act on them.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" asChild>
              <Link to="/signup">Start your free 30-day trial</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/how-it-works">See how it works</Link>
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            30-day free trial · No card required
          </p>
          <div className="mx-auto mt-12 max-w-3xl">
            <BriefingMockup />
          </div>
        </div>
      </section>

      <StatBand
        stats={[
          { value: "<5 min", label: "to connect" },
          { value: "7", label: "specialist advisors" },
          { value: "30 days", label: "free trial, no card" },
          { value: "1000+", label: "businesses connected" },
        ]}
      />

      <section className="border-t bg-muted/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-14">
          <SectionHeading
            eyebrow="The problem"
            title="You already pay for AI, and it still knows nothing about your business"
            body="Your answers are sitting in Spectora, ISN, ServiceTitan, Housecall Pro, or Jobber the whole time. Claude, ChatGPT, and Gemini start every session from zero — no revenue, no referral mix, no slow season — so you get generic advice and do the analysis yourself, after hours."
          />
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {PROBLEM_CARDS.map((c) => (
              <Card key={c.title}>
                <CardHeader>
                  <CardTitle className="text-base">{c.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>{c.body}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-14">
        <SectionHeading
          eyebrow="The solution"
          title="Your business software, connected to the AI you already use"
          body="Tradesmatic is a decision-making platform for owner-operated home service businesses. Through the Multi-Trades™ MCP Server, it gives Claude, ChatGPT, and Gemini real-time access to your jobs, clients, agents, and events — so you get deep insights, decision-ready answers, and data-backed actions inside the AI tool you already use. Nothing to migrate. Nothing to re-learn."
        />
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {DECIDE_CARDS.map((c) => (
            <Card key={c.question}>
              <CardHeader>
                <CardTitle className="text-base">{c.question}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`flex items-center justify-center rounded-lg border bg-muted/40 px-4 ${c.chartClassName ?? ""}`}>
                  {c.chart}
                </div>
                <p className="mt-3 text-sm font-medium">{c.answer}</p>
                <p className="mt-1 text-xs text-muted-foreground">{c.evidence}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-t bg-muted/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-14">
          <SectionHeading
            eyebrow="Features"
            title="Every answer pulled real-time — never stale, never guessed"
            body="One connected view of your business, with answers you can trust because they come from your connected software."
          />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES_PREVIEW.map((f) => (
              <IconTile key={f.title} icon={f.icon} title={f.title} body={f.body} />
            ))}
          </div>
          <div className="mt-8 text-center">
            <Button variant="outline" asChild>
              <Link to="/features">See all features</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-14">
        <SectionHeading
          eyebrow="Advisors"
          title="A full specialist team working from your real, live data"
          body="Seven advisors covering ownership priorities, financial performance, operations, revenue, customers, marketing, and quality — the analysis of a CFO, ops manager, and marketing analyst, without adding headcount."
        />
        <div className="mx-auto mt-10 max-w-lg">
          <AdvisorHub />
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {ADVISOR_PREVIEW.map((a) => (
            <IconTile key={a.title} icon={a.icon} title={a.title} body={a.body} />
          ))}
        </div>
        <div className="mt-8 text-center">
          <Button variant="outline" asChild>
            <Link to="/advisors">Meet all seven advisors</Link>
          </Button>
        </div>
      </section>

      <section className="border-t bg-muted/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-14">
          <SectionHeading
            eyebrow="How it works"
            title="From real-time data to real-world action — in four steps"
            body="Connect your software. Add the context only you know. Connect your AI. Get insights you can act on."
          />
          {/* <StepsConnector /> */}
          <div className="mt-8 grid gap-4 md:grid-cols-4">
            {STEPS.map((s, i) => (
              <Card key={s.title}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                      {i + 1}
                    </span>
                    {s.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>{s.body}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Button variant="outline" asChild>
              <Link to="/how-it-works">How it works</Link>
            </Button>
          </div>
        </div>
      </section>

      <TrustCallout />

      <section className="mx-auto w-full max-w-6xl px-4 py-14">
        <SectionHeading
          eyebrow="Integrations"
          title="Sits on top of your software"
          body="Tradesmatic connects Spectora, ISN, ServiceTitan, Housecall Pro, and Jobber to Claude, ChatGPT, and Gemini in real time. Reads it live. Replaces nothing."
        />
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {INTEGRATIONS.map((p) => (
            <Card key={p.name}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <LinkIcon className="size-5 text-primary" aria-hidden />
                  <Link className="hover:underline" to={`/integrations/${p.slug}`}>
                    {p.name}
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>{p.body}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Button variant="outline" asChild>
            <Link to="/integrations">Explore integrations</Link>
          </Button>
        </div>
      </section>

      <section className="border-t bg-muted/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-14">
          <SectionHeading
            eyebrow="Who we help"
            title="Built for owner-operators"
            body="Tradesmatic is built for the people who run the business and make the calls — inspectors and contractors who want decisions backed by real numbers."
          />
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {TRADE_CARDS.map((t) => (
              <Link key={t.title} to={t.to} className="rounded-xl focus-visible:outline-2">
                <IconTile icon={t.icon} title={t.title} body={t.body} />
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-14">
        <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-3 text-center">
          <BellAlertIcon className="size-8 text-primary" aria-hidden />
          <h2 className="text-2xl font-bold tracking-tight">One account. Plans that fit.</h2>
          <p className="max-w-2xl text-muted-foreground">
            Plans that fit a one-truck shop or a growing crew. Start with a 30-day free trial —
            no card required. Annual billing means 2 months free. Live plans and current prices
            are always shown on the pricing page.
          </p>
          <Button variant="outline" asChild>
            <Link to="/pricing">See pricing</Link>
          </Button>
        </div>
      </section>

      <section className="border-t bg-muted/40">
        <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-3 px-4 py-14 text-center">
          <UserGroupIcon className="size-8 text-primary" aria-hidden />
          <h2 className="text-2xl font-bold tracking-tight">
            Built by people who have sat in the room with owners like you
          </h2>
          <p className="max-w-2xl text-muted-foreground">
            The Tradesmatic team spent 15 years running a digital agency serving home service
            businesses — and kept seeing the same disconnect: good software and good AI tools,
            with no connection between them. Tradesmatic is the connection we kept wishing
            existed.
          </p>
          <Button variant="outline" asChild>
            <Link to="/about">How the Tradesmatic team works</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-14">
        <SectionHeading eyebrow="Owners" title="Built for owners like you" />
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <Testimonial
            quote="My best agent's bookings had slipped from four jobs a month to one before I noticed. The briefing flagged it, I made one call, and he's back to a full schedule."
            name="Ray Dempsey"
            detail="Owner, Carolina Home Inspections"
          />
          <Testimonial
            quote="Our add-on rate was drifting down and I couldn't see why. The data showed where quoting was leaking; six weeks after fixing it, ticket size is up 9%."
            name="Dana Kowalski"
            detail="Owner, Rocky Mountain Plumbing & Heating"
          />
          <Testimonial
            quote="Setup took fifteen minutes. My first briefing told me what to do, and I'd acted on two items before lunch."
            name="Marcus Torres"
            detail="Owner, Gulf Coast Electrical"
          />
        </div>
      </section>

      <CtaBand
        title="Your AI, plugged into your numbers"
        body="Connect your software, add your context, and start asking questions the AI you already use can actually answer."
      />
    </MarketingLayout>
  );
}
