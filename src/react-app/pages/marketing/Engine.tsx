import { Link } from "react-router-dom";
import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import { CtaBand, PageHero, SectionHeading } from "../../components/marketing/MarketingBits";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { CheckCircleIcon } from "@heroicons/react/24/outline";

const FEATURES: Array<{ title: string; body: string }> = [
  {
    title: "Marketing that answers to booked work",
    body: "Paid search and agreed paid media campaigns, planned against your numbers and managed week to week.",
  },
  {
    title: "Calls answered, every time",
    body: "Live intake and booking support from our team, with configured Voice AI fallback for overflow and after hours.",
  },
  {
    title: "A CRM that holds the whole journey",
    body: "Lead capture, routing, pipelines, customer records and follow-up workflows in SNIPE CRM™, configured around your trade.",
  },
  {
    title: "Revenue Loops that bring work back",
    body: "Follow-up, review, reactivation and repeat-business loops installed and run for you.",
  },
  {
    title: "Reputation and partners, handled",
    body: "Review and reputation workflows including review-response management.",
  },
  {
    title: "Visibility you can act on",
    body: "Performance visibility through SNIPE Intelligence™, a dynamic, real-time analytics dashboard.",
  },
];

const FLAT_FEATURES: string[] = [
  "Growth strategy and recurring plan reviews tied to your numbers.",
  "Paid search and paid media campaigns, managed against your numbers.",
  "Campaign and landing-page structure tied to revenue targets.",
  "Local Services Ads, Search and Meta campaign management.",
  "Google Business Profile, service-area pages and review groundwork.",
  "Live intake and booking support, with Voice AI fallback.",
  "VoIP migration, multi-line routing and extended-hours coverage.",
  "Call routing, recording and quality insights through SNIPE VoiceIQ™.",
  "SNIPE CRM™ holds every lead, pipeline, customer record and follow-up workflow.",
  "Booking-platform configuration and custom integrations.",
  "Quote chasing, confirmations, reschedules and outbound calling.",
  "Revenue Loops for follow-up, reviews, reactivation and repeat business.",
  "Review requests, review responses and Partner Flywheel outreach.",
  "SNIPE Intelligence™: a dynamic, real-time analytics dashboard with forecasting and clear next actions.",
];

export function Engine() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="The plan-to-booked operating partnership"
        title="We do not hand you a plan and disappear. We help run the system."
        lede="SNIPE Engine™ turns your growth plan into a working operating system. We configure the infrastructure, manage the agreed marketing and follow-up activities, support call capture and keep performance visible, so the owner is not left coordinating a collection of disconnected vendors."
      />
      <section className="mx-auto w-full max-w-6xl px-4 pb-14">
        <div className="mx-auto max-w-2xl text-center">
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" asChild>
              <Link to="/book">Book a Free Growth Fit Call</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href="#included">See What&apos;s Included</a>
            </Button>
          </div>
        </div>
      </section>

      <section id="included" className="scroll-mt-20 border-t bg-muted/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-16">
          <SectionHeading
            eyebrow="What SNIPE Engine™ runs"
            title="One partnership that runs the whole growth system."
            body="We install the systems below and help run them. Every engagement is scoped one on one."
          />
          <div className="mx-auto mt-10 grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-xl border bg-card p-6">
                <p className="font-semibold">{f.title}</p>
                <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-16">
        <div className="mx-auto max-w-4xl">
          <SectionHeading
            eyebrow="Inside SNIPE Engine™"
            title="Every system your growth runs on."
          />
          <ul className="mx-auto mt-10 max-w-3xl space-y-2 text-sm text-muted-foreground">
            {FLAT_FEATURES.map((point) => (
              <li key={point} className="flex items-start gap-2">
                <CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                {point}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-16">
        <div className="mx-auto grid max-w-4xl gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">What the 21-day launch runway means</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                Onboarding includes a focused launch sequence. During the 21-day runway, the teams work through access, tracking, phone and lead routing, CRM configuration, priority workflows and initial paid campaign launch, subject to timely access, approvals, platform verification and any required third-party review. The exact sequence depends on the client&apos;s starting point and scope.
              </p>
              <p>
                This is not a promise that every campaign, integration or third-party approval will be live within 21 calendar days regardless of client dependencies.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Talk to us about SNIPE Engine™</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                Tell us about your business, goals and capacity. We will confirm the scope and next steps in writing before anything starts. Advertising spend is paid separately by the client to the advertising platform.
              </p>
              <Button asChild>
                <Link to="/book">Book a Free Growth Fit Call</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      <CtaBand
        title="Your plan deserves an operating team."
        body="Book a free 20-minute Growth Fit Call. We will discuss your goals, current setup, capacity and the level of support that makes sense."
      />
    </MarketingLayout>
  );
}
