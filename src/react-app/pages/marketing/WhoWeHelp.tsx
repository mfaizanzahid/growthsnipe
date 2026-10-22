import { Link } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import {
  CtaBand,
  PageHero,
  SectionHeading,
  TrustCallout,
} from "../../components/marketing/MarketingBits";
import { usePageMeta } from "../../hooks/usePageMeta";
import { PAGE_META } from "../../components/marketing/page-meta";

const SEGMENTS = [
  {
    name: "Solo home inspectors",
    body: "One inspector, one calendar, and no one answering the phone during a crawl space. The fastest place to find a leak.",
  },
  {
    name: "Two to five inspector firms",
    body: "Enough volume to need a system, small enough that the owner still answers the phone and writes the estimates.",
  },
  {
    name: "Multi-inspector offices",
    body: "Several inspectors, a realtor base, and a manager who needs one scorecard instead of five reports.",
  },
  {
    name: "Adjacent home services",
    body: "HVAC, plumbing, electrical, roofing, and general contracting teams running ServiceTitan, Housecall Pro, or Jobber.",
  },
];

export function WhoWeHelp() {
  usePageMeta(PAGE_META["/who-we-help"]);
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Who we help"
        title="Owner-operated home-service businesses, starting with home inspectors."
        lede="GrowthSnipe is built for the owner who still runs the business, not a marketing department. Home inspectors first because that is where we know the software, the seasons, and the phone behavior."
      />

      <section className="mx-auto w-full max-w-6xl px-4 pb-14">
        <SectionHeading
          eyebrow="Where we fit"
          title="If the owner is still in the work, we can help."
          body="We are a poor fit for a business with no capacity, no answer process, or no willingness to change the booking path. We are a strong fit for an owner who wants the leak fixed, not another report."
        />
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {SEGMENTS.map((s) => (
            <Card key={s.name}>
              <CardHeader>
                <CardTitle className="text-base">{s.name}</CardTitle>
                <CardDescription>{s.body}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button variant="outline" asChild>
            <Link to="/how-it-works">How it works in 21 days</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/pricing">Compare plans</Link>
          </Button>
        </div>
      </section>

      <TrustCallout />

      <CtaBand
        title="Find your starting point"
        body="Start the free SNIPE Intelligence™ trial, or book a discovery call and we will tell you which plan fits."
      />
    </MarketingLayout>
  );
}
