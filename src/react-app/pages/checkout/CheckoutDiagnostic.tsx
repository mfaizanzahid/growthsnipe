import { OneTimeCheckout } from "./OneTimeCheckout";
import { OFFERS } from "../../../lib/offers";

export function CheckoutDiagnostic() {
  return (
    <OneTimeCheckout
      slug="diagnostic"
      eyebrow="Checkout"
      title="Find the leaks in your growth process."
      lede={`Your SNIPE Diagnostic™ is ${OFFERS.diagnostic.price.label} one-time. Review of up to 12 months of supplied business data, a Leak Map, service-mix and referral review, plus a bonus 30-minute review call and the SNIPE Loops™ library included as a bonus.`}
      includes={[
        "Review of up to 12 months of supplied business data.",
        "A business-specific Leak Map with quantified opportunities where the data supports it.",
        "A service-mix, cancellation and referral review.",
        "Bonus: SNIPE Loops™ library.",
        "Bonus: 30-minute findings and recommendations review.",
        "Bonus: data checklist and secure submission guide.",
        "Bonus: SNIPE System framework scores.",
        `Bonus: ${OFFERS.diagnostic.price.label} credit toward a SNIPE Blueprint™ within 14 days.`,
      ]}
      checkoutNote={`The review begins after payment and receipt of the required information. The Diagnostic includes the SNIPE Loops™ library and a bonus 30-minute review call. The ${OFFERS.diagnostic.price.label} fee is credited toward a SNIPE Blueprint™ purchased within 14 days of your Diagnostic review. No business outcome is guaranteed.`}
      thankYouPath="/thank-you/diagnostic"
    />
  );
}
