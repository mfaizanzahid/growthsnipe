import { Link } from "react-router-dom";
import {
  ArrowTrendingUpIcon,
  BoltIcon,
  BuildingOffice2Icon,
  ChartBarSquareIcon,
  ChatBubbleLeftRightIcon,
  CurrencyDollarIcon,
  FireIcon,
  HomeIcon,
  HomeModernIcon,
  MegaphoneIcon,
  UserGroupIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import {
  CtaBand,
  Eyebrow,
  IconTile,
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
      <section className="relative overflow-hidden">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-14 sm:py-20 lg:grid-cols-2">
          <div>
            <Eyebrow>For owner-operated home-service businesses ready to grow</Eyebrow>
            <h1 className="max-w-xl text-4xl font-bold tracking-tight sm:text-5xl">
              More than leads. Build a business that turns demand into booked work.
            </h1>
            <p className="mt-4 max-w-xl text-lg text-muted-foreground">
              You do not need another vendor selling leads. You need one growth system that finds the leak, builds the plan, and runs the follow-through from first enquiry to booked work and repeat customers.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" asChild>
                <Link to="/book">Book a Free Growth Fit Call</Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to={OFFERS.diagnostic.checkoutPath}>Get My SNIPE Diagnostic™</Link>
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              20 minutes. No obligation. We will determine whether a Diagnostic, Blueprint or managed growth partnership is the right next step.
            </p>
          </div>
          <div className="mx-auto w-full max-w-md lg:max-w-none">
            <svg
              role="img"
              aria-label="Growth dashboard showing booked work climbing after leaks are fixed"
              viewBox="0 0 480 420"
              className="h-auto w-full"
            >
              <ellipse cx="240" cy="205" rx="208" ry="188" className="fill-primary/5" />
              <circle cx="356" cy="126" r="92" className="fill-primary/5" />

              <rect x="52" y="48" width="376" height="318" rx="20" className="fill-card stroke-border" strokeWidth="2" />
              <rect x="52" y="88" width="376" height="1.5" className="fill-border" />

              <circle cx="78" cy="68" r="5" className="fill-muted-foreground/30" />
              <circle cx="96" cy="68" r="5" className="fill-muted-foreground/30" />
              <circle cx="114" cy="68" r="5" className="fill-muted-foreground/30" />
              <rect x="140" y="61" width="96" height="14" rx="7" className="fill-muted" />

              <rect x="72" y="106" width="104" height="62" rx="12" className="fill-primary" />
              <rect x="86" y="120" width="48" height="12" rx="6" className="fill-primary-foreground/90" />
              <rect x="86" y="140" width="30" height="8" rx="4" className="fill-primary-foreground/50" />

              <rect x="184" y="106" width="104" height="62" rx="12" className="fill-muted" />
              <rect x="198" y="120" width="40" height="12" rx="6" className="fill-muted-foreground/40" />
              <rect x="198" y="140" width="26" height="8" rx="4" className="fill-muted-foreground/25" />

              <rect x="296" y="106" width="104" height="62" rx="12" className="fill-muted" />
              <rect x="310" y="120" width="44" height="12" rx="6" className="fill-muted-foreground/40" />
              <rect x="310" y="140" width="28" height="8" rx="4" className="fill-muted-foreground/25" />

              <g strokeDasharray="4 6" className="stroke-border">
                <line x1="72" y1="208" x2="408" y2="208" />
                <line x1="72" y1="244" x2="408" y2="244" />
                <line x1="72" y1="280" x2="408" y2="280" />
              </g>

              <path
                d="M 72 300 L 104 286 L 136 292 L 168 268 L 200 276 L 232 250 L 264 258 L 296 228 L 328 236 L 360 206 L 392 190 L 408 178 L 408 322 L 72 322 Z"
                className="fill-primary/10"
              />
              <path
                d="M 72 300 L 104 286 L 136 292 L 168 268 L 200 276 L 232 250 L 264 258 L 296 228 L 328 236 L 360 206 L 392 190 L 408 178"
                fill="none"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="stroke-primary"
              />
              <circle cx="408" cy="178" r="12" className="fill-primary/20" />
              <circle cx="408" cy="178" r="6" className="fill-primary" />

              <circle cx="404" cy="92" r="27" className="fill-card" />
              <circle cx="404" cy="92" r="21" className="fill-primary" />
              <path
                d="M 394 92 L 401 99 L 414 85"
                fill="none"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="stroke-primary-foreground"
              />

              <rect x="24" y="312" width="172" height="60" rx="14" className="fill-card stroke-border" strokeWidth="2" />
              <circle cx="52" cy="342" r="14" className="fill-primary/15" />
              <path
                d="M 45.5 342 L 50 346.5 L 58.5 337"
                fill="none"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="stroke-primary"
              />
              <rect x="76" y="326" width="96" height="10" rx="5" className="fill-muted-foreground/40" />
              <rect x="76" y="344" width="62" height="10" rx="5" className="fill-primary/40" />
            </svg>
          </div>
        </div>
      </section>

      <StatBand
        stats={[
          { value: "< 5 min", label: "Speed-to-lead target" },
          { value: "90%+", label: "Answer rate target" },
          { value: "21 days", label: "Launch runway" },
          { value: "Live dashboard", label: "Booked jobs, not clicks" },
        ]}
      />

      <section className="mx-auto w-full max-w-6xl px-4 py-16">
        <SectionHeading
          eyebrow="The leak problem"
          title="Your next stage of growth may not need more leads. It may need fewer leaks."
          body="A lead comes in while you are on a job. The phone rings again. A quote sits untouched, a past customer never hears from you, and the ad report still says the campaign is performing. That gap between lead generation and business growth is where money leaks."
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
                    <span className="text-sm font-semibold text-primary">01: Plan</span>
                <CardTitle className="text-base">Know what growth actually requires.</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                    We study your business, set the baseline and reverse-engineer the target. Deliverable: SNIPE Diagnostic™ and SNIPE Blueprint™.
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                    <span className="text-sm font-semibold text-primary">02: Install</span>
                <CardTitle className="text-base">Put the growth infrastructure in place.</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                    We configure the journey, CRM, call handling, follow-up, tracking and reporting. Deliverable: SNIPE CRM™, SNIPE VoiceIQ™, SNIPE Intelligence™ and the configured workflows.
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                    <span className="text-sm font-semibold text-primary">03: Run</span>
                <CardTitle className="text-base">Keep the system moving and improving.</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                    We help operate acquisition, intake, follow-up, retention and reviews. Deliverable: SNIPE Engine™, installed and run with your team.
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
            {[
              { to: "/home-inspectors", icon: HomeIcon, title: "Home Inspectors", body: "Grow agent relationships, improve booking capture and build value around the inspection, not just the base fee." },
              { to: "/hvac", icon: FireIcon, title: "HVAC", body: "Turn urgent demand, estimates and seasonal service into a stronger booking and maintenance pipeline." },
              { to: "/plumbing", icon: WrenchScrewdriverIcon, title: "Plumbing", body: "Capture high-intent calls, improve dispatch-ready intake and create more value from each customer relationship." },
              { to: "/electrical", icon: BoltIcon, title: "Electrical", body: "Build a predictable flow of residential and commercial enquiries, estimates and follow-up." },
              { to: "/roofing", icon: HomeModernIcon, title: "Roofing", body: "Turn inspections and estimates into a structured pipeline with persistent follow-up and partner referrals." },
              { to: "/contractors", icon: BuildingOffice2Icon, title: "General Contractors", body: "Create a repeatable process for qualifying, nurturing and converting high-value project opportunities." },
            ].map((t) => (
              <Link key={t.to} to={t.to} className="block h-full rounded-xl transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={`${t.title} growth`}>
                <IconTile icon={t.icon} title={t.title} body={t.body} />
              </Link>
            ))}
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
          eyebrow="Solutions"
          title="Start with the step your business needs right now."
        />
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="text-base">SNIPE Loops™</CardTitle>
              <CardDescription>No card required</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col text-sm text-muted-foreground">
              <p className="flex-1">Practical automation recipes, follow-up sequences, scripts and workflow ideas you can adapt to your business.</p>
              <Button className="mt-4" asChild><Link to="/loop-library">Download SNIPE Loops™ For Free</Link></Button>
            </CardContent>
          </Card>
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="text-base">SNIPE Diagnostic™</CardTitle>
              <CardDescription>{OFFERS.diagnostic.price.label} one-time</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col text-sm text-muted-foreground">
              <p className="flex-1">A focused review of your last 12 months of business performance. Find the gaps, quantify the leaks and see where growth is getting stuck.</p>
              <Button className="mt-4" asChild><Link to="/diagnostic">Get My SNIPE Diagnostic™</Link></Button>
            </CardContent>
          </Card>
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="text-base">SNIPE Blueprint™</CardTitle>
              <CardDescription>{OFFERS.blueprint.price.label} one-time</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col text-sm text-muted-foreground">
              <p className="flex-1">A personalized 12-month growth plan built around your numbers, market, services, capacity and goals.</p>
              <Button className="mt-4" asChild><Link to="/blueprint">Build My SNIPE Blueprint™</Link></Button>
            </CardContent>
          </Card>
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="text-base">SNIPE Engine™</CardTitle>
              <CardDescription>The operating partnership</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col text-sm text-muted-foreground">
              <p className="flex-1">The implementation and operating partnership that puts the plan to work, and keeps it running.</p>
              <Button className="mt-4" asChild><Link to="/engine">Explore SNIPE Engine™</Link></Button>
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
            body="Assume 12 additional jobs in a month at a $500 average completed job value. That is $6,000 in additional gross revenue before advertising, labor, materials, overhead, fees, refunds or other costs."
          />
          <p className="mx-auto mt-4 max-w-2xl text-center text-muted-foreground">
            The point is not that every business will add 12 jobs. Work backward from your own booking rate, average ticket, capacity and customer economics before deciding where to invest.
          </p>
          <div className="mt-8 text-center">
            <Button asChild>
              <Link to="/book">See What the Numbers Say About My Business</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-16">
        <SectionHeading
          eyebrow="SNIPE Engine™"
          title="The plan is only the beginning. The system has to run."
          body="SNIPE Engine™ brings the plan, marketing, CRM, call coverage, follow-up and analytics into one partnership."
        />
        <div className="mx-auto mt-10 grid max-w-4xl gap-4 text-center sm:grid-cols-3">
          <div className="rounded-xl border bg-card p-6">
            <p className="font-semibold">We run the marketing</p>
            <p className="mt-2 text-sm text-muted-foreground">Paid media, campaigns and follow-up, managed against your numbers.</p>
          </div>
          <div className="rounded-xl border bg-card p-6">
            <p className="font-semibold">We cover the phones</p>
            <p className="mt-2 text-sm text-muted-foreground">Live intake and booking support, with Voice AI fallback when the team cannot answer.</p>
          </div>
          <div className="rounded-xl border bg-card p-6">
            <p className="font-semibold">We keep it visible</p>
                <p className="mt-2 text-sm text-muted-foreground">A dynamic, real-time analytics dashboard, plan reviews and clear next actions.</p>
          </div>
        </div>
        <div className="mt-8 text-center">
          <Button size="lg" asChild>
            <Link to="/engine">Explore SNIPE Engine™</Link>
          </Button>
          <p className="mx-auto mt-4 max-w-2xl text-xs text-muted-foreground">
            Advertising spend is paid directly by the client.
          </p>
        </div>
      </section>

      <section className="bg-muted/40">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-16 lg:grid-cols-2">
          <div>
            <Eyebrow>SNIPE Loops™</Eyebrow>
            <h2 className="max-w-xl text-3xl font-bold tracking-tight sm:text-4xl">
              Run the follow-up plays that book more jobs.
            </h2>
            <p className="mt-4 max-w-xl text-lg text-muted-foreground">
              Practical automation recipes, follow-up sequences, scripts and workflow ideas you can adapt to your business this week. No card required.
            </p>
            <div className="mt-8">
              <Button size="lg" asChild>
                <Link to="/loop-library">Download SNIPE Loops™ For Free</Link>
              </Button>
            </div>
          </div>
          <div className="mx-auto w-full max-w-md lg:max-w-none">
            <svg
              role="img"
              aria-label="A follow-up loop that moves a lead through SMS and email follow-up until the job is booked"
              viewBox="0 0 480 420"
              className="h-auto w-full"
            >
              <ellipse cx="240" cy="210" rx="205" ry="190" className="fill-primary/5" />
              <ellipse cx="240" cy="210" rx="150" ry="140" className="fill-primary/5" />

              <circle cx="240" cy="210" r="135" fill="none" strokeWidth="2.5" className="stroke-primary/15" />
              <circle
                cx="240"
                cy="210"
                r="135"
                fill="none"
                strokeWidth="2"
                strokeDasharray="2 11"
                strokeLinecap="round"
                className="stroke-primary/40"
              />

              <g transform="translate(357 143) rotate(60)">
                <path d="M -6 -6 L 7 0 L -6 6 Z" className="fill-primary" />
              </g>
              <g transform="translate(240 345) rotate(180)">
                <path d="M -6 -6 L 7 0 L -6 6 Z" className="fill-primary" />
              </g>
              <g transform="translate(123 143) rotate(-60)">
                <path d="M -6 -6 L 7 0 L -6 6 Z" className="fill-primary" />
              </g>

              <circle cx="240" cy="75" r="34" className="fill-card stroke-border" strokeWidth="2" />
              <g
                transform="translate(240 75)"
                fill="none"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="stroke-primary"
              >
                <rect x="-13" y="-12" width="26" height="19" rx="5" />
                <path d="M -4 7 L -4 13 L 3 7" />
                <circle cx="-7" cy="-2.5" r="1.4" stroke="none" className="fill-primary" />
                <circle cx="0" cy="-2.5" r="1.4" stroke="none" className="fill-primary" />
                <circle cx="7" cy="-2.5" r="1.4" stroke="none" className="fill-primary" />
              </g>
              <text x="240" y="30" textAnchor="middle" fontSize="12" fontWeight="600" className="fill-muted-foreground">SMS</text>

              <circle cx="357" cy="277" r="34" className="fill-card stroke-border" strokeWidth="2" />
              <g
                transform="translate(357 277)"
                fill="none"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="stroke-primary"
              >
                <rect x="-13" y="-9" width="26" height="18" rx="3" />
                <path d="M -13 -6 L 0 3 L 13 -6" />
              </g>
              <text x="357" y="329" textAnchor="middle" fontSize="12" fontWeight="600" className="fill-muted-foreground">Email</text>

              <circle cx="123" cy="277" r="34" className="fill-card stroke-border" strokeWidth="2" />
              <g
                transform="translate(123 277)"
                fill="none"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="stroke-primary"
              >
                <path d="M -11 -6 L 10 -6" />
                <path d="M 5 -10 L 10 -6 L 5 -2" />
                <path d="M 11 6 L -10 6" />
                <path d="M -5 2 L -10 6 L -5 10" />
              </g>
              <text x="123" y="329" textAnchor="middle" fontSize="12" fontWeight="600" className="fill-muted-foreground">Follow-up</text>

              <rect x="172" y="158" width="136" height="104" rx="16" className="fill-card stroke-border" strokeWidth="2" />
              <circle cx="240" cy="188" r="19" className="fill-primary" />
              <path
                d="M 232 188 L 238 194 L 249 182"
                fill="none"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="stroke-primary-foreground"
              />
              <text x="240" y="230" textAnchor="middle" fontSize="17" fontWeight="700" className="fill-foreground">Booked</text>
              <text x="240" y="247" textAnchor="middle" fontSize="11" className="fill-muted-foreground">Job scheduled</text>
            </svg>
          </div>
        </div>
      </section>

      <section className="border-t bg-muted/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-16">
          <SectionHeading
            eyebrow="Proof"
            title="Owners who stopped guessing."
            body="Real businesses, real numbers. Read what owners say about finding the leak, then explore the case studies behind the system."
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
              quote="The dashboard is the first report I actually read. It tells me what to do, not just what happened."
              name="Luis Ortega"
              detail="Owner, Ortega Inspection Group"
            />
          </div>
          <div className="mt-8 text-center">
            <Button variant="outline" asChild>
              <Link to="/case-studies">Explore Case Studies</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-3xl px-4 py-16 text-center">
        <SectionHeading
          eyebrow="Start here"
          title="Start with SNIPE Diagnostic™ or SNIPE Blueprint™."
          body={`Find the leaks for ${OFFERS.diagnostic.price.label}, or get the full 12-month plan for ${OFFERS.blueprint.price.label}. Both credit forward when you keep moving.`}
        />
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button size="lg" asChild>
            <Link to={OFFERS.diagnostic.checkoutPath}>Start with SNIPE Diagnostic™</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link to={OFFERS.blueprint.checkoutPath}>Start with SNIPE Blueprint™</Link>
          </Button>
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
