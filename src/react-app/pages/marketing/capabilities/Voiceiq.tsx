import { Link } from "react-router-dom";
import { MarketingLayout } from "../../../components/marketing/MarketingLayout";
import { CtaBand, PageHero, SectionHeading, TrustCallout } from "../../../components/marketing/MarketingBits";
import { Button } from "../../../components/ui/button";
import { CheckCircleIcon } from "@heroicons/react/24/outline";

const SUPPORTS = [
  "Inbound call capture and caller identification.",
  "Basic service and location qualification.",
  "Supported booking and scheduling actions.",
  "Message capture and callback task creation.",
  "Call routing and escalation rules.",
  "Conversation review and quality flags.",
  "Insights that help improve scripts, response and customer experience.",
];

export function Voiceiq() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="SNIPE VoiceIQ™"
        title="A missed call should not become a missed opportunity by default."
        lede="SNIPE VoiceIQ™ supports your call-handling system with configured Voice AI fallback, call routing and conversation-quality insights. It helps capture important details, handle supported requests and flag conversations that need human attention."
      />
      <section className="mx-auto w-full max-w-6xl px-4 pb-14">
        <div className="text-center">
          <Button size="lg" asChild>
            <Link to="/book">Improve My Call Handling</Link>
          </Button>
        </div>
      </section>

      <section className="border-t bg-muted/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-16">
          <SectionHeading
            eyebrow="How coverage works"
            title="Humans first. AI as configured fallback."
          />
          <div className="mx-auto mt-8 max-w-3xl rounded-xl border bg-card p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Inside SNIPE Engine™, your team can answer first with configured Voice AI as fallback, or our live team can handle agreed live intake with Voice AI covering overflow and after hours. The exact coverage model is agreed in writing before you start.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-16">
        <SectionHeading
          eyebrow="What the system supports"
          title="Designed around supported tasks and clear rules."
        />
        <div className="mx-auto mt-8 grid max-w-4xl gap-3 md:grid-cols-2">
          {SUPPORTS.map((item) => (
            <div key={item} className="flex items-start gap-2 rounded-lg border bg-card p-4 text-sm text-muted-foreground">
              <CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              {item}
            </div>
          ))}
        </div>
        <div className="mx-auto mt-8 max-w-3xl rounded-lg border bg-muted/40 p-6 text-center">
          <h3 className="font-semibold">Human oversight matters</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Voice AI is configured around supported tasks and agreed business rules. Complex, sensitive, unusual or unsupported requests should be routed to a person. Coverage depends on phone routing, system availability, client information, integrations and the agreed operating scope.
          </p>
        </div>
        <div className="mt-8 text-center">
          <Button size="lg" asChild>
            <Link to="/book">Book a Free Growth Fit Call</Link>
          </Button>
        </div>
      </section>

      <TrustCallout />

      <CtaBand
        title="Never miss the calls that pay for everything else."
        body="Configured call coverage with quality flags and callback tasks, reviewed against your booking process."
      />
    </MarketingLayout>
  );
}
