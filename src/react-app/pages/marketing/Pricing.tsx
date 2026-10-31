import { useContext, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PrerenderContext } from "../../components/marketing/prerender-context";
import { CheckCircleIcon } from "@heroicons/react/24/outline";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Skeleton } from "../../components/ui/skeleton";
import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import {
  CtaBand,
  Faq,
  PageHero,
  SectionHeading,
  Testimonial,
} from "../../components/marketing/MarketingBits";
import { parsePlanFeatures } from "../../lib/plan-features";

interface Plan {
  id: string;
  name: string;
  monthlyMinor: number;
  annualMinor: number;
  setupFeeMinor: number;
  trialPeriodDays: number;
  description: string | null;
  currency: string;
  maxUsers: number | null;
  allowBriefings: number | null;
  contactOnly: number;
  features: string | null;
}

const LADDER = [
  { step: "Revenue Leak Scorecard", price: "Free", body: "A dollar figure for what your leaks cost each month." },
  { step: "Workbooks and webinar", price: "Free", body: "Lead magnets and the monthly live 60-Job Blueprint session." },
  { step: "Discovery call", price: "Free", body: "Qualification using the score sheet, no pitch." },
  { step: "Loop Library", price: "Contact us", body: "Platform-specific automation recipes and scripts." },
  { step: "Snipe Diagnostic", price: "Contact us", body: "A 12-month data teardown with a Leak Map and readout." },
  { step: "Snipe Blueprint", price: "Contact us", body: "The full growth plan, presented within 10 business days." },
  { step: "Snipe Engine", price: "Contact us", body: "We launch it in 21 days, then run it with you." },
];

const FAQS = [
  {
    q: "How do I start?",
    a: "Book a call. We size the leak in dollars, agree the scope with you, and quote the plan on the call. Nothing is sold online.",
  },
  {
    q: "Can I buy an Engine plan online?",
    a: "No. Engine Core, Engine Command, and the rest of the offer ladder are scoped with you. Book a call and we will walk through fit, term, and setup.",
  },
  {
    q: "What is included in an engagement?",
    a: "One weekly scorecard, forecasting, and custom reports built from the software you already run: booking platform, CRM, phones, and ad accounts. It connects to Spectora and ISN at launch, with more vertical software added over time.",
  },
  {
    q: "What happens if I cancel?",
    a: "Cancel any time from billing. Access continues to the end of the period you paid for, then the subscription stops. Your account records follow the privacy policy.",
  },
  {
    q: "Can I switch plans later?",
    a: "Yes. Talk to us and we will move you to the plan that fits. Upgrades apply right away with a prorated charge. Downgrades start on the next cycle.",
  },
  {
    q: "Can I use a discount code?",
    a: "Mention it on the call. It applies from your first charged period onward. One coupon per subscription; totals never go below zero.",
  },
];

export function Pricing() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const prerendered = useContext(PrerenderContext);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  async function load() {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch("/api/plans");
      if (!res.ok) throw new Error("Could not load plans");
      const data = (await res.json()) as { plans?: Plan[] };
      setPlans(data.plans ?? []);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const contactTiers = plans.filter((p) => (p.contactOnly ?? 0) === 1);

  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Pricing"
        title="Growth, with the math done"
        lede="Every plan is scoped with you on a call, so you only pay for the system you actually need. Start by booking a call."
      />

      <section className="mx-auto w-full max-w-6xl px-4 pb-6">
        {loading && (prerendered || !mounted) ? (
          <div className="mx-auto mt-8 max-w-2xl text-center">
            <p className="text-muted-foreground">
              Plans load live from our billing system when you open this page.
            </p>
          </div>
        ) : loading ? (
          <div className="mx-auto mt-8 grid max-w-md gap-4">
            <Skeleton className="h-72 w-full" />
          </div>
        ) : failed ? (
          <div className="mx-auto mt-8 max-w-md text-center">
            <p className="text-muted-foreground">Could not load plans right now.</p>
            <Button className="mt-4" variant="outline" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        ) : plans.length === 0 ? (
          <div className="mx-auto mt-8 max-w-md text-center">
            <p className="text-muted-foreground">Plans are scoped on a call.</p>
            <Button className="mt-4" asChild>
              <Link to="/book">Book A Call</Link>
            </Button>
          </div>
        ) : (
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            {plans.map((p) => (
              <Card key={p.id} className="flex w-full max-w-sm flex-col">
                <CardHeader className="text-center">
                  <CardTitle>{p.name}</CardTitle>
                  {p.description && <CardDescription>{p.description}</CardDescription>}
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-4">
                  <ul className="space-y-2 text-sm">
                    {parsePlanFeatures(p.features).map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto space-y-2">
                    <p className="text-center text-sm font-semibold">Pricing on the call</p>
                    <Button className="w-full" asChild>
                      <Link to="/book">Book A Call</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="border-t bg-muted/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-14">
          <SectionHeading
            eyebrow="The offer ladder"
            title="Start where it makes sense"
            body="Every step is optional. The first three are free, and the paid steps are scoped so the price matches the work."
          />
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {LADDER.map((item) => (
              <Card key={item.step}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">{item.step}</CardTitle>
                    <Badge variant={item.price === "Free" ? "secondary" : "outline"}>{item.price}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{item.body}</CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-14">
        <SectionHeading
          eyebrow="Plan plus operator"
          title="Engine plans are scoped, not self-serve"
          body="We launch the system in 21 days, then run it with your team or ours. Pricing depends on scope, ad spend, and intake hours, so we quote it on a call."
        />
        {loading ? (
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : contactTiers.length === 0 ? (
          <p className="mt-8 text-center text-muted-foreground">
            Contact us for Engine pricing.
          </p>
        ) : (
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {contactTiers.map((p) => (
              <Card key={p.id} className="flex flex-col">
                <CardHeader>
                  <CardTitle>{p.name}</CardTitle>
                  {p.description && <CardDescription>{p.description}</CardDescription>}
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-4">
                  <ul className="space-y-2 text-sm">
                    {parsePlanFeatures(p.features).map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto space-y-2">
                    <p className="text-sm font-semibold">Pricing on the call</p>
                    <Button className="w-full" variant="outline" asChild>
                      <Link to="/book">Book A Call</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="border-t bg-muted/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-14">
          <div className="grid gap-4 md:grid-cols-2">
            <Testimonial
              quote="We stopped guessing which realtors were drying up. The scorecard showed it in week two, and we had the conversation before the month was gone."
              name="Marcus Hale"
              detail="Owner, Hale Home Inspections"
            />
            <Testimonial
              quote="The first thing they did was put a dollar figure on our missed calls. That number changed how we staffed the phone."
              name="Dana Whitfield"
              detail="Owner, Whitfield Property Inspections"
            />
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-3xl px-4 py-14">
        <h2 className="text-center text-2xl font-bold tracking-tight">Pricing questions, answered</h2>
        <Faq items={FAQS} />
      </section>

      <CtaBand
        title="Start with a call"
        body="Thirty minutes on your numbers. See the leak before you decide."
      />
    </MarketingLayout>
  );
}
