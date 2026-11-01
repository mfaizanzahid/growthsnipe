import { Link } from "react-router-dom";
import { MarketingLayout } from "../../../components/marketing/MarketingLayout";
import { CtaBand, PageHero, SectionHeading } from "../../../components/marketing/MarketingBits";
import { Button } from "../../../components/ui/button";
import { CheckCircleIcon } from "@heroicons/react/24/outline";
import { OFFERS } from "../../../../lib/offers";

export interface IndustryCopy {
  eyebrow: string;
  title: string;
  lede: string;
  heroCta: string;
  gapsTitle: string;
  gaps: string[];
  buildTitle: string;
  buildIntro: string;
  builds: string[];
  buildsCta: string;
  finalTitle: string;
}

/** Shared layout for the six trade pages. Copy stays per-trade in each page file. */
export function IndustryTemplate({ copy }: { copy: IndustryCopy }) {
  return (
    <MarketingLayout>
      <PageHero eyebrow={copy.eyebrow} title={copy.title} lede={copy.lede} />
      <section className="mx-auto w-full max-w-6xl px-4 pb-14">
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button size="lg" asChild>
            <Link to="/book">{copy.heroCta}</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link to="/loop-library">Get the Free Loop Library</Link>
          </Button>
        </div>
      </section>

      <section className="border-t bg-muted/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-16">
          <SectionHeading eyebrow="Where growth gets stuck" title={copy.gapsTitle} />
          <div className="mx-auto mt-8 grid max-w-4xl gap-3 md:grid-cols-2">
            {copy.gaps.map((gap) => (
              <div key={gap} className="flex items-start gap-2 rounded-lg border bg-card p-4 text-sm text-muted-foreground">
                <span aria-hidden className="font-bold text-primary">×</span>
                {gap}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-16">
        <SectionHeading eyebrow="What we build" title={copy.buildTitle} body={copy.buildIntro} />
        <div className="mx-auto mt-8 max-w-3xl space-y-2">
          {copy.builds.map((b) => (
            <div key={b} className="flex items-start gap-2 rounded-lg border p-4 text-sm text-muted-foreground">
              <CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              {b}
            </div>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Button size="lg" asChild>
            <Link to="/book">{copy.buildsCta}</Link>
          </Button>
        </div>
      </section>

      <section className="border-t bg-muted/40">
        <div className="mx-auto w-full max-w-3xl px-4 py-16 text-center">
          <SectionHeading
            eyebrow="Offer pathway"
            title="Start where it makes sense."
            body={`Start with the ${OFFERS.diagnostic.price.label} SNIPE Diagnostic to see where the business is leaking opportunities. Move into the ${OFFERS.blueprint.price.label} SNIPE Blueprint for a full 12-month plan, or choose SNIPE Engine when you are ready for an implementation partner.`}
          />
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild>
              <Link to={OFFERS.diagnostic.checkoutPath}>Get the Diagnostic, {OFFERS.diagnostic.price.label}</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to={OFFERS.blueprint.checkoutPath}>Get the Blueprint, {OFFERS.blueprint.price.label}</Link>
            </Button>
          </div>
        </div>
      </section>

      <CtaBand title={copy.finalTitle} body="Book a free Growth Fit Call and let's look at your growth goals, booking process and referral engine." />
    </MarketingLayout>
  );
}
