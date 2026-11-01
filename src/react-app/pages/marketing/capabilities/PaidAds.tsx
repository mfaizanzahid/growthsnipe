import { Link } from "react-router-dom";
import { MarketingLayout } from "../../../components/marketing/MarketingLayout";
import { CtaBand, PageHero, SectionHeading, TrustCallout } from "../../../components/marketing/MarketingBits";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { CheckCircleIcon } from "@heroicons/react/24/outline";
import { OFFERS } from "../../../../lib/offers";

const INCLUDES = [
  "Growth target and channel planning.",
  "Service, offer and geographic prioritization.",
  "Campaign and landing-page structure.",
  "Lead tracking and source attribution.",
  "Call and form conversion pathways.",
  "Lead quality and booking feedback.",
  "Budget pacing and ongoing optimization.",
  "Reporting connected to booked-job outcomes where data is available.",
];

export function PaidAds() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Paid acquisition"
        title="Ads should create profitable opportunities, not just a busy dashboard."
        lede="GrowthSnipe plans and manages paid campaigns around the economics of your business. We start with the target, service mix, capacity and conversion process, then build campaigns designed to produce measurable demand you can actually handle."
      />
      <section className="mx-auto w-full max-w-6xl px-4 pb-14">
        <div className="text-center">
          <Button size="lg" asChild>
            <Link to="/book">Plan My Ad Campaigns</Link>
          </Button>
        </div>
      </section>

      <section className="border-t bg-muted/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-16">
          <SectionHeading
            eyebrow="What our process includes"
            title="A campaign process built around booked work."
          />
          <div className="mx-auto mt-8 grid max-w-4xl gap-3 md:grid-cols-2">
            {INCLUDES.map((item) => (
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
              <CardTitle className="text-base">Channels</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Depending on trade, location, budget and capacity, the campaign mix may include Google Search, Local Services Ads and Meta. Channel selection is based on the job economics and the available evidence, not a promise to use every platform.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">The difference</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              A standard ad report may tell you how many clicks and leads arrived. GrowthSnipe wants to know what happened next: Did the business respond? Was the enquiry qualified? Did it book? What was the job worth? Could the team fulfill it?
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="border-t bg-muted/40">
        <div className="mx-auto w-full max-w-3xl px-4 py-16 text-center">
          <SectionHeading
            eyebrow="Pricing context"
            title="Paid media lives inside Engine."
          />
          <p className="mt-4 text-muted-foreground">
            Paid media management is included within SNIPE Engine plan limits. Core covers eligible LSA and Search campaign management for up to {OFFERS.engineCore.adSpendCap.label}/month in client ad spend. Command covers eligible LSA, Search and Meta campaign management for up to {OFFERS.engineCommand.adSpendCap.label}/month in client ad spend. Ad spend is paid directly by the client. Any additional management fees are confirmed in writing.
          </p>
          <div className="mt-6">
            <Button size="lg" asChild>
              <Link to="/book">Book a Free Growth Fit Call</Link>
            </Button>
          </div>
        </div>
      </section>

      <TrustCallout />

      <CtaBand
        title="Judge every campaign on cost per booked job."
        body="Tell us about your business and we will map the channels, budget and booking process that make paid acquisition pay."
      />
    </MarketingLayout>
  );
}
