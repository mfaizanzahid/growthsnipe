import { Link, useParams } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import {
  CtaBand,
  Faq,
  IconTile,
  PageHero,
  SectionHeading,
  TrustCallout,
} from "../../components/marketing/MarketingBits";
import { usePageMeta } from "../../hooks/usePageMeta";
import { getIntegrationPage } from "./integration-pages";
import { ChatBubbleLeftRightIcon } from "@heroicons/react/24/outline";

export function IntegrationPage() {
  const { platform } = useParams<{ platform: string }>();
  const page = platform ? getIntegrationPage(platform) : undefined;
  usePageMeta(
    page ? { title: page.title, description: page.description } : { title: "", description: "" },
  );

  if (!page) {
    return (
      <MarketingLayout>
        <PageHero
          eyebrow="Integrations"
          title="We couldn't find that integration page"
          lede="The platform you're looking for isn't listed under that address — but these five are."
        />
        <section className="mx-auto w-full max-w-3xl px-4 pb-14 text-center">
          <Button asChild>
            <Link to="/integrations">Back to all integrations</Link>
          </Button>
        </section>
      </MarketingLayout>
    );
  }

  return (
    <MarketingLayout>
      <PageHero
        eyebrow={`Integrations / ${page.platformName}`}
        title={`GrowthSnipe for ${page.platformName}`}
        lede={page.lede}
      />

      <section className="mx-auto w-full max-w-6xl px-4 pb-14">
        <SectionHeading
          eyebrow="What it enables"
          title={`What the ${page.platformName} connection lets you ask`}
          body="Every answer is pulled real time from your connected software — never exported, never stale."
        />
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {page.questions.map((q) => (
            <IconTile
              key={q.title}
              icon={ChatBubbleLeftRightIcon}
              title={q.title}
              body={q.body}
            />
          ))}
        </div>
      </section>

      <section className="border-t bg-muted/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-14">
          <SectionHeading
            eyebrow="Advisors"
            title={`Advisors that matter most for ${page.platformName} users`}
            body="A full specialist team working from your real-time business data — without adding headcount."
          />
          <ul className="mx-auto mt-8 grid max-w-4xl gap-4 sm:grid-cols-2">
            {page.advisors.map((a) => (
              <li key={a.name} className="rounded-xl border bg-background p-5">
                <h3 className="font-semibold">{a.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{a.body}</p>
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {page.tradeLinks.map((t) => (
              <Button key={t.slug} variant="outline" asChild>
                <Link to={`/who-we-help/${t.slug}`}>{t.label}</Link>
              </Button>
            ))}
            <Button variant="outline" asChild>
              <Link to="/advisors">Meet all seven advisors</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-3xl px-4 py-14">
        <SectionHeading title={`${page.platformName} questions, answered`} />
        <Faq items={page.faqs} />
      </section>

      <TrustCallout />

      <CtaBand
        title={page.ctaTitle}
        body="Connect your software and get deep insights in the AI you already use — Claude, ChatGPT, and Gemini. Start your free 30-day trial — no credit card required."
      />
    </MarketingLayout>
  );
}
