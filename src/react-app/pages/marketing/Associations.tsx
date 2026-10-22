import { Link } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import {
  CtaBand,
  IconTile,
  PageHero,
  SectionHeading,
  Testimonial,
  TrustCallout,
} from "../../components/marketing/MarketingBits";
import { usePageMeta } from "../../hooks/usePageMeta";
import { PAGE_META } from "../../components/marketing/page-meta";
import {
  TagIcon,
  UserGroupIcon,
  MegaphoneIcon,
} from "@heroicons/react/24/outline";

export function Associations() {
  usePageMeta(PAGE_META["/associations"]);
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Associations & groups"
        title="A member benefit your group can be proud of."
        lede="GrowthSnipe is a decision-making platform that gives your members deep insights and data-backed actions inside the AI they already use — Claude, ChatGPT, and Gemini — connected to their booking software in real time through our Multi-Trades™ MCP Server."
      />

      <section className="mx-auto w-full max-w-6xl px-4 pb-14">
        <SectionHeading
          eyebrow="Partnership shape"
          title="Simple to offer, easy to explain"
          body="GrowthSnipe gives association members deep insights and data-backed actions from their own booking software, inside Claude, ChatGPT, and Gemini. Three parts, no admin burden on your team."
        />
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <IconTile
            icon={TagIcon}
            title="Preferred member pricing"
            body="Members receive preferred pricing on GrowthSnipe plans as a named benefit of belonging to your group — no codes to manage."
          />
          <IconTile
            icon={UserGroupIcon}
            title="Pilot program"
            body="Start with a small member cohort, gather real questions and real-data stories, then roll out with wording that already resonates."
          />
          <IconTile
            icon={MegaphoneIcon}
            title="Co-branded materials"
            body="Short explainers and webinar outlines written by the GrowthSnipe team in plain language, carrying your group's name alongside ours."
          />
        </div>
      </section>

      <section className="border-t bg-muted/40">
        <div className="mx-auto w-full max-w-4xl px-4 py-14 text-center">
          <SectionHeading
            eyebrow="Why it fits"
            title="Built by people who have sat in your members' offices"
            body="The GrowthSnipe team has spent 15 years inside this industry, watching owners guess at slow months with the answers sitting in their software. That is why every insight is specific, evidence-based, and respectful of a busy owner's time — the kind of benefit members renew for."
          />
          <div className="mx-auto mt-10 max-w-md text-left">
            <Testimonial
              quote="Our members stopped forwarding generic reports and started asking real questions. The briefings alone changed Monday mornings."
              name="Dana R."
              detail="Chapter coordinator, home services member group"
            />
          </div>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button variant="outline" asChild>
              <Link to="/how-it-works">How it works in four steps</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/advisors">Meet your seven AI advisors</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/who-we-help">What members in each trade get</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-4xl px-4 py-14 text-center">
        <h2 className="text-2xl font-bold tracking-tight">Tell us about your group</h2>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
          Pilot and member-pricing details are worked out per group — starting with a
          conversation, not a form letter.
        </p>
        <div className="mt-6">
          <Button asChild>
            <Link to="/contact">Contact the GrowthSnipe team</Link>
          </Button>
        </div>
      </section>

      <TrustCallout />

      <CtaBand
        title="Offer your members answers, not another login"
        body="Deep insights, better decision-making, and data-backed actions — working with the AI members already use: Claude, ChatGPT, and Gemini."
      />
    </MarketingLayout>
  );
}
