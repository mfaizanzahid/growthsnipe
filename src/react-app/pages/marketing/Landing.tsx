import { Link } from "react-router-dom";
import {
  ArrowTrendingUpIcon,
  BoltIcon,
  ChartBarSquareIcon,
  ChatBubbleLeftRightIcon,
  ClockIcon,
  CurrencyDollarIcon,
  MegaphoneIcon,
  PhoneArrowUpRightIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import {
  CtaBand,
  Eyebrow,
  HeroBackdrop,
  IconTile,
  SectionHeading,
  StatBand,
  Testimonial,
} from "../../components/marketing/MarketingBits";

const PILLARS = [
  {
    letter: "S",
    name: "Size the Gap",
    body: "We put a dollar figure on the missed calls, slow replies, and low tickets before we sell you anything.",
  },
  {
    letter: "N",
    name: "Net-Ticket Architecture",
    body: "Three-tier packages and add-on prompts that raise average ticket without discounting your work.",
  },
  {
    letter: "I",
    name: "Instant Capture",
    body: "Live answer, Voice AI fallback, and a speed-to-lead target under five minutes, every hour.",
  },
  {
    letter: "P",
    name: "Pipeline Engine",
    body: "Paid ads, landing pages, and realtor outreach judged on one number: cost per booked inspection.",
  },
  {
    letter: "E",
    name: "Expand and Evaluate",
    body: "A weekly scorecard, capacity triggers, and a plan you can see working in the calendar.",
  },
];

const LEAKS = [
  {
    icon: PhoneArrowUpRightIcon,
    title: "Missed calls during inspections",
    body: "A call that rings out during a crawl space is a booked job that goes to the next inspector. We size that loss in dollars, then cover it.",
  },
  {
    icon: CurrencyDollarIcon,
    title: "Add-ons offered inconsistently",
    body: "Radon, mold, and sewer scope get mentioned when someone remembers. A consistent ticket ladder fixes the leak without raising the base fee.",
  },
  {
    icon: ChartBarSquareIcon,
    title: "Revenue depends on a few realtors",
    body: "When two agents go quiet, the month goes with them. The Partner Flywheel builds a wider base instead of hoping the phone rings.",
  },
  {
    icon: ClockIcon,
    title: "No number for a booked inspection",
    body: "Clicks and leads are not jobs. We report cost per booked inspection, answer rate, and speed to lead in one weekly scorecard.",
  },
];

const STEPS = [
  { title: "We find the leak", body: "A 12-month data teardown and a Leak Map that sizes each gap in dollars." },
  { title: "We build the plan", body: "A Snipe Blueprint covering ticket, capture, pipeline, partners, and capacity." },
  { title: "We launch in 21 days", body: "Booking software, CRM, phones, Voice AI, ads, and tracking go live." },
  { title: "We run and measure it", body: "Weekly scorecard, strategy calls, and paid media judged on booked jobs." },
];

export function Landing() {
  return (
    <MarketingLayout>
      <section className="relative overflow-hidden">
        <HeroBackdrop />
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <Eyebrow>Plan plus operator</Eyebrow>
            <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
              We find the leak, fix it, and show you the booked jobs.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
              GrowthSnipe is a productized growth company for owner-operated home-service
              businesses. We size the gap in dollars, design the plan, then build and run the
              system that carries it out.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" asChild>
                <Link to="/signup">Start SNIPE Intelligence™ free</Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/contact">Get your free Leak Scorecard</Link>
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              30-day trial, no card required. Or book a discovery call and we will size the gap first.
            </p>
          </div>
        </div>
      </section>

      <StatBand
        stats={[
          { value: "< 5 min", label: "Speed-to-lead target" },
          { value: "90%+", label: "Answer rate target" },
          { value: "21 days", label: "Launch runway" },
          { value: "1 scorecard", label: "Booked jobs, not clicks" },
        ]}
      />

      <section className="mx-auto w-full max-w-6xl px-4 py-16">
        <SectionHeading
          eyebrow="The leak problem"
          title="Most owners do not have a leads problem. They have a leak problem."
          body="The money is already coming in. It leaks out through the phone, the ticket, and the follow-up. We find each leak and put a number on it."
        />
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {LEAKS.map((leak) => (
            <IconTile key={leak.title} icon={leak.icon} title={leak.title} body={leak.body} />
          ))}
        </div>
      </section>

      <section className="border-t bg-muted/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-16">
          <SectionHeading
            eyebrow="The SNIPE System"
            title="Five pillars. One operating system."
            body="Every engagement runs on the same method, so the work survives staff changes and platform changes."
          />
          <div className="mt-10 grid gap-4 md:grid-cols-5">
            {PILLARS.map((p) => (
              <Card key={p.letter} className="flex flex-col">
                <CardHeader>
                  <span className="text-3xl font-bold text-primary">{p.letter}</span>
                  <CardTitle className="text-base">{p.name}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{p.body}</CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-16">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <SectionHeading
              eyebrow="SNIPE Intelligence™"
              title="One weekly scorecard built from the software you already run."
              body="SNIPE Intelligence™ is the analytics layer: it reads your booking platform, CRM, phones, and ad accounts and turns them into one scorecard, forecasts, and custom reports."
            />
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild>
                <Link to="/features">See what it measures</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/pricing">Start the trial</Link>
              </Button>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <IconTile
              icon={ChartBarSquareIcon}
              title="Weekly scorecard"
              body="Booked jobs, average ticket, answer rate, and lead source in one place."
            />
            <IconTile
              icon={ArrowTrendingUpIcon}
              title="Forecasting"
              body="See the month before it happens, then compare plan to actual every week."
            />
            <IconTile
              icon={SparklesIcon}
              title="SNIPE VoiceIQ™"
              body="Every recorded call audited against four conversion indicators, with alerts when a call slips."
            />
            <IconTile
              icon={ShieldCheckIcon}
              title="Your accounts stay yours"
              body="You own every ad account and data source. Disconnect any time."
            />
          </div>
        </div>
      </section>

      <section className="border-y bg-muted/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-16">
          <SectionHeading
            eyebrow="Paid ads that book"
            title="We judge campaigns on cost per booked inspection."
            body="Ads are the fastest lever for new inspection bookings, so first campaigns go live inside the 21-day runway. One funnel: ad, geo landing page, tracking number, live answer or Voice AI, booking from the real calendar."
          />
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <IconTile
              icon={MegaphoneIcon}
              title="The right channels"
              body="Google Search and Maps, Local Services Ads where available, Meta retargeting, and agent outreach on Command."
            />
            <IconTile
              icon={BoltIcon}
              title="Scale on proof"
              body="Raise budget about 20% when cost per booked inspection holds under target for two weeks and the calendar has capacity."
            />
            <IconTile
              icon={CurrencyDollarIcon}
              title="Stop the losers"
              body="Pause a campaign that spends twice the target cost and books nothing. No vanity metrics."
            />
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-16">
        <SectionHeading
          eyebrow="The 21-day launch runway"
          title="From access to live system in three weeks."
          body="Technical ingestion, booking platform overhaul, GoHighLevel and telephony, then launch and verification. Optimize and ramp from day 22."
        />
        <div className="mt-10 grid gap-4 md:grid-cols-4">
          {STEPS.map((s, i) => (
            <Card key={s.title}>
              <CardHeader>
                <span className="text-sm font-semibold text-primary">Step {i + 1}</span>
                <CardTitle className="text-base">{s.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{s.body}</CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-t bg-muted/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-16">
          <SectionHeading
            eyebrow="Proof"
            title="Operators who stopped guessing"
            body="Illustrative customer stories from owner-operated inspection firms."
          />
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <Testimonial
              quote="They found $4,800 a month in missed calls before we signed anything. That number made the decision easy."
              name="Marcus Hale"
              detail="Owner, Hale Home Inspections"
            />
            <Testimonial
              quote="Our average ticket moved because every inspector finally offered the same add-ons. No discounting, just consistency."
              name="Dana Whitfield"
              detail="Owner, Whitfield Property Inspections"
            />
            <Testimonial
              quote="The scorecard is the first report I actually read. It tells me what to do, not just what happened."
              name="Luis Ortega"
              detail="Owner, Ortega Inspection Group"
            />
          </div>
          <div className="mt-8 text-center">
            <Button variant="outline" asChild>
              <Link to="/case-studies">Read the case studies</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-16">
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ChatBubbleLeftRightIcon className="size-5 text-primary" />
                Start with the scorecard
              </CardTitle>
              <CardDescription>
                A free Revenue Leak Scorecard and a 30-day SNIPE Intelligence™ trial. See the gap in dollars before you commit to anything.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link to="/contact">Get the free scorecard</Link>
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserGroupIcon className="size-5 text-primary" />
                Or have us run it
              </CardTitle>
              <CardDescription>
                Engine Core and Engine Command are plan-plus-operator engagements. We build the system, launch it in 21 days, then run it with your team or ours.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" asChild>
                <Link to="/pricing">See the Engine plans</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      <CtaBand
        title="Growth, with the math done"
        body="Start the free trial or book a discovery call. We will show you the leak before we ask for a card."
      />
    </MarketingLayout>
  );
}
