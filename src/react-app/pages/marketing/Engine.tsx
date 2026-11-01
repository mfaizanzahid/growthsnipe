import { Link } from "react-router-dom";
import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import { CtaBand, PageHero, SectionHeading } from "../../components/marketing/MarketingBits";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { CheckCircleIcon } from "@heroicons/react/24/outline";
import { OFFERS, OFFER_EXTRAS } from "../../../lib/offers";

const CONNECTS = [
  "Growth strategy and recurring plan reviews.",
  "Paid search and agreed paid media campaigns.",
  "Lead capture, routing and customer records through SNIPE CRM™.",
  "Call coverage, intake workflows and call-quality insights through SNIPE VoiceIQ™.",
  "Revenue loops for follow-up, reviews, reactivation and repeat business.",
  "Performance visibility through SNIPE Intelligence™.",
  "Referral partner and customer follow-up activities appropriate to the selected plan.",
];

const CORE_INCLUDED = [
  "21-day launch runway.",
  "Shared Growth Manager.",
  "SNIPE CRM™ with pipelines and workflows.",
  "Eight core Revenue Loops installed.",
  "Instant Capture workflows, missed-call text-back, configured Voice AI and chat.",
  "VoIP migration and call routing as scoped during onboarding.",
  "Automated quote follow-up and monthly customer reactivation campaigns.",
  "Review and reputation workflows.",
  `Local Services Ads and Google Search campaign management for up to ${OFFERS.engineCore.adSpendCap.label}/month in client ad spend.`,
  "Google Business Profile setup and weekly posts.",
  "One service-area / geographic page per month.",
  "Partner Flywheel assets, scripts and dormancy alerts.",
  "Full SNIPE Intelligence™ dashboard, weekly scorecard, forecasting and custom reports.",
  "45-minute strategy call every two weeks.",
  "Four-business-hour support response target.",
  "Blueprint refresh every six months.",
];

const COMMAND_INCLUDED = [
  "21-day launch runway.",
  "Dedicated Pod Lead.",
  "Live intake, booking, quote chasing and agreed admin support, up to 100 combined hours/month.",
  "Voice AI fallback coverage outside live-team coverage.",
  "SNIPE CRM™ with pipelines and workflows.",
  "All eight core Revenue Loops plus custom loops.",
  "Booking-platform configuration and custom integrations within the agreed scope.",
  "Full VoIP migration, multi-line routing and extended-hours coverage as scoped.",
  "Weekly quote and customer follow-up campaigns plus agreed outbound calling.",
  "Review workflows and review-response management.",
  `Local Services Ads, Google Search and Meta campaign management for up to ${OFFERS.engineCommand.adSpendCap.label}/month in client ad spend.`,
  "Google Business Profile management, three geographic pages per month, schema and answer-engine optimization work as scoped.",
  "Managed Partner Flywheel outreach, up to 100 contacts/month, plus partner check-in calls.",
  "Full SNIPE Intelligence™ dashboard, weekly scorecard, forecasting and custom reports, reviewed with your Pod Lead.",
  "Weekly strategy call.",
  "One-business-hour support response target.",
  "Quarterly Blueprint refresh.",
];

const COMPARISON: Array<[string, string, string]> = [
  ["One-time setup", OFFERS.engineCore.setup.label, OFFERS.engineCommand.setup.label],
  ["Monthly fee", OFFERS.engineCore.monthly.label, OFFERS.engineCommand.monthly.label],
  ["Best fit", "Owner-led team", "Team ready to delegate intake and admin"],
  ["Who answers first", "Client team", "GrowthSnipe live team"],
  ["Voice AI", "Fallback coverage", "Fallback coverage"],
  ["Live intake and booking", "Client team, with configured AI fallback", "GrowthSnipe team, up to 100 combined hours/month"],
  ["CRM and workflows", "Included", "Included"],
  ["Revenue Loops", "8 core loops", "8 core loops + custom loops"],
  ["Paid media", "LSA + Search, up to $3K/month ad spend", "LSA + Search + Meta, up to $10K/month ad spend"],
  ["Partner program", "Assets, scripts and alerts", "Managed outreach up to 100 contacts/month"],
  ["Analytics", "Full dashboard and weekly scorecard", "Full dashboard, weekly review with Pod Lead"],
  ["Strategy cadence", "Every two weeks", "Weekly"],
  ["Blueprint refresh", "Every six months", "Quarterly"],
  ["Support response target", "4 business hours", "1 business hour"],
];

export function Engine() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="The plan-to-booked operating partnership"
        title="We do not hand you a plan and disappear. We help run the system."
        lede="SNIPE Engine turns your growth plan into a working operating system. We configure the infrastructure, manage the agreed marketing and follow-up activities, support call capture and keep performance visible, so the owner is not left coordinating a collection of disconnected vendors."
      />
      <section className="mx-auto w-full max-w-6xl px-4 pb-14">
        <div className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-2">
          <Card className="text-center">
            <CardHeader>
              <CardTitle>Engine Core</CardTitle>
              <CardDescription>
                {OFFERS.engineCore.setup.label} setup + {OFFERS.engineCore.monthly.label}/month
              </CardDescription>
            </CardHeader>
          </Card>
          <Card className="text-center">
            <CardHeader>
              <CardTitle>Engine Command</CardTitle>
              <CardDescription>
                {OFFERS.engineCommand.setup.label} setup + {OFFERS.engineCommand.monthly.label}/month
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
        <p className="mx-auto mt-4 max-w-2xl text-center text-sm text-muted-foreground">
          Both plans include a 21-day launch runway within the setup fee. Advertising spend is paid directly by the client.
        </p>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button size="lg" asChild>
            <Link to="/book">Book a Free Growth Fit Call</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <a href="#compare">Compare the Plans</a>
          </Button>
        </div>
      </section>

      <section className="border-t bg-muted/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-16">
          <SectionHeading
            eyebrow="What Engine connects"
            title="One operating system for the whole growth process."
          />
          <ul className="mx-auto mt-8 max-w-3xl space-y-2">
            {CONNECTS.map((c) => (
              <li key={c} className="flex items-start gap-2 text-sm text-muted-foreground">
                <CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                {c}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-16">
        <SectionHeading
          eyebrow="Choose your operating model"
          title="Core or Command: pick the level of support you need."
        />
        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle>Engine Core</CardTitle>
              <CardDescription>For owner-led firms with someone on the team who can take live calls and callbacks.</CardDescription>
              <p className="pt-2 text-2xl font-bold">
                {OFFERS.engineCore.setup.label} <span className="text-sm font-normal text-muted-foreground">one-time setup</span> + {OFFERS.engineCore.monthly.label}
                <span className="text-sm font-normal text-muted-foreground">/month</span>
              </p>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col">
              <p className="text-sm text-muted-foreground">
                Your team remains first on the phone. When your team cannot answer, such as during a busy period or after hours, Voice AI provides configured fallback coverage to answer, capture details and handle supported booking tasks. Anything requiring a person can be routed into a callback task.
              </p>
              <ul className="mt-4 flex-1 space-y-2 text-sm text-muted-foreground">
                {CORE_INCLUDED.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
              <Button className="mt-6 w-full" asChild>
                <Link to="/book">See Whether Core Fits My Business</Link>
              </Button>
            </CardContent>
          </Card>
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle>Engine Command</CardTitle>
              <CardDescription>For firms that want to delegate more of intake, booking, admin and growth follow-up.</CardDescription>
              <p className="pt-2 text-2xl font-bold">
                {OFFERS.engineCommand.setup.label} <span className="text-sm font-normal text-muted-foreground">one-time setup</span> + {OFFERS.engineCommand.monthly.label}
                <span className="text-sm font-normal text-muted-foreground">/month</span>
              </p>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col">
              <p className="text-sm text-muted-foreground">
                Our trained live team takes the first agreed live intake and administrative work in your company&apos;s name, up to 100 combined hours per month. Voice AI provides fallback coverage during overflow, after hours or when the agreed team-hour cap is reached. Anything outside the supported scope is routed for the appropriate client decision or callback.
              </p>
              <ul className="mt-4 flex-1 space-y-2 text-sm text-muted-foreground">
                {COMMAND_INCLUDED.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
              <Button className="mt-6 w-full" asChild>
                <Link to="/book">See Whether Command Fits My Business</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      <section id="compare" className="border-t bg-muted/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-16">
          <SectionHeading
            eyebrow="Side by side"
            title="Core compared with Command."
          />
          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-160 text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-2 pr-4">Included</th>
                  <th className="py-2 pr-4">Engine Core</th>
                  <th className="py-2">Engine Command</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map(([label, core, command]) => (
                  <tr key={label} className="border-t">
                    <td className="py-2 pr-4 font-medium">{label}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{core}</td>
                    <td className="py-2 text-muted-foreground">{command}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-16">
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">What the 21-day launch runway means</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                The setup fee includes onboarding and a focused launch sequence. During the 21-day runway, the teams work through access, tracking, phone and lead routing, CRM configuration, priority workflows and initial paid campaign launch, subject to timely access, approvals, platform verification and any required third-party review. The exact sequence depends on the client&apos;s starting point and scope.
              </p>
              <p>
                This is not a promise that every campaign, integration or third-party approval will be live within 21 calendar days regardless of client dependencies.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Command hours and boundaries</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <ul className="list-disc space-y-2 pl-5">
                <li>Command includes up to 100 combined hours per month across live intake, booking and agreed admin activities.</li>
                <li>Unused hours do not roll over.</li>
                <li>Additional hours are available in 20-hour blocks for {OFFER_EXTRAS.extraHoursBlock.label}, subject to availability and written agreement.</li>
                <li>Included admin may cover appointment confirmations and reschedules, quote and invoice follow-up, CRM updates and partner scheduling.</li>
                <li>It does not include bookkeeping, payroll, field dispatch, licensed work or other out-of-scope responsibilities.</li>
                <li>A weekly utilization report shows how the hours are being used.</li>
                <li>When live coverage is unavailable or the agreed hours are used, configured Voice AI fallback and callback workflows apply.</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="border-t bg-muted/40">
        <div className="mx-auto w-full max-w-3xl px-4 py-16">
          <SectionHeading
            eyebrow="Pricing notes"
            title="Important pricing notes."
          />
          <ul className="mx-auto mt-6 max-w-2xl list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            <li>Advertising spend is separate and paid directly by the client to the advertising platform.</li>
            <li>Core campaign management covers up to {OFFERS.engineCore.adSpendCap.label}/month in client ad spend. Command covers up to {OFFERS.engineCommand.adSpendCap.label}/month. Spend above the plan limit is subject to the agreed incremental management fee.</li>
            <li>Platform, telephony, messaging and other third-party usage charges should be listed clearly in the proposal or service agreement before onboarding.</li>
            <li>Any work outside the written scope is quoted separately.</li>
          </ul>
        </div>
      </section>

      <CtaBand
        title="Your plan deserves an operating team."
        body="Book a free 20-minute Growth Fit Call. We will discuss your goals, current setup, capacity and the level of support that makes sense."
      />
    </MarketingLayout>
  );
}
