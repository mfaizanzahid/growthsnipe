import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import { PageHero } from "../../components/marketing/MarketingBits";
import { OFFERS } from "../../../lib/offers";

export function ThankYouLoopLibrary() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Thank you"
        title="Your SNIPE Loops™ are ready."
        lede="Check your inbox for the access link. Start with one workflow that solves a current problem, such as missed-call follow-up, quote follow-up or review requests."
      />
      <section className="mx-auto w-full max-w-2xl px-4 pb-14">
        <p className="text-muted-foreground">
          Configure it carefully, test it and make sure the messaging fits your customers and applicable communication rules.
        </p>
        <p className="mt-4 text-muted-foreground">
          You have the {OFFERS.loops.value.label} core library. It is also included as a bonus with the {OFFERS.diagnostic.name}, {OFFERS.blueprint.name} and SNIPE Engine™.
        </p>
      </section>
    </MarketingLayout>
  );
}
