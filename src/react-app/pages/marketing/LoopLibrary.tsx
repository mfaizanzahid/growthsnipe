import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import { CtaBand, PageHero, SectionHeading } from "../../components/marketing/MarketingBits";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";

const TRADES = [
  "Home inspection",
  "HVAC",
  "Plumbing",
  "Electrical",
  "Roofing",
  "General contracting",
];

const VOLUMES = ["1 to 10", "11 to 30", "31 to 75", "More than 75", "Prefer not to say"];

const CATEGORIES = [
  {
    title: "Lead capture loops",
    body: "Missed-call text-back, web enquiry acknowledgement, after-hours response and unbooked-lead follow-up.",
  },
  {
    title: "Booking and pre-service loops",
    body: "Appointment confirmation, preparation reminders, reschedule recovery and relevant pre-service add-ons.",
  },
  {
    title: "Quote and estimate loops",
    body: "Quote follow-up, decision reminders, objection prompts and lost-estimate reactivation.",
  },
  {
    title: "Review and reputation loops",
    body: "Post-job review requests, review reminders and internal alerts when feedback needs attention.",
  },
  {
    title: "Repeat revenue loops",
    body: "Seasonal reminders, annual checkups, warranty milestones, maintenance renewals and re-test cycles.",
  },
  {
    title: "Referral partner loops",
    body: "Partner introduction, value follow-up, periodic check-ins and dormant-partner reactivation.",
  },
];

export function LoopLibrary() {
  const [firstName, setFirstName] = useState("");
  const [workEmail, setWorkEmail] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [trade, setTrade] = useState("");
  const [software, setSoftware] = useState("");
  const [volume, setVolume] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      const res = await fetch("/api/loop-library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, workEmail, businessName, trade, software, volume }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? "Could not send your request");
      setSent(true);
      toast.success("Check your inbox for access to SNIPE Loops™.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send your request");
    } finally {
      setPending(false);
    }
  }

  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Free tools for owners who want a better system"
        title="Stop letting good customers disappear after the first interaction."
        lede="Get practical automation recipes, follow-up scripts and customer lifecycle ideas you can adapt to your home-service business. SNIPE Loops™ is designed to help you capture more of the opportunities already around you, without starting with a complicated software project."
      />
      <section className="mx-auto w-full max-w-2xl px-4 pb-14">
        <Card>
          <CardHeader>
            <CardTitle>{sent ? "Check your inbox" : "Send me SNIPE Loops™"}</CardTitle>
            {!sent && <CardDescription>Get free access. We usually reply within one business day.</CardDescription>}
          </CardHeader>
          <CardContent>
            {sent ? (
              <div className="space-y-4 text-sm text-muted-foreground">
                <p>Thanks. Check your inbox for the access link.</p>
                <Button variant="outline" asChild>
                  <Link to="/thank-you/loop-library">What happens next</Link>
                </Button>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="loop-first-name">First name</Label>
                  <Input id="loop-first-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} required maxLength={120} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="loop-email">Work email</Label>
                  <Input id="loop-email" type="email" value={workEmail} onChange={(e) => setWorkEmail(e.target.value)} required maxLength={200} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="loop-business">Business name</Label>
                  <Input id="loop-business" value={businessName} onChange={(e) => setBusinessName(e.target.value)} required maxLength={160} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="loop-trade">Trade / industry</Label>
                  <Select value={trade} onValueChange={setTrade} required>
                    <SelectTrigger id="loop-trade"><SelectValue placeholder="Select your trade" /></SelectTrigger>
                    <SelectContent>
                      {TRADES.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="loop-software">Business software (optional)</Label>
                  <Input id="loop-software" value={software} onChange={(e) => setSoftware(e.target.value)} maxLength={120} placeholder="e.g. Spectora, ServiceTitan" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="loop-volume">Monthly job volume (optional)</Label>
                  <Select value={volume} onValueChange={setVolume}>
                    <SelectTrigger id="loop-volume"><SelectValue placeholder="Select a range" /></SelectTrigger>
                    <SelectContent>
                      {VOLUMES.map((v) => (
                        <SelectItem key={v} value={v}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">
                  By submitting, you agree to receive SNIPE Loops™ and related GrowthSnipe emails. Unsubscribe at any time. See our <Link className="underline" to="/privacy">Privacy Policy</Link>.
                </p>
                <Button type="submit" className="w-full" disabled={pending}>
                  {pending ? "Sending…" : "Download SNIPE Loops™"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="border-t bg-muted/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-16">
          <SectionHeading
            eyebrow="Inside the library"
            title="Six loop categories, one goal: no opportunity left behind."
          />
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {CATEGORIES.map((c) => (
              <Card key={c.title}>
                <CardHeader>
                  <CardTitle className="text-base">{c.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{c.body}</CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-16">
        <SectionHeading eyebrow="Trades covered" title="Pick your trade." body="The library will expand by trade and platform, with new recipes added over time." />
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {TRADES.map((t) => (
            <span key={t} className="rounded-full border px-4 py-1.5 text-sm text-muted-foreground">
              {t}
            </span>
          ))}
        </div>
      </section>

      <section className="border-t bg-muted/40">
        <div className="mx-auto w-full max-w-3xl px-4 py-16">
          <SectionHeading
            eyebrow="Sample recipe"
            title="The Unbooked Enquiry Follow-Up Loop"
          />
          <ol className="mx-auto mt-8 max-w-2xl list-decimal space-y-3 pl-6 text-sm text-muted-foreground">
            <li>New enquiry is recorded with source and service requested.</li>
            <li>Immediate acknowledgement confirms the enquiry was received.</li>
            <li>If no booking occurs, a relevant follow-up is sent after the configured interval.</li>
            <li>A team task is created when a personal response is required.</li>
            <li>The record is updated when the lead books, declines or becomes inactive.</li>
          </ol>
          <p className="mx-auto mt-6 max-w-2xl text-center text-sm text-muted-foreground">
            The recipe is a starting point, not a plug-and-play guarantee. Timing, wording, consent and platform configuration should be adapted to the business and applicable communication rules.
          </p>
        </div>
      </section>

      <CtaBand
        title="Take one leak off the table this week."
        body="Get the free recipes, adapt one to your process and start building a more consistent customer journey."
      />
    </MarketingLayout>
  );
}
