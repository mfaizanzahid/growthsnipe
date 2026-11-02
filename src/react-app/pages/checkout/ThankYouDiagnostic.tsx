import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import { PageHero } from "../../components/marketing/MarketingBits";

const STEPS = [
  "Check your email for the data checklist and secure submission instructions.",
  "Gather the available reports and exports.",
  "Submit the information using the secure method provided.",
  "We will confirm receipt and coordinate your 60-minute readout.",
];

export function ThankYouDiagnostic() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Thank you"
        title="Your Diagnostic is underway."
        lede="Thank you for purchasing the SNIPE Diagnostic™. The next step is to provide the business information needed for a useful review."
      />
      <section className="mx-auto w-full max-w-2xl px-4 pb-14">
        <ol className="list-decimal space-y-2 pl-6 text-muted-foreground">
          {STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="mt-6 rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">Important:</span> If a data point is unavailable, tell us. We would rather identify a gap than fill it with a guess.
        </p>
      </section>
    </MarketingLayout>
  );
}
