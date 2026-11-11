import { OneTimeCheckout } from "./OneTimeCheckout";
import { OFFERS } from "../../../lib/offers";

export function CheckoutBlueprint() {
  return (
    <OneTimeCheckout
      slug="blueprint"
      eyebrow="Checkout"
      title="Put your next 12 months of growth on paper, and into a plan."
      lede={`Your SNIPE Blueprint™ is ${OFFERS.blueprint.price.label} one-time and includes a personalized 25 to 35-page plan, a 90-minute presentation and 30 days of follow-up questions.`}
      includes={[
        "Personalized 25 to 35-page growth plan.",
        "Delivered within 10 business days after complete intake and data receipt.",
        "90-minute presentation and walkthrough.",
        "30 days of follow-up questions.",
      ]}
      checkoutNote={`The 10-business-day delivery window begins after complete intake and receipt of required information. The ${OFFERS.blueprint.price.label} fee is credited toward SNIPE Engine™ setup if you sign within 30 days of your Blueprint presentation.`}
      thankYouPath="/thank-you/blueprint"
      showCoupon
    />
  );
}
