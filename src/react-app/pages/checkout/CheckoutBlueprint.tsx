import { OneTimeCheckout } from "./OneTimeCheckout";
import { OFFERS } from "../../../lib/offers";

export function CheckoutBlueprint() {
  return (
    <OneTimeCheckout
      slug="blueprint"
      eyebrow="Checkout"
      title="Put your next 12 months of growth on paper, and into a plan."
      lede={`Your SNIPE Blueprint™ is ${OFFERS.blueprint.price.label} one-time and includes a personalized 12-month growth plan covering your baseline, packaging, channels, local visibility, recurring revenue, capacity and a 12-month roadmap, plus a bonus 30-minute discovery call, a bonus 90-minute presentation and 30 days of follow-up questions.`}
      includes={[
        "Personalized 12-month growth plan.",
        "Bonus: SNIPE Diagnostic™ baseline and leak review.",
        "Bonus: SNIPE Loops™ library.",
        "Delivered within 10 business days after complete intake and data receipt.",
        "Bonus: 30-minute discovery call with our team.",
        "Bonus: 90-minute presentation and walkthrough.",
        "Bonus: 30 days of follow-up questions.",
      ]}
      checkoutNote={`The 10-business-day delivery window begins after complete intake and receipt of required information. The Blueprint includes the SNIPE Diagnostic™ and SNIPE Loops™ as bonuses. The ${OFFERS.blueprint.price.label} fee is credited toward SNIPE Engine™ setup if you sign within 30 days of your Blueprint presentation.`}
      thankYouPath="/thank-you/blueprint"
    />
  );
}
