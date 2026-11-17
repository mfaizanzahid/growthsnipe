import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import { PageHero } from "../../components/marketing/MarketingBits";
import { OFFERS } from "../../../lib/offers";
import { ThankYouEmailNote } from "./ThankYouEmailNote";
import { ThankYouNextSteps } from "./ThankYouNextSteps";

const STEPS = [
  "Check your email for the playbook download link.",
  "Open the PDF and choose the chapter for your trade.",
  "Pick one loop that fixes a current problem and follow its four parts.",
  "Review the sample recipes and scripts, then adapt one to your process.",
];

export function ThankYouLoops() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Thank you"
        title="Your SNIPE Loops™ playbook is on the way."
        lede="Your order is complete. The branded PDF download link is in your inbox."
      />
      <section className="mx-auto w-full max-w-2xl px-4 pb-14">
        <ol className="list-decimal space-y-2 pl-6 text-muted-foreground">
          {STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <ThankYouEmailNote />
        <div className="mt-6 rounded-xl border bg-muted/40 p-5">
          <h2 className="font-semibold">What is inside</h2>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            <li>The eight revenue loops and the customer lifecycle map.</li>
            <li>Trade chapters for all six trades we cover.</li>
            <li>Sample end-to-end recipes and a follow-up script library.</li>
            <li>A simple monthly review to see what is working.</li>
          </ul>
        </div>
        <p className="mt-6 text-sm text-muted-foreground">
          If the download link does not arrive, reply to the email and we will send a fresh one.
        </p>
        <ThankYouNextSteps
          title="Find the loop with the most revenue behind it"
          body={`The ${OFFERS.diagnostic.name} reviews 12 months of your booking data, builds a business-specific Leak Map and ranks the findings by impact and effort.`}
          nextLabel={`Explore ${OFFERS.diagnostic.name}`}
          nextHref="/diagnostic"
        />
      </section>
    </MarketingLayout>
  );
}
