import { Link } from "react-router-dom";
import { MarketingLayout } from "../../../components/marketing/MarketingLayout";
import { CtaBand, PageHero, SectionHeading, TrustCallout } from "../../../components/marketing/MarketingBits";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { CheckCircleIcon } from "@heroicons/react/24/outline";

const MONITORS = [
  "Lead volume and lead source.",
  "Speed to lead and call handling indicators.",
  "Booking rate and pipeline movement.",
  "Completed jobs and average ticket where source data is available.",
  "Campaign spend and acquisition measures.",
  "Add-on and service mix where tracked.",
  "Reviews and reputation activity.",
  "Referral partner activity.",
  "Capacity indicators and upcoming workload.",
];

export function Intelligence() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="SNIPE Intelligence™"
        title="Stop managing the business from a collection of disconnected reports."
        lede="SNIPE Intelligence™ brings the key measures of your growth system into a clearer operating view. See where enquiries come from, how they move through the pipeline, what gets booked and which issues deserve attention."
      />
      <section className="mx-auto w-full max-w-6xl px-4 pb-14">
        <div className="text-center">
          <Button size="lg" asChild>
            <Link to="/book">See a Sample Dashboard</Link>
          </Button>
        </div>
      </section>

      <section className="border-t bg-muted/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-16">
          <SectionHeading
            eyebrow="What you can monitor"
            title="The measures that run the business."
          />
          <div className="mx-auto mt-8 grid max-w-4xl gap-3 md:grid-cols-2 lg:grid-cols-3">
            {MONITORS.map((item) => (
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
              <CardTitle className="text-base">From data to decisions</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              A dashboard is useful only when it helps someone decide what to do. SNIPE Intelligence™ pairs visibility with scorecards, warning thresholds, forecasting views and regular review rhythms based on the selected SNIPE Engine™ plan.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Data integrity</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              The dashboard reflects the data sources and integrations available to the business. Where records are incomplete, definitions differ or data is unavailable, the dashboard should identify those limitations rather than imply false precision.
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
        title="See what is happening in your business."
        body="One scorecard for enquiries, bookings, ticket size and follow-up, reviewed on a rhythm that fits your plan."
      />
    </MarketingLayout>
  );
}
