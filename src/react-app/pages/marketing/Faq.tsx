import { Link } from "react-router-dom";
import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import { CtaBand, Faq as FaqList, PageHero, SectionHeading } from "../../components/marketing/MarketingBits";
import { Button } from "../../components/ui/button";
import { OFFERS, OFFER_EXTRAS } from "../../../lib/offers";
import { formatWholeMoney } from "../../lib/money";

const blueprintRemainder = formatWholeMoney(
  OFFERS.blueprint.price.amountMinor - OFFERS.diagnostic.price.amountMinor,
);
const engineCoreRemainder = formatWholeMoney(
  OFFERS.engineCore.setup.amountMinor - OFFERS.blueprint.price.amountMinor,
);
const engineCommandRemainder = formatWholeMoney(
  OFFERS.engineCommand.setup.amountMinor - OFFERS.blueprint.price.amountMinor,
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
    q: "How much does the SNIPE Diagnostic cost?",
    a: `The SNIPE Diagnostic is ${OFFERS.diagnostic.price.label} one-time. It includes a review of supplied business data covering up to 12 months, a Leak Map, a response-time test and a 60-minute readout.`,
  },
  {
    q: "How much does the SNIPE Blueprint cost?",
    a: `The SNIPE Blueprint is ${OFFERS.blueprint.price.label} one-time. It includes a personalized 25 to 35-page plan, delivered within 10 business days after complete intake and data receipt, a 90-minute presentation and 30 days of follow-up questions.`,
  },
  {
    q: "Does the Diagnostic fee count toward the Blueprint?",
    a: `Yes. If you purchase the Blueprint within 14 days of your Diagnostic readout, the full Diagnostic fee is credited toward the Blueprint. Your remaining payment is ${blueprintRemainder}.`,
  },
  {
    q: "Does the Blueprint fee count toward SNIPE Engine?",
    a: `Yes. If you sign for SNIPE Engine within 30 days of your Blueprint presentation, the full Blueprint fee is credited toward the Engine setup fee. The remaining setup payment is ${engineCoreRemainder} for Core or ${engineCommandRemainder} for Command.`,
  },
  {
    q: "How much does SNIPE Engine cost?",
    a: `Engine Core is ${OFFERS.engineCore.setup.label} setup plus ${OFFERS.engineCore.monthly.label} per month. Engine Command is ${OFFERS.engineCommand.setup.label} setup plus ${OFFERS.engineCommand.monthly.label} per month. Both include a 21-day launch runway. Advertising spend is separate and paid directly by the client.`,
  },
  {
    q: "Can I buy a Blueprint without becoming a monthly client?",
    a: "Yes. The SNIPE Blueprint is a standalone strategic product. You can implement it with your own team or another provider.",
  },
  {
    q: "Is the Loop Library really free?",
    a: "Yes. The Loop Library is a free resource. You provide your email and business details so we can deliver relevant recipes and updates. You can unsubscribe from marketing emails at any time.",
  },
];

const DELIVERY = [
  {
    q: "What is the difference between Core and Command?",
    a: "Core is designed for a business whose own team can take live calls and callbacks. The client's team answers first and configured Voice AI provides fallback coverage. Command includes a GrowthSnipe live team for agreed intake, booking and administrative tasks up to 100 combined hours per month, with Voice AI as fallback.",
  },
  {
    q: "Does SNIPE Engine include advertising spend?",
    a: `No. The client pays the advertising platform directly. The plan includes management within its agreed spend limit: up to ${OFFERS.engineCore.adSpendCap.label}/month in ad spend for Core and up to ${OFFERS.engineCommand.adSpendCap.label}/month for Command, across the channels specified in the plan.`,
  },
  {
    q: "What happens during the 21-day launch runway?",
    a: "We work through onboarding, access, phone and lead routing, CRM setup, priority workflows, tracking and initial campaign launch. Timing depends on client access and approvals, platform verification and third-party dependencies. The exact launch checklist is agreed during onboarding.",
  },
  {
    q: "Are there limits to Command's live-team hours?",
    a: `Yes. Command includes up to 100 combined hours per month across live intake, booking and agreed admin work. Unused hours do not roll over. Additional 20-hour blocks are ${OFFER_EXTRAS.extraHoursBlock.label}, subject to availability and written agreement.`,
  },
  {
    q: "What admin work is included in Command?",
    a: "Agreed tasks may include appointment confirmations and reschedules, quote and invoice follow-up, CRM updates and partner scheduling. Bookkeeping, payroll, field dispatch, licensed work and other out-of-scope duties are not included.",
  },
  {
    q: "Do you replace our existing booking software?",
    a: "Not by default. The approach is to work with the business's existing platform where access and integration support make that practical. The scope is confirmed during the Diagnostic, Blueprint or Engine onboarding.",
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
    a: "The timing depends on fit, payment, data availability, access and team capacity. The Blueprint delivery window begins after complete intake and required data are received. Engine's 21-day launch runway begins after onboarding prerequisites are met.",
  },
  {
    q: "Can you work with a business that is smaller or earlier-stage?",
    a: "The best fit is an established operator with a real service history, customer demand and enough capacity to act on the plan. The free call can help determine whether the Loop Library, Diagnostic or Blueprint is a sensible starting point.",
  },
];

export function Faq() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="FAQ"
        title="Pricing, process and services, answered."
        lede="Straight answers about GrowthSnipe pricing, the Diagnostic, the Blueprint, Engine delivery and working together."
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
        { title: "Engine and delivery", items: DELIVERY },
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
        body="A 20-minute call to determine whether a Diagnostic, Blueprint or Engine partnership fits."
      />
    </MarketingLayout>
  );
}
