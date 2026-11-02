import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import { PageHero } from "../../components/marketing/MarketingBits";

export function ResultsDisclaimer() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Results Disclaimer"
        title="How to read our numbers."
        lede="GrowthSnipe provides strategic, marketing, automation and operational support. Business results depend on many factors. No specific revenue, lead, booking or profit result is guaranteed."
      />
      <section className="mx-auto w-full max-w-3xl px-4 pb-14">
        <div className="space-y-6 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="text-lg font-semibold text-foreground">What affects results</h2>
            <p className="mt-2">
              Outcomes depend on factors including market conditions, service quality, pricing, staffing, capacity, budget, seasonality, execution, customer experience and follow-through. Advertising spend is separate from GrowthSnipe fees unless a written agreement states otherwise.
            </p>
          </section>
          <section>
          <h2 className="text-lg font-semibold text-foreground">Scenarios and examples</h2>
          <p className="mt-2">
            Scenarios and examples on this site use assumed figures to show how the SNIPE System connects numbers to decisions. Treat them as illustrations of the method, not forecasts and not promises of what your business will achieve.
          </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-foreground">Estimates and assumptions</h2>
            <p className="mt-2">
              Where an estimate requires assumptions, those assumptions will be visible. Planning models based on your data and stated assumptions are tools for decisions, not guaranteed outcomes.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-foreground">Retail-equivalent values</h2>
            <p className="mt-2">
              Where a retail-equivalent value is shown for comparison, it is an estimate and is labeled as such.
            </p>
          </section>
        </div>
      </section>
    </MarketingLayout>
  );
}
