import { Link } from "react-router-dom";
import {
  ChatBubbleLeftRightIcon,
  Cog6ToothIcon,
  LinkIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import {
  CtaBand,
  Faq,
  PageHero,
  SectionHeading,
  TrustCallout,
} from "../../components/marketing/MarketingBits";

const OBJECTIONS = [
  {
    q: "Is this just an MCP server?",
    a: "No. Tradesmatic is a decision-making platform; the Multi-Trades™ MCP Server is the connective technology underneath. What you use is the platform on top: seven advisors, briefings, and permissioned actions.",
  },
  {
    q: "I already pay for AI. Why pay for this?",
    a: "Your AI starts every session knowing nothing about your business. Tradesmatic connects Claude, ChatGPT, and Gemini to your real-time numbers, so the AI you already use gives answers backed by real data.",
  },
  {
    q: "I don't have time for another tool.",
    a: "Setup takes under 5 minutes. Briefings come to your inbox — morning, weekly, monthly — so you read decision-ready answers instead of operating software.",
  },
  {
    q: "Does it replace my booking software?",
    a: "Never. It sits on top of Spectora, ISN, ServiceTitan, Housecall Pro, or Jobber and reads it in real time. Nothing migrates.",
  },
  {
    q: "I'm not technical. Is this for me?",
    a: "It was built for owner-operators. Connect your software, connect Claude, ChatGPT, or Gemini, answer a few questions about your business — that is the whole setup.",
  },
  {
    q: "Is my data safe?",
    a: "Business data is read in real time and never stored on our servers. Credentials are encrypted, tokens are hashed, and writes need your approval first. Full detail in our security and privacy commitments.",
  },
];

export function HowItWorks() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="How it works"
        title="From real-time data to real-world action — in four steps."
        lede="Tradesmatic connects Spectora, ISN, ServiceTitan, Housecall Pro, and Jobber to Claude, ChatGPT, and Gemini in real time. Four steps to deep insights, better decisions, and data-backed actions — no migration, no new app to learn."
      />

      <section className="mx-auto w-full max-w-6xl px-4 pb-14">
        {/* <StepsConnector /> */}
        <div className="mt-8 grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  1
                </span>
                Connect your software
              </CardTitle>
              <CardDescription>Link the software you run on</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p className="flex items-center gap-2 font-medium text-foreground">
                <LinkIcon className="size-4 text-primary" aria-hidden />
                Spectora, ISN, ServiceTitan, Housecall Pro, or Jobber
              </p>
              <p>Secure, OAuth-based connection; credentials encrypted server-side, never stored in the browser.</p>
              <p>Nothing migrates and nothing gets re-entered.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  2
                </span>
                Add business context
              </CardTitle>
              <CardDescription>What your software never knew</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p className="flex items-center gap-2 font-medium text-foreground">
                <UserGroupIcon className="size-4 text-primary" aria-hidden />A short business profile
              </p>
              <p>Services, team, goals, seasonality — so every insight is specific to your business, not generic.</p>
              <p>This is the one thing Tradesmatic keeps, and you control or delete it any time.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  3
                </span>
                Connect your AI
              </CardTitle>
              <CardDescription>Plug the engine into the AI you already use</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p className="flex items-center gap-2 font-medium text-foreground">
                <Cog6ToothIcon className="size-4 text-primary" aria-hidden />
                The Multi-Trades™ MCP Server
              </p>
              <p>Link the Multi-Trades™ MCP Server to Claude, ChatGPT, or Gemini — whichever AI tool you already use.</p>
              <p>A copy-paste configuration, done in a few minutes, turns your existing AI subscription into a business-aware advisor team.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  4
                </span>
                Ask and act
              </CardTitle>
              <CardDescription>Ask, get briefed, act</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p className="flex items-center gap-2 font-medium text-foreground">
                <ChatBubbleLeftRightIcon className="size-4 text-primary" aria-hidden />
                Inside the AI you already use
              </p>
              <p>Ask plain questions, receive scheduled briefings, and take permissioned actions directly in your connected software — all backed by real-time data with real data behind every answer.</p>
              <p>Read first, suggest second, execute only with approval.</p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="border-t bg-muted/40">
        <div className="mx-auto w-full max-w-4xl px-4 py-14 text-center">
          <SectionHeading
            eyebrow="Technology"
            title="The engine behind every insight"
            body="Every answer runs through our proprietary Multi-Trades™ MCP Server — one secure, real-time layer across all five platforms and every trade we serve. It is the technology underneath, not the product: you never log into it, you just ask how the week went."
          />
          <div className="mt-6">
            <Button variant="outline" asChild>
              <Link to="/technology">Learn how the Multi-Trades™ MCP Server works</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-3xl px-4 py-14">
        <SectionHeading title="Fair questions" body="What owners ask before trying it." />
        <Faq items={OBJECTIONS} />
        <div className="mt-8 text-center">
          <Button variant="outline" asChild>
            <Link to="/security">Read the security detail</Link>
          </Button>
        </div>
      </section>

      <TrustCallout />

      <CtaBand
        title="Four steps to your first briefing"
        body="Start your free 30-day trial — no credit card required."
      />
    </MarketingLayout>
  );
}
