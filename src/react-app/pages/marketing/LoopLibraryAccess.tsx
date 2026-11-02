import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import { PageHero, SectionHeading } from "../../components/marketing/MarketingBits";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";

const LOOPS = [
  {
    title: "Missed-call text-back",
    body: "Every missed call gets an immediate text: who you are, that you saw their call, and one question to keep the conversation moving. Unanswered callers hear from you within minutes, not days.",
  },
  {
    title: "Unbooked enquiry follow-up",
    body: "Enquiries that do not book get a short sequence: acknowledgement, a useful next step, then a check-in. Each touch references the original request so it never feels generic.",
  },
  {
    title: "Quote follow-up cadence",
    body: "Estimates get three touches: same-day recap, a 48-hour check-in, and a one-week close-out with an easy yes-or-no question. Lost estimates go into a reactivation list, not a black hole.",
  },
  {
    title: "Review requests that get answered",
    body: "Ask at the moment of highest satisfaction: right after the job is complete and confirmed. One link, one sentence, one reminder for non-responders.",
  },
  {
    title: "Maintenance and repeat revenue",
    body: "Seasonal reminders, annual checkups, warranty milestones and maintenance renewals, scheduled by equipment age and last service date.",
  },
  {
    title: "Referral partner flywheel",
    body: "Partner introduction, value follow-up, periodic check-ins and dormancy alerts when a referring relationship goes quiet for 60 days.",
  },
];

export function LoopLibraryAccess() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<"checking" | "ok" | "denied">("checking");
  const [firstName, setFirstName] = useState("");

  useEffect(() => {
    if (!token) {
      setState("denied");
      return;
    }
    fetch(`/api/loop-library/access?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("invalid");
        const data = (await r.json()) as { firstName?: string };
        setFirstName(data.firstName ?? "");
        setState("ok");
      })
      .catch(() => setState("denied"));
  }, [token]);

  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Free SNIPE Loops™"
        title="Your growth loops, ready to install."
        lede={state === "ok" && firstName ? `Hi ${firstName}. Start with the loop that fixes your most obvious gap.` : "Start with the loop that fixes your most obvious gap."}
      />
      <section className="mx-auto w-full max-w-4xl px-4 pb-14">
        {state === "checking" && <p className="text-center text-muted-foreground">Checking your access link…</p>}
        {state === "denied" && (
          <Card className="mx-auto max-w-md text-center">
            <CardContent className="space-y-4 pt-6">
              <p className="text-sm text-muted-foreground">This link is invalid or expired. Request a fresh one from the SNIPE Loops™ page.</p>
              <Button asChild>
                  <Link to="/loop-library">Download SNIPE Loops™</Link>
              </Button>
            </CardContent>
          </Card>
        )}
        {state === "ok" && (
          <div className="grid gap-4 md:grid-cols-2">
            {LOOPS.map((loop) => (
              <Card key={loop.title}>
                <CardHeader>
                  <CardTitle className="text-base">{loop.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{loop.body}</CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
      {state === "ok" && (
        <section className="mx-auto w-full max-w-3xl px-4 pb-14 text-center">
          <SectionHeading
            title="Want the plan behind the loops?"
            body="The Diagnostic finds your leaks. The Blueprint turns them into a 12-month plan."
          />
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild>
              <Link to="/diagnostic">Get My SNIPE Diagnostic™</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/blueprint">Get My SNIPE Blueprint™</Link>
            </Button>
          </div>
        </section>
      )}
    </MarketingLayout>
  );
}
