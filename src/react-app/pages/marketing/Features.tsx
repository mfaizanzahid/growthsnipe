import { Link } from "react-router-dom";
import {
  ArrowTrendingUpIcon,
  BoltIcon,
  CalendarDaysIcon,
  ChartBarSquareIcon,
  ChatBubbleLeftRightIcon,
  ClipboardDocumentCheckIcon,
  ClockIcon,
  CurrencyDollarIcon,
  MegaphoneIcon,
  PhoneArrowUpRightIcon,
  SignalIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import { Button } from "../../components/ui/button";
import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import {
  CtaBand,
  IconTile,
  PageHero,
  SectionHeading,
  TrustCallout,
} from "../../components/marketing/MarketingBits";

const INTELLIGENCE = [
  {
    icon: ChartBarSquareIcon,
    title: "One weekly scorecard",
    body: "Booked jobs, average ticket, answer rate, lead source, and cost per booked inspection in one view, built from your own systems.",
  },
  {
    icon: ArrowTrendingUpIcon,
    title: "Forecast and compare",
    body: "See the month before it happens, then compare plan to actual every week so surprises show up early.",
  },
  {
    icon: CalendarDaysIcon,
    title: "Custom reports",
    body: "Track the handful of numbers your business actually runs on, not a wall of charts nobody reads.",
  },
  {
    icon: ClockIcon,
    title: "Speed to lead",
    body: "Every new inquiry timed from first contact to first reply, with a target under five minutes.",
  },
  {
    icon: SignalIcon,
    title: "Capacity triggers",
    body: "Know when demand outruns the calendar, so you add inspection slots or staff before bookings start slipping.",
  },
  {
    icon: CurrencyDollarIcon,
    title: "Leak tracking",
    body: "Missed calls, unanswered web forms, and abandoned follow-up quantified in dollars every month.",
  },
];

const VOICEIQ = [
  {
    icon: PhoneArrowUpRightIcon,
    title: "Every call scored",
    body: "Recorded calls are audited against four conversion indicators: greeting, due diligence, add-on offer, and confirmed next step.",
  },
  {
    icon: BoltIcon,
    title: "Alerts in an hour",
    body: "A booking-intent call without a confirmed next step, or a call below 70, triggers an alert to the owner or pod lead.",
  },
  {
    icon: ChatBubbleLeftRightIcon,
    title: "Coaching that lands",
    body: "Specific call feedback replaces general advice, so the next call improves before the week is over.",
  },
];

const DELIVERY = [
  {
    icon: MegaphoneIcon,
    title: "Paid media management",
    body: "Google Search and Maps, Local Services Ads, Meta retargeting, and agent outreach, all judged on booked inspections.",
  },
  {
    icon: UserGroupIcon,
    title: "Live answer and intake",
    body: "Your team answers first on Core. Our team answers first on Command. Voice AI covers overflow and after hours on both.",
  },
  {
    icon: ClipboardDocumentCheckIcon,
    title: "Build and launch",
    body: "Booking software, CRM, telephony, landing pages, and tracking go live inside the 21-day runway.",
  },
];

export function Features() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="What you get"
        title="The numbers, the calls, and the campaigns in one operating system."
        lede="GrowthSnipe combines SNIPE Intelligence™ analytics, SNIPE VoiceIQ™ call auditing, and hands-on growth execution. One scorecard tells you what changed. One team is accountable for changing it."
      />

      <section className="mx-auto w-full max-w-6xl px-4 py-14">
        <SectionHeading
          eyebrow="SNIPE Intelligence™"
          title="Know where the money is going."
          body="Connect the systems you already run and get a weekly read on the business, not another dashboard to interpret."
        />
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {INTELLIGENCE.map((f) => (
            <IconTile key={f.title} icon={f.icon} title={f.title} body={f.body} />
          ))}
        </div>
      </section>

      <section className="border-y bg-muted/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-14">
          <SectionHeading
            eyebrow="SNIPE VoiceIQ™"
            title="The phone is still the business."
            body="Most inspection revenue starts with a call. VoiceIQ™ makes sure the calls you already pay for turn into booked jobs."
          />
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {VOICEIQ.map((f) => (
              <IconTile key={f.title} icon={f.icon} title={f.title} body={f.body} />
            ))}
          </div>
          <div className="mt-8 text-center">
            <Button variant="outline" asChild>
              <Link to="/contact">Ask for a VoiceIQ sample audit</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-14">
        <SectionHeading
          eyebrow="Engine plans"
          title="Built with you, then run with you."
          body="Engine Core and Engine Command are plan-plus-operator engagements. Strategy is one part. The other part is the person who logs in and does the work."
        />
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {DELIVERY.map((f) => (
            <IconTile key={f.title} icon={f.icon} title={f.title} body={f.body} />
          ))}
        </div>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild>
            <Link to="/pricing">Compare plans</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/how-it-works">See the 21-day runway</Link>
          </Button>
        </div>
      </section>

      <TrustCallout />

      <CtaBand
        title="Start with the scorecard"
        body="Run SNIPE Intelligence™ free for 30 days, or book a discovery call and we will size the leak first."
      />
    </MarketingLayout>
  );
}
