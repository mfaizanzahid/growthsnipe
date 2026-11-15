import { EnvelopeIcon } from "@heroicons/react/24/outline";
import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import { PageHero } from "../../components/marketing/MarketingBits";

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
                Your invoice and the instructions for the next step are on the way. If you do not
                see the email, check your spam folder or contact support.
              </p>
            </div>
          </div>
        </div>
        <div>
          <h2 className="font-semibold">Your baseline</h2>
          <p className="mt-2 text-muted-foreground">
            If you already purchased a SNIPE Diagnostic™, we will use that baseline. Otherwise, we
            will email you a secure link to connect your software so we can build it. The
            10-business-day delivery window begins once the required information is complete.
          </p>
        </div>
      </section>
    </MarketingLayout>
  );
}
