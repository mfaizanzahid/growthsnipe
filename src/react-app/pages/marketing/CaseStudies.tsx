import { Link } from "react-router-dom";
import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import { CtaBand, PageHero, SectionHeading } from "../../components/marketing/MarketingBits";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { OFFERS } from "../../../lib/offers";

const CASES = [
  {
    scenario: "Harborview Property Inspections",
    profile: "An owner-operated inspection firm with a small field team and a strong agent-referral base.",
    situation:
      "The business receives most enquiries through agent referrals and direct calls. The owner is frequently inspecting properties and cannot always answer. The business has no consistent view of how many enquiries are lost, how many bookings include additional services or which agent relationships have gone quiet.",
    performance: [
      "100 monthly enquiries across tracked channels.",
      "60% become booked inspections.",
      "$500 average completed inspection revenue.",
      "10% of monthly enquiries are estimated to receive no timely human follow-up.",
    ],
    identified: [
      "Whether the 60% booking rate differs by source and service type.",
      "What happens to missed calls and after-hours enquiries.",
      "Whether suitable ancillary services are explained consistently.",
      "Which agent relationships produce repeat referrals.",
      "Whether post-report follow-up creates reviews and future opportunities.",
    ],
    opportunity:
      "If improved follow-up ultimately produced six additional completed inspections per month at the $500 average revenue level, that would represent $3,000 in additional gross monthly revenue before costs.",
    priorities: [
      "Configure call capture and callback tasks.",
      "Build an agent Partner Flywheel.",
      "Review the Ticket Ladder and relevant add-on prompts.",
      "Install post-report review and customer lifecycle loops.",
      "Track enquiries, bookings, average fee, source mix and partner activity.",
    ],
  },
  {
    scenario: "Northline Heating & Air",
    profile: "An HVAC company with a small service team, seasonal demand and a backlog of estimates.",
    situation:
      "The company generates enquiries during peak periods but struggles to respond consistently while technicians are in the field. Estimates are sent but follow-up varies by employee. Maintenance renewals are tracked manually.",
    performance: [
      "160 monthly enquiries in a busy month.",
      "35% booked-call conversion.",
      "40 open estimates at month end.",
      "20% of completed customers enrolled in a maintenance relationship.",
    ],
    identified: [
      "Lead response by time of day and channel.",
      "Booking rate by campaign and service category.",
      "Estimate follow-up completion and close rate.",
      "Maintenance plan attachment and renewal.",
      "Technician utilization and booking capacity.",
    ],
    opportunity: null,
    priorities: [
      "Implement after-hours capture and urgent-service routing rules.",
      "Create a quote follow-up pipeline with clear next actions.",
      "Package repair, replacement and maintenance options appropriately.",
      "Build seasonal and maintenance renewal Revenue Loops.",
      "Connect campaign source to booked and completed work.",
    ],
  },
  {
    scenario: "Ridgeway Roofing Co.",
    profile: "A residential roofer with a mix of inbound leads and referral opportunities.",
    situation:
      "The company receives quote requests but has limited visibility into the movement from enquiry to inspection, estimate, decision and signed project. Prospects who need more time are not consistently nurtured.",
    performance: [
      "70 new enquiries per month.",
      "30 site assessments completed.",
      "18 estimates issued.",
      "5 projects won.",
      "$8,000 assumed average project value.",
    ],
    identified: null,
    opportunity:
      "If a better-managed pipeline resulted in one additional won project at the assumed $8,000 project value, that would represent $8,000 in additional gross contract value before labor, materials, subcontractors, overhead, advertising and other costs. It is not a forecast.",
    priorities: [
      "Define lead qualification and service-area rules.",
      "Build the inspection-to-estimate pipeline.",
      "Add persistent but respectful estimate follow-up.",
      "Track reasons for lost estimates.",
      "Create referral and review workflows.",
    ],
  },
];

export function CaseStudies() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Proof"
        title="See how we think about growth, not just how we talk about it."
        lede="Explore business scenarios, sample dashboards and the questions behind a SNIPE growth plan. Each example shows how we connect the numbers to practical decisions."
      />
      <section className="mx-auto w-full max-w-6xl px-4 pb-14">
        <div className="mx-auto max-w-3xl space-y-8">
          {CASES.map((c, i) => (
            <Card key={c.scenario}>
              <CardHeader>
                <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                    Case {i + 1}: {c.scenario}
                </p>
                <CardTitle className="text-xl">{c.profile}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-muted-foreground">
                <div>
                  <h3 className="font-semibold text-foreground">The situation</h3>
                  <p className="mt-1">{c.situation}</p>
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Business performance</h3>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {c.performance.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
                {c.identified && (
                  <div>
                    <h3 className="font-semibold text-foreground">What the SNIPE analysis identified</h3>
                    <ul className="mt-1 list-disc space-y-1 pl-5">
                      {c.identified.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {c.opportunity && (
                  <div>
                    <h3 className="font-semibold text-foreground">Growth opportunities</h3>
                    <p className="mt-1">{c.opportunity}</p>
                  </div>
                )}
                <div>
                  <h3 className="font-semibold text-foreground">SNIPE priorities</h3>
                  <ol className="mt-1 list-decimal space-y-1 pl-5">
                    {c.priorities.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ol>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-t bg-muted/40">
        <div className="mx-auto w-full max-w-3xl px-4 py-16 text-center">
          <SectionHeading
            eyebrow="Your numbers"
            title="Your numbers are different. Your growth plan should be too."
            body="Start with a SNIPE Diagnostic™ or book a free Growth Fit Call."
          />
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" asChild>
              <Link to={OFFERS.diagnostic.checkoutPath}>Get My SNIPE Diagnostic™</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/book">Book a Free Growth Fit Call</Link>
            </Button>
          </div>
        </div>
      </section>

      <CtaBand
        title="Bring us your numbers."
        body="A Diagnostic pays for itself in clarity: the leaks, the math, and the next step."
      />
    </MarketingLayout>
  );
}
