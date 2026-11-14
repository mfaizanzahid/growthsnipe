import { Link } from "react-router-dom";
import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import { CtaBand, Faq, PageHero, SectionHeading } from "../../components/marketing/MarketingBits";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { CheckCircleIcon } from "@heroicons/react/24/outline";
import { OFFERS, OFFER_CREDITS } from "../../../lib/offers";

const INVESTIGATES = [
  {
    title: "Demand and lead sources",
    body: "Where enquiries originate, how source quality differs and whether the business can distinguish lead volume from valuable opportunities.",
  },
  {
    title: "Response and capture",
    body: "How calls, forms and messages are handled, what happens after hours, and where response delays or missed handoffs may occur.",
  },
  {
    title: "Booking and conversion",
    body: "How many enquiries become scheduled work, where prospects drop out and what follow-up is currently in place.",
  },
  {
    title: "Average ticket and service mix",
    body: "Whether packaging, add-ons and customer education create opportunities to improve the value of completed jobs.",
  },
  {
    title: "Repeat and referral revenue",
    body: "How previous customers, referral partners and lifecycle follow-up contribute, or fail to contribute, to the pipeline.",
  },
  {
    title: "Visibility and control",
    body: "Whether the owner can see the measures needed to make informed decisions about marketing, sales and capacity.",
  },
];

const RECEIVE = [
  "Diagnostic Snapshot: a summary of the business baseline and data coverage.",
  "Leak Map: a structured view of identified friction points and estimated financial exposure where enough evidence exists.",
  "Priority Findings: the issues worth addressing first, ranked by likely impact and practical effort.",
  "30-Minute Review: a live walkthrough, discussion and recommended next step.",
];

const STEPS = [
  "Purchase the Diagnostic.",
  "Receive the data checklist and secure submission instructions.",
  "Share the agreed business exports and contact details.",
  "We review the available information and conduct the response-time test.",
  "Join the 30-minute review and decide whether to execute independently or build a full SNIPE Blueprint™.",
];

const FAQS = [
  {
    q: "Do I need to connect my software?",
    a: "Not necessarily. We will provide a data checklist and accept agreed exports or reports where available.",
  },
  {
    q: "Will you tell me exactly how much revenue I am losing?",
    a: "We quantify only what the available data can support. Where an estimate requires assumptions, those assumptions will be visible.",
  },
  {
    q: "Does the Diagnostic include implementation?",
    a: "No. It is a paid analysis and review. Implementation is available through the Blueprint and SNIPE Engine™.",
  },
];

export function Diagnostic() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Find the leaks before you spend more"
        title="Where is your business losing the growth it has already paid to create?"
        lede="The SNIPE Diagnostic™ reviews your last 12 months of business performance and maps the friction between enquiries, conversations, bookings, job value and repeat opportunities. You will receive a clear view of what the numbers say, what may be holding the business back and where to investigate first."
      />
      <section className="mx-auto w-full max-w-6xl px-4 pb-14">
        <Card className="mx-auto max-w-2xl text-center">
          <CardHeader>
            <CardTitle className="text-3xl">
              {OFFERS.diagnostic.name}: {OFFERS.diagnostic.price.label} one-time
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-2 text-left text-sm">
              {[
                "Review of up to 12 months of supplied business data.",
                "A business-specific Leak Map with quantified opportunities where the data supports it.",
                "A response-time test of your current enquiry experience.",
                "A 30-minute findings and recommendations review.",
                "100% credited toward a SNIPE Blueprint™ purchased within 14 days.",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
            <Button size="lg" className="w-full sm:w-auto" asChild>
              <Link to={OFFERS.diagnostic.checkoutPath}>Get My SNIPE Diagnostic™</Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="border-t bg-muted/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-16">
          <SectionHeading
            eyebrow="What we investigate"
            title="Six places where growth leaks out"
          />
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {INVESTIGATES.map((item) => (
              <Card key={item.title}>
                <CardHeader>
                  <CardTitle className="text-base">{item.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{item.body}</CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-16">
        <SectionHeading
          eyebrow="Deliverables"
          title="What you receive"
          body="Where source data is missing or incomplete, we will identify the gap rather than invent a number. Any estimates will be labeled and the assumptions shown."
        />
        <div className="mx-auto mt-8 max-w-3xl space-y-3">
          {RECEIVE.map((item, i) => (
            <div key={item} className="flex items-start gap-3 rounded-lg border p-4">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                {i + 1}
              </span>
              <p className="text-sm text-muted-foreground">{item}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t bg-muted/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-16">
          <SectionHeading eyebrow="Process" title="How it works" />
          <div className="mx-auto mt-8 max-w-3xl space-y-3">
            {STEPS.map((step, i) => (
              <div key={step} className="flex items-start gap-3 rounded-lg border bg-card p-4">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                  {i + 1}
                </span>
                <p className="text-sm text-muted-foreground">{step}</p>
              </div>
            ))}
          </div>
          <p className="mx-auto mt-4 max-w-2xl text-center text-sm text-muted-foreground">
            The review begins after payment and receipt of the required information. No business outcome is guaranteed.
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-3xl px-4 py-16 text-center">
        <SectionHeading
          eyebrow="Next-step credit"
          title="Do not pay twice to keep moving forward."
        />
        <p className="mt-4 text-muted-foreground">{OFFER_CREDITS.diagnosticToBlueprint.text}</p>
        <div className="mt-6">
          <Button size="lg" asChild>
            <Link to={OFFERS.diagnostic.checkoutPath}>
              Start My SNIPE Diagnostic™, {OFFERS.diagnostic.price.label}
            </Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-16">
        <SectionHeading eyebrow="FAQ" title="Diagnostic questions, answered" />
        <Faq items={FAQS} />
      </section>

      <CtaBand
        title="Find the leaks before you spend more."
        body="A 12-month performance review, a quantified Leak Map and a 30-minute review call with a clear recommended next step."
      />
    </MarketingLayout>
  );
}
