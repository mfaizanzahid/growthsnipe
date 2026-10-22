import { Link } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import { CtaBand, PageHero, SectionHeading } from "../../components/marketing/MarketingBits";

const CASES = [
  {
    name: "Hale Home Inspections",
    profile: "Two inspectors, one office manager, Spectora",
    problem:
      "Calls rang out during inspections and web leads waited hours. The owner assumed demand was seasonal.",
    work: "Live answer routing, Voice AI fallback, a three-tier package, and Google Search campaigns with call tracking.",
    result: "Missed calls fell by roughly two thirds in the first month, and booked jobs grew before ad spend increased.",
  },
  {
    name: "Whitfield Property Inspections",
    profile: "Six inspectors, ISN, heavy realtor referral base",
    problem:
      "Average ticket was flat for two years because add-on services were offered only when an inspector remembered.",
    work: "A consistent add-on script, package tiers in the booking platform, and VoiceIQ call scoring with weekly coaching.",
    result: "Average ticket moved from roughly $560 to $690 without raising the base inspection fee.",
  },
  {
    name: "Ortega Inspection Group",
    profile: "Eleven inspectors across three markets, ServiceTitan and GoHighLevel",
    problem:
      "Three referral agents supplied most of the work, and paid media had no reliable cost per booked job.",
    work: "Full Engine Command build: CRM, phones, geo landing pages, Google and Meta campaigns, and a weekly scorecard.",
    result: "Cost per booked inspection became visible in week one, and no campaign survived past two weeks without a booking.",
  },
];

export function CaseStudies() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Case studies"
        title="What the work looks like when it is running."
        lede="Illustrative customer stories based on typical GrowthSnipe engagements. Names and figures are representative, not testimonials from named real businesses."
      />

      <section className="mx-auto w-full max-w-6xl px-4 pb-14">
        <div className="grid gap-4 lg:grid-cols-3">
          {CASES.map((c) => (
            <Card key={c.name} className="flex flex-col">
              <CardHeader>
                <CardTitle className="text-base">{c.name}</CardTitle>
                <CardDescription>{c.profile}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-4 text-sm">
                <div>
                  <p className="text-xs font-semibold tracking-wide text-primary uppercase">The problem</p>
                  <p className="mt-1 text-muted-foreground">{c.problem}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold tracking-wide text-primary uppercase">The work</p>
                  <p className="mt-1 text-muted-foreground">{c.work}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold tracking-wide text-primary uppercase">The result</p>
                  <p className="mt-1 text-muted-foreground">{c.result}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <p className="mt-8 text-center text-xs text-muted-foreground">
          Illustrative examples. Results depend on market, capacity, and execution. We do not guarantee revenue outcomes.
        </p>
      </section>

      <section className="border-t bg-muted/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-14">
          <SectionHeading
            eyebrow="What we measure"
            title="The same scorecard in every engagement."
            body="Booked jobs, average ticket, answer rate, speed to lead, lead source, and cost per booked inspection. If a number cannot be tied to a booked job, it does not lead the report."
          />
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild>
              <Link to="/contact">Get your own Leak Scorecard</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/pricing">Compare plans</Link>
            </Button>
          </div>
        </div>
      </section>

      <CtaBand
        title="Bring us your numbers"
        body="Book a discovery call and we will size the gap in dollars before you commit to anything."
      />
    </MarketingLayout>
  );
}
