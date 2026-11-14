import { useState } from "react";
import { toast } from "sonner";
import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import { PageHero } from "../../components/marketing/MarketingBits";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";

const REVENUE_RANGES = [
  "Under $250k",
  "$250k to $500k",
  "$500k to $1M",
  "$1M to $2.5M",
  "Over $2.5M",
  "Prefer not to say",
];

const TEAM_SIZES = ["Just me", "2 to 5", "6 to 15", "16 to 50", "Over 50"];

const SOFTWARE = ["Spectora", "ISN", "ServiceTitan", "Housecall Pro", "Jobber", "Something else"];

const MARKETING_SPEND = ["None right now", "Under 1k/mo", "1k to 3k/mo", "3k to 10k/mo", "Over 10k/mo"];

const GROWTH_TARGETS = ["25% growth", "50% growth", "Double the business", "Not sure yet"];

const EMPTY = {
  name: "",
  workEmail: "",
  phone: "",
  businessName: "",
  website: "",
  trade: "",
  serviceArea: "",
  revenueRange: "",
  teamSize: "",
  software: "",
  growthChallenge: "",
  marketingSpend: "",
  growthTarget: "",
  notes: "",
};

function Field({ label, htmlFor, required, children }: { label: string; htmlFor: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor} required={required}>{label}</Label>
      {children}
    </div>
  );
}

export function Book() {
  const [form, setForm] = useState({ ...EMPTY });
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  function set(key: keyof typeof EMPTY, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      const res = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? "Could not send your request");
      setSent(true);
      toast.success("Request sent: we'll reply within one business day.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send your request");
    } finally {
      setPending(false);
    }
  }

  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Book a Free Growth Fit Call"
        title="Let's find out whether GrowthSnipe is the right growth partner for your business."
        lede="This is a focused 20-minute conversation to understand how your business gets customers today, where the growth process feels stuck and what you want to achieve next. We will recommend the most sensible next step. If there is not a fit, we will say so."
      />
      <section className="mx-auto w-full max-w-6xl px-4 pb-8">
        <div className="mx-auto grid max-w-4xl gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">What we will cover</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                <li>Your trade, service area and business model.</li>
                <li>Current annual revenue range and team capacity.</li>
                <li>How new enquiries arrive today.</li>
                <li>What happens after a call, form or estimate request.</li>
                <li>Your growth goal over the next 12 months.</li>
                <li>Whether you need a diagnosis, a plan or implementation support.</li>
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Before we talk</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                GrowthSnipe is designed for established home-service businesses that are ready to improve their growth process. The information helps us prepare for a useful conversation.
              </p>
              <p>It is not used to automatically reject a business based on one answer.</p>
            </CardContent>
          </Card>
        </div>
      </section>
      <section className="mx-auto w-full max-w-2xl px-4 pb-14">
        <Card>
          <CardHeader>
            <CardTitle>{sent ? "Request received" : "Request a call"}</CardTitle>
            {!sent && <CardDescription>Choose a time by telling us about the business. We usually reply within one business day.</CardDescription>}
          </CardHeader>
          <CardContent>
            {sent ? (
              <div className="space-y-2 text-sm text-muted-foreground">
                <p className="font-semibold text-foreground">Your call is booked in principle.</p>
                <p>You will receive a calendar confirmation and meeting details by email. Before the call, think about one question: <span className="font-medium text-foreground">What is the biggest thing stopping your business from growing right now?</span></p>
                <p>Bring the honest answer. That is where we will start.</p>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-4">
                <Field label="Name" htmlFor="book-name" required>
                  <Input id="book-name" value={form.name} onChange={(e) => set("name", e.target.value)} required maxLength={120} />
                </Field>
                <Field label="Work email" htmlFor="book-email" required>
                  <Input id="book-email" type="email" value={form.workEmail} onChange={(e) => set("workEmail", e.target.value)} required maxLength={200} />
                </Field>
                <Field label="Phone number" htmlFor="book-phone" required>
                  <Input id="book-phone" type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} required maxLength={40} />
                </Field>
                <Field label="Business name" htmlFor="book-business" required>
                  <Input id="book-business" value={form.businessName} onChange={(e) => set("businessName", e.target.value)} required maxLength={160} />
                </Field>
                <Field label="Website or Google Business Profile link" htmlFor="book-website" required>
                  <Input id="book-website" inputMode="url" placeholder="https://" value={form.website} onChange={(e) => set("website", e.target.value)} required maxLength={300} />
                </Field>
                <Field label="Trade / industry" htmlFor="book-trade" required>
                  <Input id="book-trade" placeholder="Home inspection" value={form.trade} onChange={(e) => set("trade", e.target.value)} required maxLength={120} />
                </Field>
                <Field label="Primary service area" htmlFor="book-area" required>
                  <Input id="book-area" placeholder="City, region" value={form.serviceArea} onChange={(e) => set("serviceArea", e.target.value)} required maxLength={160} />
                </Field>
                <Field label="Approximate annual revenue range" htmlFor="book-revenue" required>
                  <Select value={form.revenueRange} onValueChange={(v) => set("revenueRange", v)} required>
                    <SelectTrigger id="book-revenue"><SelectValue placeholder="Select a range" /></SelectTrigger>
                    <SelectContent>
                      {REVENUE_RANGES.map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Team size" htmlFor="book-team" required>
                  <Select value={form.teamSize} onValueChange={(v) => set("teamSize", v)} required>
                    <SelectTrigger id="book-team"><SelectValue placeholder="Select team size" /></SelectTrigger>
                    <SelectContent>
                      {TEAM_SIZES.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Current booking / field-service software" htmlFor="book-software" required>
                  <Select value={form.software} onValueChange={(v) => set("software", v)} required>
                    <SelectTrigger id="book-software"><SelectValue placeholder="Select your software" /></SelectTrigger>
                    <SelectContent>
                      {SOFTWARE.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Main growth challenge" htmlFor="book-challenge" required>
                  <Textarea id="book-challenge" value={form.growthChallenge} onChange={(e) => set("growthChallenge", e.target.value)} required minLength={10} maxLength={2000} rows={4} />
                </Field>
                <Field label="Current monthly marketing spend range (optional)" htmlFor="book-spend">
                  <Select value={form.marketingSpend} onValueChange={(v) => set("marketingSpend", v)}>
                    <SelectTrigger id="book-spend"><SelectValue placeholder="Select a range" /></SelectTrigger>
                    <SelectContent>
                      {MARKETING_SPEND.map((m) => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Target growth over the next 12 months (optional)" htmlFor="book-target">
                  <Select value={form.growthTarget} onValueChange={(v) => set("growthTarget", v)}>
                    <SelectTrigger id="book-target"><SelectValue placeholder="Select a target" /></SelectTrigger>
                    <SelectContent>
                      {GROWTH_TARGETS.map((g) => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Anything else we should know? (optional)" htmlFor="book-notes">
                  <Textarea id="book-notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} maxLength={2000} rows={3} />
                </Field>
                <Button type="submit" className="w-full" disabled={pending}>
                  {pending ? "Sending…" : "Request a call"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </section>
    </MarketingLayout>
  );
}
