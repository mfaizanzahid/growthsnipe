import { Link } from "react-router-dom";
import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import { CtaBand, Faq as FaqList, PageHero, SectionHeading } from "../../components/marketing/MarketingBits";
import { Button } from "../../components/ui/button";
import { OFFERS } from "../../../lib/offers";
import { formatWholeMoney } from "../../lib/money";

const blueprintRemainder = formatWholeMoney(
  OFFERS.blueprint.price.amountMinor - OFFERS.diagnostic.price.amountMinor,
);

const GENERAL = [
  {
    q: "What is GrowthSnipe?",
    a: "GrowthSnipe is a Plan-to-Booked Growth Partner for owner-operated home-service businesses. We plan, install and help run the connected systems behind acquisition, lead response, booking, customer follow-up, repeat revenue and performance visibility.",
  },
  {
    q: "Are you a marketing agency?",
    a: "We provide marketing services, but our scope is broader than lead generation alone. We connect marketing with call handling, CRM, follow-up, booking processes, customer lifecycle workflows and business reporting.",
  },
  {
    q: "Which industries do you serve?",
    a: "Home inspection, HVAC, plumbing, electrical, roofing and general contracting. The customer journey and growth opportunities are adapted to each trade.",
  },
  {
    q: "Do you work across the United States?",
    a: "The service model is designed for US home-service businesses. Service availability, campaign scope and any trade-specific requirements are confirmed during qualification.",
  },
];

const PRICING = [
  {
    q: "How much does the SNIPE Diagnostic™ cost?",
    a: `The SNIPE Diagnostic™ is ${OFFERS.diagnostic.price.label} one-time. It includes a review of supplied business data covering up to 12 months, a Leak Map, a response-time test and a 30-minute review.`,
  },
  {
    q: "How much does the SNIPE Blueprint™ cost?",
    a: `The SNIPE Blueprint™ is ${OFFERS.blueprint.price.label} one-time. It includes a personalized 25 to 35-page plan, delivered within 10 business days after complete intake and data receipt, a 90-minute presentation and 30 days of follow-up questions.`,
  },
  {
    q: "Does the SNIPE Diagnostic™ fee count toward SNIPE Blueprint™?",
    a: `Yes. If you purchase SNIPE Blueprint™ within 14 days of your SNIPE Diagnostic™ review, the full SNIPE Diagnostic™ fee is credited toward SNIPE Blueprint™. Your remaining payment is ${blueprintRemainder}.`,
  },
  {
    q: "Does the SNIPE Blueprint™ fee count toward SNIPE Engine™?",
    a: "Yes. If you sign for SNIPE Engine™ within 30 days of your Blueprint presentation, the full SNIPE Blueprint™ fee is credited toward your setup. We confirm the remaining amount in writing before you sign.",
  },
  {
    q: "How much does SNIPE Engine™ cost?",
    a: "Every SNIPE Engine™ engagement is scoped one on one and priced privately. Book a Growth Fit Call and we will confirm your pricing in writing before anything starts. Advertising spend is separate and paid directly by the client.",
  },
  {
    q: "Can I buy a Blueprint without becoming a monthly client?",
    a: "Yes. The SNIPE Blueprint™ is a standalone strategic product. You can implement it with your own team or another provider.",
  },
  {
    q: "Are SNIPE Loops™ really free?",
    a: "Yes. SNIPE Loops™ is a free resource. You provide your email and business details so we can deliver relevant recipes and updates. You can unsubscribe from marketing emails at any time.",
  },
];

const DELIVERY = [
  {
    q: "What does SNIPE Engine™ cover?",
    a: "Strategy and plan reviews, paid media management, lead capture and routing through SNIPE CRM™, call coverage with Voice AI fallback, follow-up and reactivation loops, reviews and reputation workflows, partner referral support, and performance visibility through SNIPE Intelligence™. It can also include live intake, booking and agreed admin support from our team. The exact scope is agreed in writing before you start.",
  },
  {
    q: "Does SNIPE Engine™ include advertising spend?",
    a: "No. The client pays the advertising platform directly. Campaign management is covered within the agreed scope and spend limits, confirmed in writing before you start.",
  },
  {
    q: "What happens during the 21-day launch runway?",
    a: "We work through onboarding, access, phone and lead routing, CRM setup, priority workflows, tracking and initial campaign launch. Timing depends on client access and approvals, platform verification and third-party dependencies. The exact launch checklist is agreed during onboarding.",
  },
  {
    q: "What work can SNIPE Engine™ cover beyond marketing?",
    a: "Agreed tasks may include appointment confirmations and reschedules, quote and invoice follow-up, CRM updates and partner scheduling. Bookkeeping, payroll, field dispatch, licensed work and other out-of-scope duties are not included. The exact scope is agreed in writing before you start.",
  },
  {
    q: "Do you replace our existing booking software?",
    a: "Not by default. The approach is to work with the business's existing platform where access and integration support make that practical. The scope is confirmed during the Diagnostic, Blueprint or SNIPE Engine™ onboarding.",
  },
  {
    q: "What if our software does not integrate?",
    a: "We review the available export, API, webhook or manual workflow options. Any limitation or custom integration requirement is explained and scoped before work begins.",
  },
  {
    q: "Do you guarantee a certain number of leads, bookings or revenue?",
    a: "No. We commit to the agreed scope of work and operating process, not a guaranteed business outcome. Results depend on market conditions, service quality, pricing, budget, capacity, customer experience and execution.",
  },
];

const GETTING_STARTED = [
  {
    q: "What happens on the free Growth Fit Call?",
    a: "It is a 20-minute qualification conversation. We learn about the business, your goals and the biggest growth obstacle, then recommend a suitable next step. It is not a full consulting session or a substitute for the paid Diagnostic.",
  },
  {
    q: "What information do I need for a Diagnostic or Blueprint?",
    a: "The exact list depends on your trade and software. It may include 12 months of job and customer records, lead sources, revenue, ticket values, marketing spend, call details, estimate status and capacity information. We provide the checklist after purchase.",
  },
  {
    q: "How quickly can we start?",
    a: "The timing depends on fit, payment, data availability, access and team capacity. The Blueprint delivery window begins after complete intake and required data are received. The 21-day SNIPE Engine™ launch runway begins after onboarding prerequisites are met.",
  },
  {
    q: "Can you work with a business that is smaller or earlier-stage?",
    a: "The best fit is an established operator with a real service history, customer demand and enough capacity to act on the plan. The free call can help determine whether SNIPE Loops™, a Diagnostic or a Blueprint is a sensible starting point.",
  },
];

export function Faq() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="FAQ"
        title="Pricing, process and services, answered."
        lede="Straight answers about GrowthSnipe pricing, the Diagnostic, the Blueprint, SNIPE Engine™ delivery and working together."
      />
      <section className="mx-auto w-full max-w-6xl px-4 pb-8">
        <div className="text-center">
          <Button size="lg" asChild>
            <Link to="/book">Book a Free Growth Fit Call</Link>
          </Button>
        </div>
      </section>

      {[
        { title: "General", items: GENERAL },
        { title: "Offers and pricing", items: PRICING },
        { title: "SNIPE Engine™ and delivery", items: DELIVERY },
        { title: "Getting started", items: GETTING_STARTED },
      ].map(({ title, items }) => (
        <section key={title} className="mx-auto w-full max-w-6xl px-4 py-10">
          <SectionHeading title={title} />
          <FaqList items={items} />
        </section>
      ))}

      <section className="mx-auto w-full max-w-6xl px-4 pb-14 text-center">
        <p className="text-muted-foreground">Still unsure which step fits?</p>
        <div className="mt-4 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild>
            <Link to="/diagnostic">Compare Offers</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/book">Book a Free Growth Fit Call</Link>
          </Button>
        </div>
      </section>

      <CtaBand
        title="Questions answered. Next step is yours."
        body="A 20-minute call to determine whether a Diagnostic, Blueprint or SNIPE Engine™ partnership fits."
      />
    </MarketingLayout>
  );
}
