import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import { PageHero } from "../../components/marketing/MarketingBits";

const STEPS = [
  "Check your email for the secure connect link.",
  "Connect Spectora or ISN. The credentials are encrypted and removed after your report.",
  "We pull your last 12 months of jobs, revenue, referrals, and service mix.",
  "We email your report and coordinate your 60-minute readout.",
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
        <p className="mt-6 rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">Secure connection:</span> Your credentials are encrypted and used only for this Diagnostic. They are removed once your report is ready.
        </p>
      </section>
    </MarketingLayout>
  );
}
