import { OneTimeCheckout } from "./OneTimeCheckout";
import { OFFERS } from "../../../lib/offers";

export function CheckoutLoops() {
  return (
    <OneTimeCheckout
      slug="loops"
      eyebrow="Checkout"
      title="Get the SNIPE Loops™ playbook."
      lede={`The full SNIPE Loops™ playbook is ${OFFERS.loops.listPrice.label} today, and your ${OFFERS.loops.promoCode} code takes 100% off at checkout. You pay $0, no card required. We email the branded PDF as soon as your order is complete.`}
      includes={[
        "The eight revenue loops, from booking-cart upsell to partner reactivation.",
        "Trade chapters for home inspection, HVAC, plumbing, electrical, roofing and general contracting.",
        "The customer lifecycle map and a simple monthly review.",
        "Sample end-to-end recipes and ready-to-adapt call, text and email scripts.",
        "A branded PDF with a clickable table of contents, emailed after checkout.",
      ]}
      checkoutNote={`Your ${OFFERS.loops.promoCode} code is applied automatically, so no payment is due and no card is needed. We email the download link to the address you enter. The playbook is a standard document, not a personalized plan. No business outcome is guaranteed.`}
      thankYouPath={OFFERS.loops.thankYouPath}
      autoCouponCode={OFFERS.loops.promoCode}
      requireBillingAddress={false}
      showMarketingConsent
    />
  );
}
