import { Link } from "react-router-dom";
import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import { CtaBand, Faq, PageHero, SectionHeading } from "../../components/marketing/MarketingBits";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { CheckCircleIcon } from "@heroicons/react/24/outline";
import { OFFERS, OFFER_CREDITS } from "../../../lib/offers";

const INCLUDED = [
  "The Target Stack: your revenue goal translated into job volume, average ticket, working days, capacity and required pipeline.",
  "The Leak Map: a quantified view of where opportunities may be lost across missed calls, slow response, unbooked enquiries, low ticket size, missed add-ons, dormant partners and repeat-customer gaps.",
  "The Ticket Ladder: a service and package structure designed to make options clearer and improve average job value.",
  "The Channel Math Model: a prioritized channel plan with lead, conversion, acquisition cost and budget assumptions. Every estimate is labeled as an assumption where historical data is unavailable.",
  "Revenue Loop Designs: a lifecycle plan for pre-service, post-service, reviews, reactivation, maintenance, repeat work and referral opportunities, adapted to your trade.",
  "The Partner Flywheel: a plan for identifying, developing and reactivating valuable referral relationships.",
  "The Capacity Trigger Ladder: hiring and operating triggers based on workload, utilization and the volume the business can responsibly fulfill.",
  "The 12-Month Roadmap: a sequenced execution plan with priorities, timing, responsibilities and dependencies.",
  "The Guardrail Dashboard: the metrics to review, target ranges, warning thresholds and corrective actions.",
];

const STEPS = [
  { title: "Purchase your Blueprint", body: "Complete checkout and receive your intake instructions." },
  { title: "Share your business information", body: "Provide the agreed booking, revenue, lead-source, marketing and capacity data. We will tell you what is needed and what can be substituted if a report is unavailable." },
  { title: "We build the plan", body: "The 10-business-day delivery window begins once the required information is complete." },
  { title: "Walk through the decisions", body: "Join a 90-minute presentation to review the plan, assumptions, priorities and economics." },
  { title: "Put the plan to work", body: "Use it independently or move into SNIPE Engine™. The Blueprint fee is credited toward SNIPE Engine™ setup if you sign within 30 days of the presentation." },
];

const FOR = [
  "Owners who want to grow but do not have a clear, numbers-backed plan.",
  "Businesses spending on marketing without knowing the true cost of a booked job.",
  "Owners preparing to hire, add a service area or increase capacity.",
  "Companies that rely heavily on a small number of referral sources.",
  "Operators who want a strategic plan before committing to monthly implementation.",
];

const AGAINST = [
  "Businesses looking for a guaranteed revenue outcome.",
  "Owners unwilling to share enough business information to create a useful plan.",
  "Companies that only want more leads and are not prepared to review their response and booking process.",
  "Businesses without the capacity or intent to act on the recommendations.",
];

const FAQS = [
  {
    q: "Is this just a marketing report?",
    a: "No. It is an actionable growth plan connecting revenue targets, channels, customer journey, ticket size, capacity and operating priorities.",
  },
  {
    q: "Do you implement the plan?",
    a: "You can use it with your own team or move into SNIPE Engine™ for implementation and ongoing operation.",
  },
  {
    q: "Do I need to be a GrowthSnipe client?",
    a: "No. The SNIPE Blueprint™ is available as a standalone product.",
  },
  {
    q: "Are the projections guaranteed?",
    a: "No. They are planning models based on your data and clearly stated assumptions, not guaranteed outcomes.",
  },
];

export function Blueprint() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="The strategy before the spend"
        title="Stop buying marketing tactics. Get the growth plan they should be following."
        lede="The SNIPE Blueprint™ is a practical, numbers-led 12-month growth plan for your business. It shows what the next stage of growth requires, where revenue is leaking, which channels deserve investment and what needs to happen across marketing, sales and operations."
      />
      <section className="mx-auto w-full max-w-6xl px-4 pb-14">
        <Card className="mx-auto max-w-2xl text-center">
          <CardHeader>
            <CardTitle className="text-3xl">
              {OFFERS.blueprint.name}: {OFFERS.blueprint.price.label} one-time
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-2 text-left text-sm">
              {[
                "Personalized 25 to 35-page growth plan.",
                "Delivered within 10 business days after complete intake and data receipt.",
                "90-minute presentation and walkthrough.",
                "30 days of follow-up questions.",
                "100% of the Blueprint fee credited toward SNIPE Engine™ setup if you sign within 30 days of the presentation.",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
            <Button size="lg" className="w-full sm:w-auto" asChild>
              <Link to={OFFERS.blueprint.checkoutPath}>Get My SNIPE Blueprint™</Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="border-t bg-muted/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-16">
          <SectionHeading
            eyebrow="The problem"
            title="You cannot build a reliable growth plan from guesses."
            body="How many jobs do you need each month? What average ticket do you need? Which channels can produce those jobs at an acceptable acquisition cost? Can your current team handle the volume? What happens after a lead calls? The Blueprint connects those questions into one plan, so you can stop choosing tactics in isolation."
          />
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-16">
        <SectionHeading
          eyebrow="Inside the Blueprint"
          title="What your Blueprint includes"
        />
        <div className="mx-auto mt-8 max-w-3xl space-y-3">
          {INCLUDED.map((item, i) => (
            <div key={item} className="flex items-start gap-3 rounded-lg border p-4">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                {i + 1}
              </span>
              <p className="text-sm text-muted-foreground">{item}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t bg-muted/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-16">
          <SectionHeading eyebrow="Process" title="How it works" />
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
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
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-16">
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Who it is for</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {FOR.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Who it is not for</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {AGAINST.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span aria-hidden className="mt-0.5 size-4 shrink-0 text-center font-bold text-muted-foreground">×</span>
                    {f}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="border-t bg-muted/40">
        <div className="mx-auto w-full max-w-3xl px-4 py-16 text-center">
          <SectionHeading
            eyebrow="Price and next-step credit"
            title="One plan. A clear path to implementation."
          />
          <p className="mt-4 text-2xl font-bold">
            {OFFERS.blueprint.name}: {OFFERS.blueprint.price.label} one-time.
          </p>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">{OFFER_CREDITS.blueprintToEngine.text}</p>
          <div className="mt-6">
            <Button size="lg" asChild>
              <Link to={OFFERS.blueprint.checkoutPath}>Get My SNIPE Blueprint™, {OFFERS.blueprint.price.label}</Link>
            </Button>
            <p className="mt-3 text-xs text-muted-foreground">
              You will receive an intake checklist after checkout. Work begins when the required information is received.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-16">
        <SectionHeading eyebrow="FAQ" title="Blueprint questions, answered" />
        <Faq items={FAQS} />
      </section>

      <CtaBand
        title="Stop buying tactics. Get the plan."
        body="A 12-month growth plan built around your numbers, delivered in 10 business days with a 90-minute walkthrough."
      />
    </MarketingLayout>
  );
}
