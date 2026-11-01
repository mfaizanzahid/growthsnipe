import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import { PageHero } from "../../components/marketing/MarketingBits";

export function ThankYouLoopLibrary() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Thank you"
        title="Your Loop Library is ready."
        lede="Check your inbox for the access link. Start with one workflow that solves a current problem, such as missed-call follow-up, quote follow-up or review requests."
      />
      <section className="mx-auto w-full max-w-2xl px-4 pb-14">
        <p className="text-muted-foreground">
          Configure it carefully, test it and make sure the messaging fits your customers and applicable communication rules.
        </p>
      </section>
    </MarketingLayout>
  );
}
