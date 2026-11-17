import { EnvelopeIcon } from "@heroicons/react/24/outline";
import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import { PageHero } from "../../components/marketing/MarketingBits";
import { OFFERS } from "../../../lib/offers";
import { ThankYouEmailNote } from "./ThankYouEmailNote";
import { ThankYouNextSteps } from "./ThankYouNextSteps";

export function ThankYouBlueprint() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Thank you"
        title="Let's build your growth plan."
        lede="Thank you for purchasing the SNIPE Blueprint™. Check the email you used at checkout for your invoice, next steps, and instructions."
      />
      <section className="mx-auto w-full max-w-2xl space-y-6 px-4 pb-14">
        <div className="rounded-xl border bg-muted/40 p-5">
          <div className="flex items-start gap-3">
            <EnvelopeIcon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
            <div>
              <h2 className="font-semibold">Check your email for next steps</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Your invoice and the instructions for the next step are on the way.
              </p>
            </div>
          </div>
        </div>
        <ThankYouEmailNote />
        <div className="rounded-xl border bg-muted/40 p-5">
          <h2 className="font-semibold">Your bonuses</h2>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            <li>{OFFERS.diagnostic.name} baseline and leak review, included as a bonus.</li>
            <li>{OFFERS.loops.name} library, a {OFFERS.loops.value.label} value, included as a bonus.</li>
            <li>Your bonus 30-minute discovery call and bonus 90-minute presentation are included.</li>
            <li>30 days of follow-up questions after your presentation.</li>
            <li>A {OFFERS.blueprint.price.label} credit toward SNIPE Engine™ setup if you sign within 30 days of your presentation.</li>
          </ul>
        </div>
        <div>
          <h2 className="font-semibold">Your baseline</h2>
          <p className="mt-2 text-muted-foreground">
            If you already purchased a SNIPE Diagnostic™, we will use that baseline. Otherwise, we
            will email you a secure link to connect your software so we can build it. The
            10-business-day delivery window begins once the required information is complete.
          </p>
        </div>
        <div>
          <h2 className="font-semibold">Book your discovery call</h2>
          <p className="mt-2 text-muted-foreground">
            Book your 30-minute discovery call with our team to confirm goals, data access and
            timing.
          </p>
          <p className="mt-3">
            <a
              className="font-semibold text-primary underline underline-offset-4"
              href="/blueprint-discovery-call"
            >
              Book your 30-minute discovery call
            </a>
          </p>
        </div>
        <ThankYouNextSteps
          title="Ready to have the system run for you?"
          body="SNIPE Engine™ installs and runs the marketing, call coverage, CRM, follow-up loops and reporting. Core and Command are scoped one on one."
          nextLabel="Explore SNIPE Engine™"
          nextHref="/engine"
        />
      </section>
    </MarketingLayout>
  );
}
