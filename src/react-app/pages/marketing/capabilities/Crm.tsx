import { Link } from "react-router-dom";
import { MarketingLayout } from "../../../components/marketing/MarketingLayout";
import { CtaBand, PageHero, SectionHeading, TrustCallout } from "../../../components/marketing/MarketingBits";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { CheckCircleIcon } from "@heroicons/react/24/outline";

const MANAGES = [
  "New enquiries from calls, forms and campaigns.",
  "Lead source and service requested.",
  "Pipeline stages and booking status.",
  "Missed-call and unbooked-lead follow-up.",
  "Estimate, quote and appointment reminders.",
  "Review requests and customer reactivation.",
  "Referral partner records and follow-up tasks.",
  "Team visibility and activity history.",
];

export function Crm() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="SNIPE CRM™"
        title="Every lead needs a next step. Every customer deserves a follow-up plan."
        lede="SNIPE CRM™ is the customer and follow-up layer of the GrowthSnipe system. It brings your enquiries, conversations, pipeline stages, tasks and customer lifecycle workflows into a structured environment, so opportunities do not disappear between the first call and the next job."
      />
      <section className="mx-auto w-full max-w-6xl px-4 pb-14">
        <div className="text-center">
          <Button size="lg" asChild>
            <Link to="/book">See How SNIPE CRM Works</Link>
          </Button>
        </div>
      </section>

      <section className="border-t bg-muted/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-16">
          <SectionHeading
            eyebrow="What it helps you manage"
            title="One place for every opportunity and every follow-up."
          />
          <div className="mx-auto mt-8 grid max-w-4xl gap-3 md:grid-cols-2">
            {MANAGES.map((item) => (
              <div key={item} className="flex items-start gap-2 rounded-lg border bg-card p-4 text-sm text-muted-foreground">
                <CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-16">
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Built around your process</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              The CRM should reflect how your business sells and delivers work. We configure the pipelines, fields, workflows and automations around your trade, service types and customer journey, not force every company into the same generic funnel.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">The result</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              A clearer view of who needs attention, what happens next and where opportunities are sitting.
            </CardContent>
          </Card>
        </div>
        <div className="mt-8 text-center">
          <Button size="lg" asChild>
            <Link to="/book">Book a Free Growth Fit Call</Link>
          </Button>
        </div>
      </section>

      <TrustCallout />

      <CtaBand
        title="Stop losing opportunities between systems."
        body="See how SNIPE CRM™ connects your calls, pipelines, follow-up and customer lifecycle in one place."
      />
    </MarketingLayout>
  );
}
