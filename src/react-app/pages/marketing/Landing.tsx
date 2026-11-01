import { Link } from "react-router-dom";
import {
  ArrowTrendingUpIcon,
  BoltIcon,
  ChartBarSquareIcon,
  ChatBubbleLeftRightIcon,
  CurrencyDollarIcon,
  MegaphoneIcon,
  SparklesIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import {
  CtaBand,
  IconTile,
  PageHero,
  SectionHeading,
  StatBand,
  Testimonial,
  TrustCallout,
} from "../../components/marketing/MarketingBits";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { OFFERS, OFFER_CREDITS } from "../../../lib/offers";

const LEAKS = [
  {
    icon: ChatBubbleLeftRightIcon,
    title: "Missed opportunities",
    body: "Calls, forms and messages that do not receive a timely response.",
  },
  {
    icon: ArrowTrendingUpIcon,
    title: "Weak conversion",
    body: "Enquiries that never become scheduled work.",
  },
  {
    icon: CurrencyDollarIcon,
    title: "Low job value",
    body: "Services and add-ons that are not packaged or presented clearly.",
  },
  {
    icon: UserGroupIcon,
    title: "No second sale",
    body: "Customers who could return but are never given a reason or reminder.",
  },
  {
    icon: MegaphoneIcon,
    title: "Dormant relationships",
    body: "Referral partners and previous customers who quietly stop sending work.",
  },
  {
    icon: ChartBarSquareIcon,
    title: "Blind spots",
    body: "Reports that show marketing activity but not the complete path to booked revenue.",
  },
];

const PILLARS = [
  { letter: "S", name: "Size the Gap", body: "Set the target and quantify the distance between current performance and the goal." },
  { letter: "N", name: "Net-Ticket Architecture", body: "Improve the value of each booked job through thoughtful packages and add-ons." },
  { letter: "I", name: "Instant Capture", body: "Respond, qualify and route opportunities before they go cold." },
  { letter: "P", name: "Pipeline Engine", body: "Build the paid, local, referral and authority channels that create demand." },
  { letter: "E", name: "Expand and Evaluate", body: "Create repeat revenue, plan capacity and keep performance accountable." },
];

export function Landing() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="For owner-operated home-service businesses ready to grow"
        title="More than leads. Build a business that turns demand into booked work."
        lede="You do not need another marketing vendor sending you a report full of clicks. You need a growth system that knows what the business is trying to achieve, captures every opportunity it can, follows up properly and shows you what is working."
      />
      <section className="mx-auto w-full max-w-6xl px-4 pb-14">
        <p className="mx-auto max-w-2xl text-center text-muted-foreground">
          GrowthSnipe works out the numbers, builds the plan, installs the system and helps run the follow-through, from first enquiry to booked job and repeat customer.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button size="lg" asChild>
            <Link to="/book">Book a Free Growth Fit Call</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link to="/loop-library">Get the Free Loop Library</Link>
          </Button>
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          20 minutes. No obligation. We will determine whether a Diagnostic, Blueprint or managed growth partnership is the right next step.
        </p>
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
          title="Your next stage of growth may not need more leads. It may need fewer leaks."
          body="A lead comes in while you are on a job. The phone rings again. A quote sits untouched. A past customer never hears from you. A referral partner forgets to send the next opportunity. Meanwhile, the ad report says the campaign is performing. That is the gap between lead generation and business growth."
        />
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {LEAKS.map((leak) => (
            <IconTile key={leak.title} icon={leak.icon} title={leak.title} body={leak.body} />
          ))}
        </div>
        <p className="mx-auto mt-8 max-w-2xl text-center text-muted-foreground">
          More traffic into a leaking system creates more waste. We fix the system and then scale the channels that make economic sense.
        </p>
        <div className="mt-6 text-center">
          <Button asChild>
            <Link to="/diagnostic">Find the Leaks in Your Growth System</Link>
          </Button>
        </div>
      </section>

      <section className="border-t bg-muted/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-16">
          <SectionHeading
            eyebrow="What GrowthSnipe does"
            title="One partner. Three moves. A connected growth system."
          />
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <span className="text-sm font-semibold text-primary">01 — Plan</span>
                <CardTitle className="text-base">Know what growth actually requires.</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                We study your business, establish the baseline, identify the constraints and reverse-engineer the target. Deliverable: SNIPE Diagnostic and SNIPE Blueprint.
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <span className="text-sm font-semibold text-primary">02 — Install</span>
                <CardTitle className="text-base">Put the growth infrastructure in place.</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                We configure the customer journey, CRM, call handling, follow-up workflows, revenue loops, tracking and reporting. Deliverable: SNIPE CRM™, SNIPE VoiceIQ™, SNIPE Intelligence™ and the configured growth workflows.
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <span className="text-sm font-semibold text-primary">03 — Run</span>
                <CardTitle className="text-base">Keep the system moving and improving.</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                We help operate acquisition, intake, follow-up, partner activity, retention and performance reviews. Deliverable: SNIPE Engine Core or SNIPE Engine Command.
              </CardContent>
            </Card>
          </div>
          <div className="mt-8 text-center">
            <Button variant="outline" asChild>
              <Link to="/how-it-works">See How It Works</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-16">
        <SectionHeading
          eyebrow="Pick your trade"
          title="Built around the way your trade wins work."
          body="The growth system stays consistent. The campaigns, customer journeys, booking logic and revenue opportunities are adapted to your business model."
        />
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <IconTile icon={SparklesIcon} title="Home Inspectors" body="Grow agent relationships, improve booking capture and build value around the inspection, not just the base fee." />
          <IconTile icon={BoltIcon} title="HVAC" body="Turn urgent demand, estimates and seasonal service into a stronger booking and maintenance pipeline." />
          <IconTile icon={ChatBubbleLeftRightIcon} title="Plumbing" body="Capture high-intent calls, improve dispatch-ready intake and create more value from every customer relationship." />
          <IconTile icon={BoltIcon} title="Electrical" body="Build a predictable flow of residential and commercial enquiries, estimates and follow-up." />
          <IconTile icon={MegaphoneIcon} title="Roofing" body="Turn inspections and estimates into a structured pipeline with persistent follow-up and referral development." />
          <IconTile icon={UserGroupIcon} title="General Contractors" body="Create a repeatable process for qualifying, nurturing and converting high-value project opportunities." />
        </div>
        <div className="mt-8 text-center">
          <Button asChild>
            <Link to="/home-inspectors">Find Your Industry</Link>
          </Button>
        </div>
      </section>

      <section className="border-t bg-muted/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-16">
          <SectionHeading
            eyebrow="The SNIPE System"
            title="Growth is not one tactic. It is a system of connected decisions."
            body="The SNIPE System gives every growth plan a repeatable structure. Five pillars guide the work, from sizing the growth gap to expanding revenue and evaluating performance."
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
          <div className="mt-8 text-center">
            <Button variant="outline" asChild>
              <Link to="/snipe-system">Explore the SNIPE System</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-16">
        <SectionHeading
          eyebrow="Offers"
          title="Start with the step your business needs right now."
        />
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="text-base">Free Loop Library</CardTitle>
              <CardDescription>Free</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col text-sm text-muted-foreground">
              <p className="flex-1">Practical automation recipes, follow-up sequences, scripts and workflow ideas you can adapt to your business.</p>
              <Button className="mt-4" asChild><Link to="/loop-library">Get the Free Library</Link></Button>
            </CardContent>
          </Card>
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="text-base">SNIPE Diagnostic</CardTitle>
              <CardDescription>{OFFERS.diagnostic.price.label} one-time</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col text-sm text-muted-foreground">
              <p className="flex-1">A focused review of your last 12 months of business performance. Find the gaps, quantify the leaks and see where growth is getting stuck.</p>
              <Button className="mt-4" asChild><Link to="/diagnostic">Get the Diagnostic</Link></Button>
            </CardContent>
          </Card>
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="text-base">SNIPE Blueprint</CardTitle>
              <CardDescription>{OFFERS.blueprint.price.label} one-time</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col text-sm text-muted-foreground">
              <p className="flex-1">A personalized 12-month growth plan built around your numbers, market, services, capacity and goals.</p>
              <Button className="mt-4" asChild><Link to="/blueprint">Build My Blueprint</Link></Button>
            </CardContent>
          </Card>
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="text-base">SNIPE Engine</CardTitle>
              <CardDescription>From {OFFERS.engineCore.monthly.label}/month</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col text-sm text-muted-foreground">
              <p className="flex-1">The implementation and operating partnership that puts the plan to work. Choose Core or Command.</p>
              <Button className="mt-4" variant="outline" asChild><Link to="/engine">Compare Engine Plans</Link></Button>
            </CardContent>
          </Card>
        </div>
        <p className="mx-auto mt-6 max-w-2xl text-center text-xs text-muted-foreground">
          {OFFER_CREDITS.diagnosticToBlueprint.text} {OFFER_CREDITS.blueprintToEngine.text} Terms apply.
        </p>
      </section>

      <section className="border-t bg-muted/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-16">
          <SectionHeading
            eyebrow="Illustration"
            title="A small improvement in the booking process can change the monthly picture."
            body="Assume a business completes 12 additional jobs in a month and its average completed job value is $500. That represents $6,000 in additional gross revenue before advertising, labor, materials, overhead, fees, refunds or other costs. The point is not that every business will add 12 jobs. The point is to work backward from your own booking rate, average ticket, capacity and customer economics before deciding where to invest."
          />
          <div className="mt-8 text-center">
            <Button asChild>
              <Link to="/book">See What the Numbers Say About My Business</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-16">
        <SectionHeading
          eyebrow="Engine overview"
          title="The plan is only the beginning. The system has to run."
          body="SNIPE Engine brings the plan, marketing, CRM, call coverage, follow-up and analytics into one ongoing partnership."
        />
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="text-base">Engine Core</CardTitle>
              <CardDescription>
                {OFFERS.engineCore.setup.label} setup + {OFFERS.engineCore.monthly.label}/month
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col text-sm text-muted-foreground">
              <p className="flex-1">For owner-led businesses with someone on their team who can handle live calls and callbacks. Your team answers first, Voice AI provides fallback coverage when they cannot.</p>
              <Button className="mt-4" variant="outline" asChild><Link to="/engine">Compare Core and Command</Link></Button>
            </CardContent>
          </Card>
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="text-base">Engine Command</CardTitle>
              <CardDescription>
                {OFFERS.engineCommand.setup.label} setup + {OFFERS.engineCommand.monthly.label}/month
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col text-sm text-muted-foreground">
              <p className="flex-1">For businesses ready to delegate more of intake, booking, admin and growth follow-up. Our live team answers first, Voice AI provides fallback coverage.</p>
              <Button className="mt-4" variant="outline" asChild><Link to="/engine">Compare Core and Command</Link></Button>
            </CardContent>
          </Card>
        </div>
        <p className="mx-auto mt-6 max-w-2xl text-center text-xs text-muted-foreground">
          Both plans include a 21-day launch runway as part of setup. Advertising spend is paid directly by the client.
        </p>
      </section>

      <section className="border-t bg-muted/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-16">
          <SectionHeading
            eyebrow="Proof"
            title="See the thinking behind the system."
            body="Explore sample growth breakdowns, example dashboards and the decisions a SNIPE plan is designed to make visible."
          />
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <Testimonial
              quote="They found $4,800 a month in missed calls before we signed anything. That number made the decision easy."
              name="Marcus Hale"
              detail="Owner, Hale Home Inspections (illustrative)"
            />
            <Testimonial
              quote="Our average ticket moved because every inspector finally offered the same add-ons. No discounting, just consistency."
              name="Dana Whitfield"
              detail="Owner, Whitfield Property Inspections (illustrative)"
            />
            <Testimonial
              quote="The scorecard is the first report I actually read. It tells me what to do, not just what happened."
              name="Luis Ortega"
              detail="Owner, Ortega Inspection Group (illustrative)"
            />
          </div>
          <div className="mt-8 text-center">
            <Button variant="outline" asChild>
              <Link to="/case-studies">Explore Case Studies</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-16">
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SparklesIcon className="size-5 text-primary" />
                Start with the scorecard
              </CardTitle>
              <CardDescription>
                A free Revenue Leak Scorecard. See the gap in dollars before you commit to anything.
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
                <Link to="/engine">See the Engine plans</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      <TrustCallout />

      <CtaBand
        title="Stop guessing where the next stage of growth will come from."
        body="Start with a 20-minute Growth Fit Call. We will learn how your business wins work today, where the process feels stuck and which next step makes sense. No pressure to buy. If the fit is not right, we will tell you."
      />
    </MarketingLayout>
  );
}
