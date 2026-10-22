import { Link } from "react-router-dom";
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
import { PAGE_META } from "../../components/marketing/page-meta";
import {
  Cog6ToothIcon,
  CircleStackIcon,
  ChatBubbleLeftRightIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";

const FAQS = [
  {
    q: "Is Tradesmatic itself an MCP server?",
    a: "No. Tradesmatic is a decision-making platform that delivers deep insights and data-backed actions. The Multi-Trades™ MCP Server is the proprietary technology inside it that connects your software to Claude, ChatGPT, and Gemini in real time.",
  },
  {
    q: "Which business software does it connect to?",
    a: "Tradesmatic connects Spectora, ISN, ServiceTitan, Housecall Pro, and Jobber to Claude, ChatGPT, and Gemini in real time, with answers shaped to each trade.",
  },
  {
    q: "Do I need a new AI subscription?",
    a: "No. Tradesmatic works with the AI you already use — Claude, ChatGPT, and Gemini — so your existing subscription becomes business-aware with a short configuration.",
  },
  {
    q: "Where does my business data go?",
    a: "Nowhere. Tradesmatic uses a real-time, pass-through design: it reads your software when you ask, answers with real data, and stores nothing about your business on its servers.",
  },
];

export function Technology() {
  usePageMeta(PAGE_META["/technology"]);
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Technology"
        title="The engine behind every insight: our Multi-Trades™ MCP Server."
        lede="Tradesmatic is a decision-making platform that delivers deep insights and data-backed actions inside the AI you already use — Claude, ChatGPT, and Gemini. The Multi-Trades™ MCP Server is the connective layer underneath that makes it possible, reading your business software in real time."
      />

      <section className="mx-auto w-full max-w-6xl px-4 pb-14">
        <SectionHeading
          eyebrow="What it is"
          title="One layer between your software and your decisions"
          body="Tradesmatic connects Spectora, ISN, ServiceTitan, Housecall Pro, and Jobber to Claude, ChatGPT, and Gemini in real time. The Multi-Trades MCP Server is proprietary technology purpose-built for the trades: it translates what your booking software already knows — jobs, clients, agents, events — into decision-ready answers, so you get better decisions without migrating software or learning a new tool."
        />
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <IconTile
            icon={Cog6ToothIcon}
            title="Reads your platforms"
            body="Connects Spectora, ISN, ServiceTitan, Housecall Pro, and Jobber to one consistent set of questions — same wording, trade-aware answers."
          />
          <IconTile
            icon={ChatBubbleLeftRightIcon}
            title="Works outward to your AI"
            body="Plugs into the AI you already use — Claude, ChatGPT, and Gemini — turning a generic chatbot into advisors that know your numbers."
          />
          <IconTile
            icon={CircleStackIcon}
            title="Pass-through, nothing kept"
            body="Every answer is pulled in real time from your own software. Nothing about your business sits on our servers."
          />
          <IconTile
            icon={UserGroupIcon}
            title="Context that sticks"
            body="Your onboarding profile — services, team, goals, seasonality — travels with every session, so you never re-explain your business."
          />
        </div>
      </section>

      <section className="border-t bg-muted/40">
        <div className="mx-auto w-full max-w-4xl px-4 py-14 text-center">
          <SectionHeading
            eyebrow="No storage"
            title="Your data stays where it is"
            body="When you ask a question, the Multi-Trades MCP Server reads the relevant fields in real time, returns the answer with real data, and lets go. Disconnect any time and access ends with it. The one thing we do keep is your business context profile, which you can edit or delete."
          />
          <div className="mt-6">
            <Button variant="outline" asChild>
              <Link to="/security">How we handle your data</Link>
            </Button>
          </div>
          <div className="mx-auto mt-10 max-w-md text-left">
            <Testimonial
              quote="I asked why March dipped and got the answer in one sentence — realtor referrals down, with the names. Called two agents that afternoon."
              name="Mark D."
              detail="Owner, home inspection firm, 3-person team"
            />
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-3xl px-4 py-14">
        <SectionHeading title="Technology questions, answered" />
        <Faq items={FAQS} />
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button variant="outline" asChild>
            <Link to="/how-it-works">How it works in four steps</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/advisors">Meet your seven AI advisors</Link>
          </Button>
        </div>
      </section>

      <TrustCallout />

      <CtaBand
        title="See what your own numbers have been trying to tell you"
        body="Connect your software, connect the AI you already use — Claude, ChatGPT, and Gemini — and get deep insights backed by real-time data."
      />
    </MarketingLayout>
  );
}
