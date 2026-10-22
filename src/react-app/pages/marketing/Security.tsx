import { ShieldCheckIcon } from "@heroicons/react/24/outline";
import { Card, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import { CtaBand, Faq, IconTile, PageHero, SectionHeading } from "../../components/marketing/MarketingBits";

const PRACTICES = [
  {
    title: "Encrypted credentials",
    body: "Encrypted server-side on save. Never in the browser, never logged, never pasted into an answer.",
  },
  {
    title: "Hashed tokens",
    body: "AI-connection tokens stored as hashes. The full value exists once — at creation.",
  },
  {
    title: "Organization-scoped everything",
    body: "Every query filtered to your workspace and checked against your role. No shared views across businesses.",
  },
  {
    title: "Read first, approve second",
    body: "Read-only by default. Any action needs platform capability, a policy you control, and your approval.",
  },
  {
    title: "Minimum-data AI processing",
    body: "Only the data needed for an answer goes to Claude, ChatGPT, or Gemini to produce it — then nothing is retained by us.",
  },
  {
    title: "Audited actions",
    body: "Every write carries who, when, and what changed. Approved or refused, it is on record.",
  },
];

const FAQS = [
  {
    q: "What do you store, exactly?",
    a: "We store account details, your business context profile, encrypted connection credentials, and billing data. Business data from connected software — jobs, clients, schedules — is read in real time and never stored, backed up, or retained.",
  },
  {
    q: "Can the AI act without me knowing?",
    a: "No. Advisors answer and suggest by default. Execution needs platform capability, a policy you control, and your approval — with an audit entry either way.",
  },
  {
    q: "What happens to my data when I disconnect or cancel?",
    a: "Access ends: with no real-time connection there is nothing left to read, because nothing was copied. Account and billing data follow the privacy policy, and you can ask the GrowthSnipe team to delete your business context profile.",
  },
  {
    q: "Who can see my workspace?",
    a: "Only members you invite, under the role you assign. Support access is limited, scoped, and logged.",
  },
];

export function Security() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Security"
        title="We don't store your business data. Full stop."
        lede="GrowthSnipe connects Spectora, ISN, ServiceTitan, Housecall Pro, and Jobber to Claude, ChatGPT, and Gemini in real time through our Multi-Trades™ MCP Server. Business data from your connected software is read in real time and passed through — never stored, backed up, or retained on our servers."
      />

      <section className="mx-auto w-full max-w-6xl px-4 pb-14">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PRACTICES.map((p) => (
            <IconTile key={p.title} icon={ShieldCheckIcon} title={p.title} body={p.body} />
          ))}
        </div>
      </section>

      <section className="border-t bg-muted/40">
        <div className="mx-auto w-full max-w-3xl px-4 py-14">
          <SectionHeading title="Plain answers to hard questions" />
          <Faq items={FAQS} />
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-14">
        <Card className="mx-auto max-w-3xl text-center">
          <CardHeader>
            <CardTitle>Disconnecting ends everything</CardTitle>
            <CardDescription>
              No copies, no residue. Pull the connection and there is nothing left to read — because real-time pass-through never kept it.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>

      <CtaBand
        title="Decide without handing data over"
        body="Start your free 30-day trial. Advisors know your numbers; we hold none of them."
      />
    </MarketingLayout>
  );
}
