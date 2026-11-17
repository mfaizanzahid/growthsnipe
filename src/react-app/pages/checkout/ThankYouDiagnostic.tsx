import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import { PageHero } from "../../components/marketing/MarketingBits";
import { OFFERS } from "../../../lib/offers";
import { ThankYouEmailNote } from "./ThankYouEmailNote";
import { ThankYouNextSteps } from "./ThankYouNextSteps";

const STEPS = [
  "Check your email for the secure connect link.",
  "Connect your field service and booking management software. The credentials are encrypted and removed after your report.",
  "We pull your last 12 months of jobs, revenue, referrals, and service mix.",
  "We email your report and coordinate your 30-minute review.",
];

export function ThankYouDiagnostic() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Thank you"
        title="Your Diagnostic is underway."
        lede="Thank you for purchasing the SNIPE Diagnostic™. The next step is to connect your booking software so we can review your last 12 months of performance."
      />
      <section className="mx-auto w-full max-w-2xl px-4 pb-14">
        <ol className="list-decimal space-y-2 pl-6 text-muted-foreground">
          {STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <ThankYouEmailNote />
        <p className="mt-6 rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">Secure connection:</span> Your credentials are encrypted and used only for this Diagnostic. They are removed once your report is ready.
        </p>
        <div className="mt-6 rounded-xl border bg-muted/40 p-5">
          <h2 className="font-semibold">Your bonuses</h2>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            <li>{OFFERS.loops.name} library, a {OFFERS.loops.value.label} core price, is included. Check your email for access.</li>
            <li>Your bonus 30-minute findings and recommendations call is included.</li>
            <li>A {OFFERS.diagnostic.price.label} credit toward a {OFFERS.blueprint.name} within 14 days of your review.</li>
          </ul>
        </div>
        <ThankYouNextSteps
          title="Turn the findings into a 12-month plan"
          body={`The ${OFFERS.blueprint.name} includes your Diagnostic and ${OFFERS.loops.name}. A ${OFFERS.diagnostic.price.label} credit applies within 14 days of your review.`}
          nextLabel={`Explore ${OFFERS.blueprint.name}`}
          nextHref="/blueprint"
        />
      </section>
    </MarketingLayout>
  );
}
