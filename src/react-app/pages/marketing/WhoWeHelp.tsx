import { Link } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import {
  CtaBand,
  PageHero,
  SectionHeading,
  TrustCallout,
} from "../../components/marketing/MarketingBits";
import { usePageMeta } from "../../hooks/usePageMeta";
import { PAGE_META } from "../../components/marketing/page-meta";
import { TRADE_PAGES, type TradeSlug } from "./trade-pages";

const TRADE_ORDER: TradeSlug[] = [
  "home-inspectors",
  "hvac-contractors",
  "plumbing-contractors",
  "electrical-contractors",
  "roofing-contractors",
  "general-contractors",
  "pest-control",
];

export function WhoWeHelp() {
  usePageMeta(PAGE_META["/who-we-help"]);
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Who we help"
        title="Real-time business insights for every trade you run."
        lede="Tradesmatic is a decision-making platform for owner-operated home service businesses. It connects your booking software to the AI you already use — Claude, ChatGPT, and Gemini — in real time through our Multi-Trades™ MCP Server, so each trade gets deep insights and data-backed actions shaped to how it actually works."
      />

      <section className="mx-auto w-full max-w-6xl px-4 pb-14">
        <SectionHeading
          eyebrow="Trades"
          title="Pick your trade"
          body="Tradesmatic connects Spectora, ISN, ServiceTitan, Housecall Pro, and Jobber to Claude, ChatGPT, and Gemini in real time for seven home service trades. Each page names the pain points, the advisors, and the connection that matter most for that trade — all answers backed by real data."
        />
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {TRADE_ORDER.map((slug) => {
            const t = TRADE_PAGES[slug];
            const Icon = t.icon;
            return (
              <Card key={slug} className="flex flex-col">
                <CardHeader>
                  <span className="mb-2 flex size-10 items-center justify-center rounded-lg border bg-muted/50">
                    <Icon className="size-5 text-primary" aria-hidden />
                  </span>
                  <CardTitle className="text-base">{t.tradeName}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-3">
                  <CardDescription>{t.cardBlurb}</CardDescription>
                  <Button variant="outline" size="sm" className="mt-auto self-start" asChild>
                    <Link to={`/who-we-help/${slug}`}>Tradesmatic for {t.tradeName}</Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button variant="outline" asChild>
            <Link to="/how-it-works">How it works in four steps</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/pricing">Compare plans</Link>
          </Button>
        </div>
      </section>

      <TrustCallout />

      <CtaBand
        title="Find your trade, bring your software"
        body="Deep insights and data-backed actions in the AI you already use — Claude, ChatGPT, and Gemini — built on your real-time numbers."
      />
    </MarketingLayout>
  );
}
