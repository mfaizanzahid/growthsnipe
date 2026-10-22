import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import { CtaBand, PageHero, SectionHeading } from "../../components/marketing/MarketingBits";
import { usePageMeta } from "../../hooks/usePageMeta";
import { PAGE_META } from "../../components/marketing/page-meta";

const BELIEFS = [
  {
    title: "Show the math",
    body: "Every recommendation starts with a number: missed calls, average ticket, cost per booked job. If we cannot size it, we do not lead with it.",
  },
  {
    title: "Respect the owner's intelligence",
    body: "Real businesses, real payrolls. Plain words, shown work, admitted uncertainty. Never a dressed-up number.",
  },
  {
    title: "Own the outcome, not the activity",
    body: "Clicks and impressions are not the job. A booked inspection on the calendar is the job.",
  },
  {
    title: "Build systems that survive us",
    body: "The plan, the scorecard, and the process should keep working when a manager leaves or a platform changes.",
  },
];

export function About() {
  usePageMeta(PAGE_META["/about"]);
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="About"
        title="A growth company built like an operating team."
        lede="GrowthSnipe exists because most home-service owners are sold marketing and handed reports. We size the leak, build the system, then stay to run it."
      />

      <section className="mx-auto w-full max-w-3xl px-4 pb-14">
        <div className="space-y-6 text-muted-foreground">
          <section>
            <h2 className="text-lg font-semibold text-foreground">The pattern we kept seeing</h2>
            <p className="mt-2 text-sm leading-relaxed">
              Owners had the data and still made the week's hardest calls on gut feel. Calls were
              missed during inspections, add-ons were offered when someone remembered, and paid
              media was judged on leads instead of booked jobs.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-foreground">Why we start with the leak</h2>
            <p className="mt-2 text-sm leading-relaxed">
              Before we sell a campaign, we put a dollar figure on what is already leaking. That
              number decides whether the fix is capture, ticket, pipeline, or capacity. Selling ads
              into a leaky phone is how owners end up paying twice.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-foreground">Plan plus operator</h2>
            <p className="mt-2 text-sm leading-relaxed">
              Engine Core and Engine Command pair a written plan with the people who build and run
              it. SNIPE Intelligence™ and SNIPE VoiceIQ™ make the work visible every week, so the
              scorecard is the same whether you run the system or we do.
            </p>
          </section>
        </div>
      </section>

      <section className="border-t bg-muted/40">
        <div className="mx-auto w-full max-w-3xl px-4 py-14">
          <SectionHeading title="What we believe" />
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {BELIEFS.map((b) => (
              <div key={b.title} className="rounded-xl border bg-background p-5">
                <h3 className="font-semibold">{b.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{b.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CtaBand
        title="Bring us the numbers"
        body="Book a discovery call. We will show you the leak before we ask for a card."
      />
    </MarketingLayout>
  );
}
