import { OneTimeCheckout } from "./OneTimeCheckout";
import { OFFERS } from "../../../lib/offers";

export function CheckoutDiagnostic() {
  return (
    <OneTimeCheckout
      slug="diagnostic"
      eyebrow="Checkout"
      title="Find the leaks in your growth process."
      lede={`Your SNIPE Diagnostic is ${OFFERS.diagnostic.price.label} one-time. Review of up to 12 months of supplied business data, a Leak Map, response-time test and 60-minute readout.`}
      includes={[
        "Review of up to 12 months of supplied business data.",
        "A business-specific Leak Map with quantified opportunities where the data supports it.",
        "A response-time test of your current enquiry experience.",
        "A 60-minute findings and recommendations call.",
      ]}
      checkoutNote={`The review begins after payment and receipt of the required information. The ${OFFERS.diagnostic.price.label} fee is credited toward a SNIPE Blueprint purchased within 14 days of your Diagnostic readout. No business outcome is guaranteed.`}
      thankYouPath="/thank-you/diagnostic"
    />
  );
}
