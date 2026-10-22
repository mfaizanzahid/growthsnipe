import { Link } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import {
  CtaBand,
  Faq,
  PageHero,
  SectionHeading,
  TrustCallout,
} from "../../components/marketing/MarketingBits";

const PHASES = [
  {
    range: "Days 1 to 3",
    title: "Technical ingestion",
    body: "We connect your booking platform, CRM, phones, and ad accounts. Nothing migrates. We read what you already run.",
  },
  {
    range: "Days 4 to 8",
    title: "Booking platform overhaul",
    body: "Services, package tiers, add-ons, and availability are rebuilt so the calendar can sell the ticket ladder.",
  },
  {
    range: "Days 9 to 14",
    title: "CRM, telephony, and capture",
    body: "GoHighLevel, tracking numbers, live answer routing, and Voice AI fallback go live. Speed to lead is measured from day one.",
  },
  {
    range: "Days 15 to 21",
    title: "Launch and verification",
    body: "Campaigns, landing pages, and tracking are verified end to end. The first scorecard is delivered before launch is called complete.",
  },
  {
    range: "Days 22 to 90",
    title: "Optimize and ramp",
    body: "Weekly scorecard, strategy calls, paid media scaling, and call coaching. Capacity triggers tell us when to add supply.",
  },
];

const ENGINE = [
  {
    title: "Engine Core",
    body: "Your team answers first. We build the system, run the scorecard, manage up to $3,000 a month in ad spend, and meet weekly.",
  },
  {
    title: "Engine Command",
    body: "Our live team answers first. We run up to $10,000 a month in ad spend, take the pod lead role on VoiceIQ alerts, and hold two strategy calls a month.",
  },
];

const FAQ_ITEMS = [
  {
    q: "Do you replace my booking software?",
    a: "No. We work inside Spectora, ISN, ServiceTitan, Housecall Pro, Jobber, or whichever platform you run. Your data stays in your system.",
  },
  {
    q: "Who answers the phone?",
    a: "On Core, your team answers first with Voice AI as fallback and overflow. On Command, our live team answers first and your team is the backup.",
  },
  {
    q: "What counts as a booked inspection?",
    a: "A confirmed appointment on the calendar with a real address, service, and price. Clicks, form fills, and unconfirmed requests do not count.",
  },
  {
    q: "How fast do we see results?",
    a: "The system is live inside 21 days. Capture and ticket changes usually show in the first scorecard. Paid media compounds after that.",
  },
  {
    q: "What do you need from me?",
    a: "Access to your systems, one decision-maker, and about two hours a week during the build. After launch, the weekly scorecard call is the main commitment.",
  },
  {
    q: "Is there a long contract?",
    a: "Engine engagements have a six-month minimum because the build and ramp need that window. SNIPE Intelligence™ is month to month after the trial.",
  },
];

export function HowItWorks() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="How it works"
        title="Access to live in 21 days. Then we run it."
        lede="Every Engine engagement follows the same runway: connect the systems, rebuild the booking path, put capture and campaigns in place, verify, then optimize against one scorecard."
      />

      <section className="mx-auto w-full max-w-6xl px-4 pb-14">
        <div className="grid gap-4 md:grid-cols-5">
          {PHASES.map((p, i) => (
            <Card key={p.title} className="flex flex-col">
              <CardHeader>
                <span className="text-xs font-semibold tracking-wide text-primary uppercase">
                  {p.range}
                </span>
                <CardTitle className="text-base">
                  {i + 1}. {p.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{p.body}</CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-y bg-muted/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-14">
          <SectionHeading
            eyebrow="Two ways to run it"
            title="Your team or ours."
            body="Same system, same scorecard. The difference is who picks up the phone and who owns the weekly execution."
          />
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {ENGINE.map((e) => (
              <Card key={e.title}>
                <CardHeader>
                  <CardTitle>{e.title}</CardTitle>
                  <CardDescription>{e.body}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/contact">Talk through {e.title}</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-14">
        <SectionHeading
          eyebrow="Commitments"
          title="Two guarantees, spelled out."
          body="Live in 30 days or the next month of management is free. Optimization guarantee: if the plan targets are not met after the optimization window, we extend management at no added fee until they are."
        />
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Live-in-30 guarantee</CardTitle>
              <CardDescription>
                If the system is not live within 30 days of access, the next month of management is on us.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Optimization extension</CardTitle>
              <CardDescription>
                If the agreed targets are not met in the optimization window, we keep working at no added management fee until they are.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>

      <section className="border-t">
        <div className="mx-auto w-full max-w-6xl px-4 py-14">
          <SectionHeading eyebrow="Questions" title="What owners ask first" />
          <Faq items={FAQ_ITEMS} />
        </div>
      </section>

      <TrustCallout />

      <CtaBand
        title="See the runway with your numbers"
        body="Book a discovery call. We will map the 21 days against your calendar and your software, not a template."
      />
    </MarketingLayout>
  );
}
