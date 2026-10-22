import { Link } from "react-router-dom";
import { CheckCircleIcon, LinkIcon } from "@heroicons/react/24/outline";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import { CtaBand, PageHero, TrustCallout } from "../../components/marketing/MarketingBits";

const INTEGRATIONS = [
  {
    name: "Spectora",
    slug: "spectora",
    detail:
      "For inspection firms that want the numbers without exporting spreadsheets. We read orders, fees, services, and agent sources.",
    uses: ["Booked jobs and average ticket by week", "Service and add-on mix", "Agent and referral source trends"],
  },
  {
    name: "Inspection Support Network (ISN)",
    slug: "isn",
    detail:
      "For offices running on ISN orders, clients, and agents. We turn the order flow into one weekly read.",
    uses: ["Order volume and status", "Quote and follow-up gaps", "Agent production history"],
  },
  {
    name: "ServiceTitan",
    slug: "servicetitan",
    detail:
      "For HVAC, plumbing, electrical, and roofing teams. Revenue, calls, and booked jobs in one scorecard.",
    uses: ["Revenue and ticket trends", "Call booking rate", "Technician and crew load"],
  },
  {
    name: "Housecall Pro",
    slug: "housecall-pro",
    detail:
      "For smaller multi-trade teams. Jobs, estimates, and follow-up without a manual report.",
    uses: ["Jobs completed and scheduled", "Estimate win rate", "Lead source performance"],
  },
  {
    name: "Jobber",
    slug: "jobber",
    detail:
      "For general contracting and recurring service work. Quotes, jobs, and invoices connected to one plan.",
    uses: ["Quote-to-job conversion", "Recurring work pipeline", "Open invoice follow-up"],
  },
  {
    name: "GoHighLevel, Google, and Meta",
    slug: "growth-stack",
    detail:
      "The rest of the stack: CRM, call tracking, Google Ads, Local Services Ads, and Meta. One view from click to booked job.",
    uses: ["Cost per booked inspection", "Answer rate and speed to lead", "Campaign and source attribution"],
  },
];

export function Integrations() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Integrations"
        title="We work inside the stack you already run."
        lede="GrowthSnipe reads your booking software, CRM, phones, and ad accounts. Nothing migrates, nothing gets re-entered, and you keep ownership of every account."
      />

      <section className="mx-auto grid w-full max-w-6xl gap-4 px-4 pb-14 md:grid-cols-2">
        {INTEGRATIONS.map((i) => (
          <Card key={i.name}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="flex size-10 items-center justify-center rounded-lg border bg-muted/50">
                  <LinkIcon className="size-5 text-primary" aria-hidden />
                </span>
                {i.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{i.detail}</p>
              <ul className="space-y-2 text-sm">
                {i.uses.map((u) => (
                  <li key={u} className="flex items-start gap-2">
                    <CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    {u}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="border-t bg-muted/40">
        <div className="mx-auto w-full max-w-4xl px-4 py-12 text-center">
          <h2 className="text-2xl font-bold tracking-tight">Do not see your platform?</h2>
          <p className="mx-auto mt-2 max-w-2xl text-muted-foreground">
            If it holds your jobs, calls, or ad spend, we can probably read it. Tell us what you run
            and we will confirm during the discovery call.
          </p>
          <Button className="mt-6" asChild>
            <Link to="/contact">Ask about your stack</Link>
          </Button>
        </div>
      </section>

      <TrustCallout />

      <CtaBand
        title="Your calendar is the integration"
        body="Start the free SNIPE Intelligence™ trial and see your own numbers in one scorecard."
      />
    </MarketingLayout>
  );
}
