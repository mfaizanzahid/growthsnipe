import { Link } from "react-router-dom";
import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import { CtaBand, PageHero, SectionHeading } from "../../components/marketing/MarketingBits";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";

const PILLARS = [
  {
    letter: "S",
    name: "Size the Gap",
    question: "What does the growth target actually require?",
    body: "We translate the goal into revenue, job volume, average ticket, lead needs, acquisition cost, capacity and budget.",
    frameworks: ["Growth Equation: Revenue equals completed job volume times average completed ticket.", "Leak Map: Quantifies friction between opportunity, booking, job value and repeat revenue."],
  },
  {
    letter: "N",
    name: "Net-Ticket Architecture",
    question: "How can the business create more value from each suitable job?",
    body: "We look at service packaging, good-better-best options, relevant add-ons and how the offer is presented.",
    frameworks: ["Ticket Ladder: A clear package and add-on structure designed around customer needs and business economics."],
  },
  {
    letter: "I",
    name: "Instant Capture",
    question: "How do we respond consistently to opportunities already coming in?",
    body: "We design the response rules, scripts, routing, qualification, after-hours fallback and escalation process.",
    frameworks: ["Instant Capture Protocol: A tracked response and handoff system across calls, forms and messages."],
  },
  {
    letter: "P",
    name: "Pipeline Engine",
    question: "Where will the next customers come from, and what can the business afford to pay?",
    body: "We build a balanced demand system across paid acquisition, local authority, referrals and partner relationships.",
    frameworks: [
      "Channel Math Model: Works backward from conversion economics to channel budget.",
      "Partner Flywheel: Creates a repeatable process for building and reactivating referral relationships.",
      "Authority Stack: Strengthens local visibility, proof and service-area presence.",
    ],
  },
  {
    letter: "E",
    name: "Expand and Evaluate",
    question: "How do we earn repeat business, support capacity and stay in control?",
    body: "We create lifecycle follow-up, define when additional capacity is needed and review performance against clear guardrails.",
    frameworks: [
      "Revenue Loops: Lifecycle workflows for add-ons, reviews, retention, reactivation and referrals.",
      "Capacity Trigger Ladder: Helps identify when workload and utilization justify hiring or operational changes.",
      "Guardrail Scorecard: Defines the metric, target, warning threshold and corrective action.",
    ],
  },
];

export function SnipeSystem() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="The SNIPE System"
        title="A repeatable system for turning growth goals into operating decisions."
        lede="The SNIPE System is the method behind every GrowthSnipe plan. It connects the numbers, the customer journey and the operating work required to create more predictable growth."
      />
      <section className="mx-auto w-full max-w-6xl px-4 pb-14">
        <div className="text-center">
          <Button size="lg" asChild>
            <Link to="/blueprint">Get My SNIPE Blueprint</Link>
          </Button>
        </div>
      </section>

      {PILLARS.map((p, i) => (
        <section key={p.letter} className={i % 2 === 0 ? "border-t bg-muted/40" : ""}>
          <div className="mx-auto w-full max-w-4xl px-4 py-14">
            <p className="text-sm font-semibold text-primary">
                {p.letter}: {p.name}
            </p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{p.question}</h2>
            <p className="mt-3 text-muted-foreground">{p.body}</p>
            <ul className="mt-4 space-y-2">
              {p.frameworks.map((f) => (
                <li key={f} className="rounded-lg border bg-card p-3 text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">{f.split(":")[0]}:</span>
                  {f.slice(f.indexOf(":") + 1)}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}

      <section className="border-t bg-muted/40">
        <div className="mx-auto w-full max-w-3xl px-4 py-16">
          <SectionHeading
            eyebrow="The core growth equations"
            title="Simple math, used honestly."
          />
          <ul className="mx-auto mt-6 max-w-2xl space-y-3 text-center font-mono text-sm">
            <li className="rounded-lg border bg-card p-3">Monthly revenue = completed jobs × average completed ticket</li>
            <li className="rounded-lg border bg-card p-3">Customer acquisition cost by channel = channel cost per lead ÷ lead-to-book conversion</li>
            <li className="rounded-lg border bg-card p-3">Estimated paid budget = planned booked volume × estimated acquisition cost per booked job</li>
            <li className="rounded-lg border bg-card p-3">Blended average ticket = sum of each package price × its share of completed sales</li>
          </ul>
          <p className="mx-auto mt-4 max-w-2xl text-center text-sm text-muted-foreground">
            These formulas are planning tools. Their usefulness depends on consistent data definitions and realistic assumptions.
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-16">
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">The method becomes an operating system</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              The SNIPE System is not designed to end as a PDF. The Blueprint defines the priorities. SNIPE Engine installs the workflows, manages the agreed operating activity and uses SNIPE Intelligence™ to keep the work visible.
            </CardContent>
          </Card>
          <Card className="flex flex-col justify-center">
            <CardContent className="space-y-3 pt-6 text-center">
              <p className="font-semibold">Put the system to work on your numbers.</p>
              <Button asChild>
                <Link to="/blueprint">Build My SNIPE Blueprint</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      <CtaBand
        title="The system behind every plan."
        body="Five pillars, ten frameworks, one operating rhythm. Start with the Blueprint."
      />
    </MarketingLayout>
  );
}
