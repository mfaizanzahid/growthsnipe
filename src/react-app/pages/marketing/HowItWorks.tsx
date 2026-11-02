import { Link } from "react-router-dom";
import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import { CtaBand, PageHero, SectionHeading, TrustCallout } from "../../components/marketing/MarketingBits";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";

const STEPS = [
  {
    title: "Understand the business",
    body: "We learn how your company gets work, what you sell, how customers book, how jobs are fulfilled and what growth means to you. Where possible, we review relevant business and marketing data to establish a baseline.",
  },
  {
    title: "Diagnose the leaks",
    body: "The SNIPE Diagnostic™ reviews the available performance data and customer journey. We identify friction in acquisition, response, booking, ticket size, repeat revenue and referral activity.",
  },
  {
    title: "Build the Blueprint",
    body: "The SNIPE Blueprint™ turns the findings into a 12-month growth plan: targets, economics, channel mix, workflows, revenue opportunities, capacity considerations and execution priorities.",
  },
  {
    title: "Install the system",
    body: "If you choose SNIPE Engine™, we configure the customer pipeline, call handling, workflows, tracking, campaigns and reporting. The setup includes a 21-day launch runway, subject to access, approvals and third-party dependencies.",
  },
  {
    title: "Run and improve",
    body: "We work to the agreed plan, review performance, address issues and adjust priorities as the business and market change. The selected SNIPE Engine™ plan determines the cadence and level of live operational support.",
  },
];

export function HowItWorks() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="How GrowthSnipe works"
        title="A clear path from where you are to a system built for where you want to go."
        lede="No mystery retainers. No random collection of marketing tasks. A defined process that starts with the business numbers and moves into implementation and ongoing improvement."
      />
      <section className="mx-auto w-full max-w-6xl px-4 pb-14">
        <div className="text-center">
          <Button size="lg" asChild>
            <Link to="/book">Book a Free Growth Fit Call</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-16">
        <div className="mx-auto max-w-3xl space-y-4">
          {STEPS.map((s, i) => (
            <Card key={s.title}>
              <CardHeader>
                <span className="text-sm font-semibold text-primary">Step {i + 1}</span>
                <CardTitle className="text-lg">{s.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground">{s.body}</CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-t bg-muted/40">
        <div className="mx-auto w-full max-w-3xl px-4 py-16 text-center">
          <SectionHeading
            eyebrow="Start at the right level"
            title="Pick the entry point that fits."
          />
          <ul className="mx-auto mt-6 max-w-2xl space-y-2 text-left text-muted-foreground">
            <li>Need ideas you can implement yourself? Start with free SNIPE Loops™.</li>
            <li>Need to understand where the process is leaking? Start with the Diagnostic.</li>
            <li>Need a complete plan? Get the Blueprint.</li>
            <li>Need a partner to implement and operate the system? Explore SNIPE Engine™.</li>
          </ul>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" asChild>
              <Link to="/book">Find My Best Starting Point</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/loop-library">Download SNIPE Loops™</Link>
            </Button>
          </div>
        </div>
      </section>

      <TrustCallout />

      <CtaBand
        title="See the runway with your numbers."
        body="Book a discovery call. We will map the 21 days against your calendar and your software, not a template."
      />
    </MarketingLayout>
  );
}
