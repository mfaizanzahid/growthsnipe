import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import { CtaBand, Faq, PageHero, SectionHeading } from "../../components/marketing/MarketingBits";
import { OfferCtaButton, OfferValueStack } from "../../components/marketing/OfferValueStack";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { CheckCircleIcon } from "@heroicons/react/24/outline";
import { OFFERS, OFFER_CREDITS, OFFER_STACKS } from "../../../lib/offers";

const INCLUDED = [
  "The Baseline and Target Stack: your current volume, average ticket, revenue, margins and capacity mapped against the revenue target. You see how many jobs and what average ticket the goal requires, and where the gap is.",
  "The Packaging and Ticket Architecture: a good-better-best package structure, an add-on menu, and retail versus bundled pricing with the blended-ticket math behind it. You raise average job value with clearer choices instead of a base-price increase.",
  "The Recurring Revenue Models: membership and B2B retainer structures with pricing, deliverables and unit economics. You add predictable recurring revenue and smooth out slow months.",
  "The Lifecycle Funnel Map: named follow-up sequences for booking, pre-service add-ons, report or job delivery and reviews, post-job cross-sell, warranty and renewal timing, reactivation and partner intake. You stop losing revenue after the first job.",
  "The Channel Math and Paid Ads Model: market cost-per-click and cost-per-lead benchmarks, conversion and acquisition cost by channel, and a reverse-engineered budget with return on ad spend and profit reconciliation. You know what a booked job can afford to cost before you spend.",
  "The Local Authority Plan: your Google Business Profile setup, category and service-area structure, review-velocity targets, geo landing-page priorities and schema markup. You get found in local search and AI answers, not just paid results.",
  "The Partner Flywheel: a staged outreach and reactivation plan for the referral partners who send the best work, with the assets and cadence for each stage. You turn a few relationships into a repeatable referral stream.",
  "The Capacity and Hiring Plan: hiring triggers, compensation models and division of labor based on the volume the business can responsibly fulfill. You add capacity without breaking turnaround or margin.",
  "The 12-Month Roadmap: a phased execution plan with priorities, timing, owners, dependencies and a month-by-month financial progression. You know what to do first, and what it should produce.",
  "The Guardrail Dashboard: the metrics to review, target ranges, warning thresholds, corrective actions and compliance guardrails. You catch drift early and keep decisions inside the rules of your trade.",
];

const BENEFITS = [
  "One plan instead of a stack of disconnected tactics.",
  "A clear number for what growth actually requires.",
  "Confidence in what a booked job can afford to cost.",
  "More value per job without a base-price increase.",
  "Recurring revenue that smooths the slow months.",
  "A hiring and capacity plan that protects service quality.",
];

const STEPS = [
  {
    title: "Purchase your Blueprint",
    body: "Complete checkout and receive your intake instructions. Book your bonus 30-minute discovery call to confirm goals, data access and timing.",
  },
  { title: "Share your business information", body: "Provide the agreed booking, revenue, lead-source, marketing and capacity data. We will tell you what is needed and what can be substituted if a report is unavailable." },
  { title: "We build the plan", body: "The 10-business-day delivery window begins once the required information is complete." },
  { title: "Walk through the decisions", body: "Join your bonus 90-minute presentation to review the plan, assumptions, priorities and economics." },
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
    a: "No. It is a full growth plan covering your baseline and target, packaging and pricing, lifecycle follow-ups, channel math, local visibility, recurring revenue, capacity and a 12-month roadmap.",
  },
  {
    q: "Does it cover pricing and recurring revenue?",
    a: "Yes. The plan includes a good-better-best package structure, an add-on menu with bundled pricing, and membership or retainer models where they fit the business.",
  },
  {
    q: "Does it include local search?",
    a: "Yes. It includes a Google Business Profile and review plan, geo landing-page priorities and schema guidance for local search and AI answers.",
  },
  {
    q: "Do you implement the plan?",
    a: "You can use it with your own team or move into SNIPE Engine™ for implementation and ongoing operation.",
  },
  {
    q: "Does the Blueprint include the SNIPE Diagnostic™?",
    a: `Yes. The Blueprint includes the Diagnostic baseline and leak review as a bonus. If you bought the Diagnostic first, the ${OFFERS.diagnostic.price.label} fee is credited toward the Blueprint within 14 days of your review.`,
  },
  {
    q: "Is SNIPE Loops™ included?",
    a: "Yes. The full SNIPE Loops™ library is included as a bonus with the Blueprint.",
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
        lede="The SNIPE Blueprint™ is a practical, numbers-led 12-month growth plan for your business. It covers your baseline and target, packaging and pricing, marketing channels, local visibility, recurring revenue, referral partners, capacity and a phased roadmap, so you can stop choosing tactics in isolation."
      />
      <section className="mx-auto w-full max-w-3xl px-4 pb-14">
        <OfferValueStack stack={OFFER_STACKS.blueprint} />
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
        <div className="mt-8 text-center">
          <OfferCtaButton stack={OFFER_STACKS.blueprint} />
        </div>
      </section>

      <section className="border-t bg-muted/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-16">
          <SectionHeading
            eyebrow="What you walk away with"
            title="A plan you can act on, not a report you file away."
          />
          <div className="mx-auto mt-8 grid max-w-3xl gap-3 sm:grid-cols-2">
            {BENEFITS.map((item) => (
              <div key={item} className="flex items-start gap-2 rounded-lg border bg-background p-4">
                <CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <p className="text-sm text-muted-foreground">{item}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <OfferCtaButton stack={OFFER_STACKS.blueprint} variant="outline" />
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-16">
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
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already purchased?{" "}
          <a
            className="font-semibold text-primary underline underline-offset-4"
            href="/blueprint-discovery-call"
          >
            Book your 30-minute discovery call
          </a>
          .
        </p>
        <div className="mt-6 text-center">
          <OfferCtaButton stack={OFFER_STACKS.blueprint} />
        </div>
      </section>

      <section className="border-t bg-muted/40">
        <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-16 md:grid-cols-2">
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

      <section className="mx-auto w-full max-w-3xl px-4 py-16 text-center">
        <SectionHeading
          eyebrow="Next-step credit"
          title="One plan. A clear path to implementation."
        />
        <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">{OFFER_CREDITS.blueprintToEngine.text}</p>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">
          The Blueprint includes the SNIPE Diagnostic™ and SNIPE Loops™ as bonuses. If you already bought the Diagnostic, the {OFFERS.diagnostic.price.label} you paid is credited when you move into the Blueprint within 14 days of your review.
        </p>
        <p className="mx-auto mt-2 max-w-2xl text-xs text-muted-foreground">
          You will receive an intake checklist after checkout. Work begins when the required information is received.
        </p>
        <div className="mt-6">
          <OfferCtaButton stack={OFFER_STACKS.blueprint} variant="outline" />
        </div>
      </section>

      <section className="border-t bg-muted/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-16">
          <SectionHeading eyebrow="FAQ" title="Blueprint questions, answered" />
          <Faq items={FAQS} />
        </div>
      </section>

      <CtaBand
        title="Stop buying tactics. Get the plan."
        body="A 12-month growth plan built around your numbers, delivered in 10 business days with a bonus 90-minute walkthrough."
      />
    </MarketingLayout>
  );
}
