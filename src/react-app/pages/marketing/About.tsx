import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import { CtaBand, PageHero, SectionHeading } from "../../components/marketing/MarketingBits";

const BELIEFS = [
  {
    title: "Answers, not information",
    body: "No solo owner at 10 p.m. needs another chart. Three clear priorities with real data behind them — that is the job.",
  },
  {
    title: "Respect the owner's intelligence",
    body: "Real businesses, real payrolls. Plain words, shown work, admitted uncertainty. Never a dressed-up number.",
  },
  {
    title: "Your data stays yours",
    body: "Real-time pass-through, nothing stored. The architecture the Tradesmatic team would demand as customers — these owners were our customers for fifteen years.",
  },
  {
    title: "Built for every trade",
    body: "Home inspectors first — we know their software and their seasons. HVAC, plumbing, electrical, roofing, and general contracting run on the same platform, each on its own terms.",
  },
];

export function About() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="About"
        title="We've spent 15 years in the room with owners like you."
        lede="Fifteen years running a digital agency for home service businesses. The Tradesmatic team kept seeing one disconnect — and built our Multi-Trades™ MCP Server to solve it."
      />

      <section className="mx-auto w-full max-w-3xl px-4 pb-14">
        <div className="space-y-6 text-muted-foreground">
          <section>
            <h2 className="text-lg font-semibold text-foreground">The disconnect we kept seeing</h2>
            <p className="mt-2 text-sm leading-relaxed">
              Every engagement surfaced the same pattern: owners sitting on complete data while
              making the week's hardest calls on gut feel. Data in the software. Context in the
              owner's head. The two never met — so slow months got explained by mood instead of
              mix, tickets, and referral drift.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-foreground">Then AI arrived — and missed</h2>
            <p className="mt-2 text-sm leading-relaxed">
              Owners paid for Claude, ChatGPT, and Gemini subscriptions and pasted numbers in by
              hand. Fluent, generic advice — because the AI knew nothing about the business
              asking, and the software holding every answer connected to none of it.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-foreground">So we connected them</h2>
            <p className="mt-2 text-sm leading-relaxed">
              Business software, joined in real time to the AI owners already use, read by
              advisors who know what to look for. Tradesmatic connects Spectora, ISN,
              ServiceTitan, Housecall Pro, and Jobber to Claude, ChatGPT, and Gemini in real
              time. Not a dashboard to check — deep insights, better decisions, and
              data-backed actions every morning, backed by real data.
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
        title="Work with people who know your trade"
        body="Start your free 30-day trial. Fifteen years of pattern recognition, reading your numbers every morning."
      />
    </MarketingLayout>
  );
}
