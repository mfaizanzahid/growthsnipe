import { Link } from "react-router-dom";
import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import { CtaBand, PageHero } from "../../components/marketing/MarketingBits";
import { Button } from "../../components/ui/button";

const HOW_WE_WORK = [
  "We start with the business numbers, not a preselected tactic.",
  "We connect acquisition, response, booking, ticket size and repeat opportunities.",
  "We make assumptions visible instead of hiding them in a report.",
  "We build workflows around the way the business actually operates.",
  "We value transparency, clear ownership and a consistent review rhythm.",
];

export function About() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="About GrowthSnipe"
        title="We believe small home-service businesses deserve more than disconnected marketing tasks."
        lede="GrowthSnipe exists to help owner-operated service companies make growth a system, not a series of guesses, tools and temporary campaigns."
      />

      <section className="mx-auto w-full max-w-3xl px-4 pb-14">
        <div className="space-y-6 text-muted-foreground">
          <section>
            <h2 className="text-lg font-semibold text-foreground">Why GrowthSnipe exists</h2>
            <p className="mt-2 text-sm leading-relaxed">
              Many home-service owners are excellent at delivering the work. They know their trade, care about their customers and have built a business through hard work and reputation. But as the business grows, the owner becomes responsible for everything around the work too: marketing, missed calls, estimates, follow-up, hiring, systems and reporting.
            </p>
            <p className="mt-2 text-sm leading-relaxed">
              A typical marketing vendor may bring more enquiries. A software provider may supply more features. A freelancer may build a workflow. But the owner is still left connecting the pieces.
            </p>
            <p className="mt-2 text-sm leading-relaxed">
              GrowthSnipe is designed to close that gap.
            </p>
          </section>
          <section className="rounded-xl border bg-muted/40 p-6 text-center">
            <h2 className="text-lg font-semibold text-foreground">Our operating belief</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed">
              The goal is not more marketing activity. The goal is a healthier business with a clearer path to growth.
            </p>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed">
              That means understanding the economics first, designing the customer journey, installing the right systems and reviewing what happens after the lead arrives.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-foreground">How we work</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
              {HOW_WE_WORK.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-foreground">Who we serve</h2>
            <p className="mt-2 text-sm leading-relaxed">
              GrowthSnipe works with owner-operated home-service businesses across home inspection, HVAC, plumbing, electrical, roofing and general contracting. Our approach is designed for companies that want to grow deliberately and are willing to improve the process behind the work.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                ["Home Inspectors", "/home-inspectors"],
                ["HVAC", "/hvac"],
                ["Plumbing", "/plumbing"],
                ["Electrical", "/electrical"],
                ["Roofing", "/roofing"],
                ["Contractors", "/contractors"],
              ].map(([label, to]) => (
                <Button key={to} variant="outline" size="sm" asChild>
                  <Link to={to}>{label}</Link>
                </Button>
              ))}
            </div>
          </section>
        </div>
      </section>

      <CtaBand
        title="Ready for a growth partner who looks beyond the lead?"
        body="Book a free Growth Fit Call and tell us where you want the business to go."
      />
    </MarketingLayout>
  );
}
