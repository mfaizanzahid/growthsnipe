import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import { CtaBand, PageHero, SectionHeading } from "../../components/marketing/MarketingBits";
import { OfferCtaButton, OfferValueStack } from "../../components/marketing/OfferValueStack";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { OFFER_STACKS } from "../../../lib/offers";

const TRADES = [
  "Home inspection",
  "HVAC",
  "Plumbing",
  "Electrical",
  "Roofing",
  "General contracting",
];

const CATEGORIES = [
  {
    title: "Lead capture loops",
    body: "Missed-call text-back, web enquiry acknowledgement, after-hours response and unbooked-lead follow-up.",
  },
  {
    title: "Booking and pre-service loops",
    body: "Appointment confirmation, preparation reminders, reschedule recovery and relevant pre-service add-ons.",
  },
  {
    title: "Quote and estimate loops",
    body: "Quote follow-up, decision reminders, objection prompts and lost-estimate reactivation.",
  },
  {
    title: "Review and reputation loops",
    body: "Post-job review requests, review reminders and internal alerts when feedback needs attention.",
  },
  {
    title: "Repeat revenue loops",
    body: "Seasonal reminders, annual checkups, warranty milestones, maintenance renewals and re-test cycles.",
  },
  {
    title: "Referral partner loops",
    body: "Partner introduction, value follow-up, periodic check-ins and dormant-partner reactivation.",
  },
];

export function LoopLibrary() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Free tools for owners who want a better system"
        title="Stop letting good customers disappear after the first interaction."
        lede="Get practical automation recipes, follow-up scripts and customer lifecycle ideas you can adapt to your home-service business. SNIPE Loops™ is designed to help you capture more of the opportunities already around you, without starting with a complicated software project."
      />
      <section className="mx-auto w-full max-w-3xl px-4 pb-10">
        <OfferValueStack stack={OFFER_STACKS.loops} />
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Why is it free?</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            The library is free because it is the fastest way to show how we think. Use one loop this
            week. If you want the loops installed and run for you, the SNIPE Diagnostic™ and SNIPE
            Engine™ are the next step.
          </CardContent>
        </Card>
      </section>

      <section className="mx-auto w-full max-w-2xl px-4 pb-14">
        <Card>
          <CardHeader>
            <CardTitle>Get the playbook</CardTitle>
            <CardDescription>
              Free. No card required. Your branded PDF is emailed as soon as checkout is complete.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              The full playbook includes the eight revenue loops, six trade chapters, the customer lifecycle
              map, sample recipes and a follow-up script library. The discount is applied automatically at
              checkout.
            </p>
            <OfferCtaButton stack={OFFER_STACKS.loops} />
          </CardContent>
        </Card>
      </section>

      <section className="border-t bg-muted/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-16">
          <SectionHeading
            eyebrow="Inside the library"
            title="Six loop categories, one goal: no opportunity left behind."
          />
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {CATEGORIES.map((c) => (
              <Card key={c.title}>
                <CardHeader>
                  <CardTitle className="text-base">{c.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{c.body}</CardContent>
              </Card>
            ))}
          </div>
          <div className="mt-8 text-center">
            <OfferCtaButton stack={OFFER_STACKS.loops} />
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-16">
        <SectionHeading eyebrow="Trades covered" title="Pick your trade." body="The library will expand by trade and platform, with new recipes added over time." />
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {TRADES.map((t) => (
            <span key={t} className="rounded-full border px-4 py-1.5 text-sm text-muted-foreground">
              {t}
            </span>
          ))}
        </div>
        <div className="mt-6 text-center">
          <OfferCtaButton stack={OFFER_STACKS.loops} variant="outline" />
        </div>
      </section>

      <section className="border-t bg-muted/40">
        <div className="mx-auto w-full max-w-3xl px-4 py-16">
          <SectionHeading
            eyebrow="Sample recipe"
            title="The Unbooked Enquiry Follow-Up Loop"
          />
          <ol className="mx-auto mt-8 max-w-2xl list-decimal space-y-3 pl-6 text-sm text-muted-foreground">
            <li>New enquiry is recorded with source and service requested.</li>
            <li>Immediate acknowledgement confirms the enquiry was received.</li>
            <li>If no booking occurs, a relevant follow-up is sent after the configured interval.</li>
            <li>A team task is created when a personal response is required.</li>
            <li>The record is updated when the lead books, declines or becomes inactive.</li>
          </ol>
          <p className="mx-auto mt-6 max-w-2xl text-center text-sm text-muted-foreground">
            The recipe is a starting point, not a plug-and-play guarantee. Timing, wording, consent and platform configuration should be adapted to the business and applicable communication rules.
          </p>
          <div className="mt-6 text-center">
            <OfferCtaButton stack={OFFER_STACKS.loops} />
          </div>
        </div>
      </section>

      <CtaBand
        title="Take one leak off the table this week."
        body="Get the free playbook, adapt one loop to your process and start building a more consistent customer journey."
      />
    </MarketingLayout>
  );
}
