import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import { PageHero } from "../../components/marketing/MarketingBits";

const NEXT = [
  "Your intake checklist.",
  "Secure data-submission instructions.",
  "A confirmation when the information is complete.",
  "A scheduling link for your 90-minute Blueprint presentation.",
];

export function ThankYouBlueprint() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Thank you"
        title="Let's build your growth plan."
        lede="Thank you for purchasing the SNIPE Blueprint™. Your next step is to secure the baseline for your plan. The 10-business-day delivery window begins once the required information is complete."
      />
      <section className="mx-auto w-full max-w-2xl space-y-6 px-4 pb-14">
        <div>
          <h2 className="font-semibold">Your baseline</h2>
          <p className="mt-2 text-muted-foreground">
            If you already purchased a SNIPE Diagnostic™, we will use that baseline. Otherwise, we
            will email you a secure link to connect your software so we can build it.
          </p>
        </div>
        <div>
          <h2 className="font-semibold">You will receive:</h2>
          <ul className="mt-2 list-disc space-y-1 pl-6 text-muted-foreground">
            {NEXT.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>
    </MarketingLayout>
  );
}
