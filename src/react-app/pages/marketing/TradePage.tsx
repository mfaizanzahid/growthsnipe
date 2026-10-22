import { Link, useParams } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import {
  CtaBand,
  Faq,
  IconTile,
  PageHero,
  SectionHeading,
  Testimonial,
  TrustCallout,
} from "../../components/marketing/MarketingBits";
import { usePageMeta } from "../../hooks/usePageMeta";
import { getTradePage } from "./trade-pages";
import { ExclamationTriangleIcon, UserGroupIcon } from "@heroicons/react/24/outline";

export function TradePage() {
  const { trade } = useParams<{ trade: string }>();
  const page = trade ? getTradePage(trade) : undefined;
  usePageMeta(
    page ? { title: page.title, description: page.description } : { title: "", description: "" },
  );

  if (!page) {
    return (
      <MarketingLayout>
        <PageHero
          eyebrow="Who we help"
          title="We couldn't find that trade page"
          lede="The trade you're looking for isn't listed under that address — but these seven are."
        />
        <section className="mx-auto w-full max-w-3xl px-4 pb-14 text-center">
          <Button asChild>
            <Link to="/who-we-help">Back to all trades</Link>
          </Button>
        </section>
      </MarketingLayout>
    );
  }

  return (
    <MarketingLayout>
      <PageHero eyebrow={page.eyebrow} title={`Tradesmatic for ${page.tradeName}`} lede={page.lede} />

      <section className="mx-auto w-full max-w-6xl px-4 pb-14">
        <SectionHeading eyebrow="The problem" title={page.problemTitle} body={page.problemBody} />
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {page.pains.map((p) => (
            <IconTile
              key={p.title}
              icon={ExclamationTriangleIcon}
              title={p.title}
              body={p.body}
            />
          ))}
        </div>
      </section>

      <section className="border-t bg-muted/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-14">
          <SectionHeading
            eyebrow="Advisors"
            title="The advisors that matter most here"
            body="A full specialist team working from your real-time data — without adding headcount."
          />
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {page.advisors.map((a) => (
              <IconTile key={a.name} icon={UserGroupIcon} title={a.name} body={a.body} />
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-14">
        <SectionHeading
          eyebrow="Integrations"
          title="Sits on top of the software you already run"
          body={page.integrationsBody}
        />
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap">
          {page.integrationLinks.map((l) => (
            <Button key={l.slug} variant="outline" asChild>
              <Link to={`/integrations/${l.slug}`}>{l.label}</Link>
            </Button>
          ))}
          <Button variant="outline" asChild>
            <Link to="/how-it-works">How it works in four steps</Link>
          </Button>
        </div>
      </section>

      {page.extraSection && (
        <section className="border-t bg-muted/40">
          <div className="mx-auto w-full max-w-6xl px-4 py-14">
            <SectionHeading eyebrow={page.extraSection.eyebrow} title={page.extraSection.title} />
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {page.extraSection.items.map((item) => (
                <IconTile
                  key={item.title}
                  icon={UserGroupIcon}
                  title={item.title}
                  body={item.body}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {page.testimonial && (
        <section className="mx-auto w-full max-w-3xl px-4 py-14">
          <div className="mx-auto max-w-md">
            <Testimonial
              quote={page.testimonial.quote}
              name={page.testimonial.name}
              detail={page.testimonial.detail}
            />
          </div>
        </section>
      )}

      <section className="mx-auto w-full max-w-3xl px-4 py-14">
        <SectionHeading title={`${page.tradeName} questions, answered`} />
        <Faq items={page.faqs} />
      </section>

      <TrustCallout />

      <CtaBand title={page.ctaTitle} body={page.ctaBody} />
    </MarketingLayout>
  );
}
