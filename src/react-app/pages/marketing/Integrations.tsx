import { Link } from "react-router-dom";
import { CheckCircleIcon, LinkIcon } from "@heroicons/react/24/outline";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import { CtaBand, PageHero, TrustCallout } from "../../components/marketing/MarketingBits";

const INTEGRATIONS = [
  {
    name: "Spectora",
    slug: "spectora",
    detail:
      "For home inspectors who want answers, not exports. Tradesmatic connects Spectora to Claude, ChatGPT, and Gemini in real time for deep insights and data-backed actions.",
    uses: [
      "“How did this week compare to last — inspections, fees, mix?”",
      "“Which referral sources are slipping, with agent history?”",
      "“What is unconfirmed or gapped this week while still fillable?”",
    ],
    footer: "Read first, suggest second, execute only with your approval. Every write is audited. Business data is never stored.",
  },
  {
    name: "Inspection Support Network (ISN)",
    slug: "isn",
    detail:
      "For inspection offices running on ISN orders, clients, agents, and events. Tradesmatic connects ISN to Claude, ChatGPT, and Gemini in real time for deep insights and data-backed actions.",
    uses: [
      "“Which quotes need a nudge?”",
      "“Who has gone quiet that used to send work?”",
      "“What changed in this month's pipeline?”",
    ],
    footer: "Read first, suggest second, execute only with your approval. Every write is audited. Business data is never stored.",
  },
  {
    name: "ServiceTitan",
    slug: "servicetitan",
    detail:
      "For HVAC, plumbing, electrical, and roofing teams. Tradesmatic connects ServiceTitan to Claude, ChatGPT, and Gemini in real time for deep insights and data-backed actions.",
    uses: [
      "“Where is revenue, mix, and ticket trending?”",
      "“Which techs and crews carry the load, and where are the gaps?”",
      "“Which agreements go quiet before they lapse?”",
    ],
    footer: "Read first, suggest second, execute only with your approval. Every write is audited. Business data is never stored.",
  },
  {
    name: "Housecall Pro",
    slug: "housecall-pro",
    detail:
      "For smaller HVAC, plumbing, electrical, and general contracting teams. Tradesmatic connects Housecall Pro to Claude, ChatGPT, and Gemini in real time for deep insights and data-backed actions.",
    uses: [
      "“What got done this week — jobs, visits, follow-ups?”",
      "“Which leads went quiet and where did they come from?”",
      "“Which estimates are worth a second look?”",
    ],
    footer: "Read first, suggest second, execute only with your approval. Every write is audited. Business data is never stored.",
  },
  {
    name: "Jobber",
    slug: "jobber",
    detail:
      "For general contracting and smaller multi-trade teams. Tradesmatic connects Jobber to Claude, ChatGPT, and Gemini in real time for deep insights and data-backed actions.",
    uses: [
      "“Where do quotes stall on the way to paid?”",
      "“Which recurring work should be booked before the season turns?”",
      "“Which open invoices deserve a follow-up?”",
    ],
    footer: "Read first, suggest second, execute only with your approval. Every write is audited. Business data is never stored.",
  },
];

export function Integrations() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Integrations"
        title="Sits on top of the software you already run."
        lede="Tradesmatic connects Spectora, ISN, ServiceTitan, Housecall Pro, and Jobber to Claude, ChatGPT, and Gemini in real time — through our Multi-Trades™ MCP Server. It reads everything and replaces nothing: nothing migrates, nothing gets re-entered."
      />

      <section className="mx-auto grid w-full max-w-6xl gap-4 px-4 pb-14 md:grid-cols-2">
        {INTEGRATIONS.map((i) => (
          <Card key={i.name}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="flex size-10 items-center justify-center rounded-lg border bg-muted/50">
                  <LinkIcon className="size-5 text-primary" aria-hidden />
                </span>
                <Link className="hover:underline" to={`/integrations/${i.slug}`}>
                  {i.name}
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{i.detail}</p>
              <ul className="space-y-2 text-sm">
                {i.uses.map((u) => (
                  <li key={u} className="flex items-start gap-2">
                    <CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    {u}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">{i.footer}</p>
              <Button variant="outline" size="sm" asChild>
                <Link to={`/integrations/${i.slug}`}>Tradesmatic for {i.name}</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </section>

      <TrustCallout />

      <CtaBand
        title="Connect in under 5 minutes"
        body="Start your free 30-day trial — no credit card required. One workspace, one connection, a first briefing from your own numbers."
      />
    </MarketingLayout>
  );
}
