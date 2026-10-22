import { useContext, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PrerenderContext } from "../../components/marketing/prerender-context";
import { CheckCircleIcon } from "@heroicons/react/24/outline";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Skeleton } from "../../components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import {
  CtaBand,
  Eyebrow,
  Faq,
  HeroBackdrop,
  Testimonial,
} from "../../components/marketing/MarketingBits";
import { formatWholeMoney } from "../../lib/money";
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
  features: string | null;
}

/** Yearly billing at ~10x monthly means ~2 months free vs paying monthly. */
function hasAnnualDeal(plan: Plan): boolean {
  return plan.monthlyMinor > 0 && plan.annualMinor > 0 && plan.annualMinor <= 10 * plan.monthlyMinor;
}

const FAQS = [
  {
    q: "How does the free trial work? Do I need a card?",
    a: "Every first workspace gets 30 days with full access — no card, no charge, no invoice. Pick a plan when it ends. Additional workspaces subscribe right away with no trial.",
  },
  {
    q: "What happens to my data if I cancel?",
    a: "Business data was never stored — it was read in real time from your connected software, so there is nothing to return or delete on our side. Your business context profile and account records follow the privacy policy, and the Tradesmatic team deletes your profile on request.",
  },
  {
    q: "Can I switch plans or cancel later?",
    a: "Yes, from the billing section. Upgrades apply right away with a prorated charge; downgrades take effect from the next cycle and plan limits apply at once. Canceling keeps access until the end of the paid period.",
  },
  {
    q: "How does member and user pricing work?",
    a: "Each plan sets how many users it includes — the plan card lists exactly what is included. If you outgrow your limit, move to a plan with a higher limit; details are in our pricing plans comparison above.",
  },
  {
    q: "What does “unlimited users” mean?",
    a: "On plans that list unlimited users, every member you invite gets full access under your workspace roles at no extra per-user charge. Plans without it list their exact user limit on the card.",
  },
  {
    q: "Can I use a discount code?",
    a: "Enter it at signup. It applies from your first charged period onward. One coupon per subscription; totals never go below zero.",
  },
];

/**
 * Public pricing page. Plans are data: everything rendered here comes from
 * GET /api/plans (active only). Never hard-code plan names or prices here.
 */
export function Pricing() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [interval, setInterval] = useState<"month" | "year">("month");
  // Prerendered HTML (and the very first client paint, so hydration matches)
  // shows this static paragraph instead of the loading skeleton: plan cards
  // always render live from GET /api/plans after mount.
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

  return (
    <MarketingLayout>
      <section className="relative overflow-hidden">
        <HeroBackdrop />
        <div className="mx-auto w-full max-w-6xl px-4 py-14">
          <div className="text-center">
            <Eyebrow>Pricing</Eyebrow>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Pricing that fits the shop
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
              Tradesmatic is a decision-making platform that delivers deep insights and
              data-backed actions inside Claude, ChatGPT, and Gemini — connected to Spectora,
              ISN, ServiceTitan, Housecall Pro, and Jobber in real time through our
              Multi-Trades™ MCP Server. Every plan includes the dashboard and the AI
              connection. Prices in USD.
            </p>
          </div>

          <div className="mx-auto mt-8 max-w-xs">
            <Tabs value={interval} onValueChange={(v) => setInterval(v as "month" | "year")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="month">Monthly</TabsTrigger>
                <TabsTrigger value="year">Yearly</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {loading && (prerendered || !mounted) ? (
            <div className="mx-auto mt-8 max-w-2xl text-center">
              <p className="text-muted-foreground">
                Plans and current prices load live from our billing system when you open this
                page — every plan includes the dashboard and the AI connection, billed monthly
                or yearly in USD, starting with a 30-day free trial that needs no card.
              </p>
            </div>
          ) : loading ? (
            <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-64 w-full" />
              ))}
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
              <p className="text-muted-foreground">No plans are available yet — check back soon.</p>
              <Button className="mt-4" asChild>
                <Link to="/signup">Create your account</Link>
              </Button>
            </div>
          ) : (
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              {plans.map((p) => {
                const recurring = interval === "month" ? p.monthlyMinor : p.annualMinor;
                const annualDeal = interval === "year" && hasAnnualDeal(p);
                return (
                  <Card key={p.id} className="flex w-full max-w-sm flex-col">
                    <CardHeader className="text-center">
                      <CardTitle>{p.name}</CardTitle>
                      {p.description && <CardDescription>{p.description}</CardDescription>}
                    </CardHeader>
                    <CardContent className="flex flex-1 flex-col gap-4">
                      <div className="text-center text-4xl font-bold">
                        {formatWholeMoney(recurring, p.currency)}
                        <span className="text-base font-normal text-muted-foreground">
                          /{interval === "month" ? "mo" : "yr"}
                        </span>
                      </div>
                      {annualDeal && (
                        <p className="text-center text-sm font-semibold text-primary">
                          Get 2 months free!
                        </p>
                      )}
                      <ul className="space-y-2 text-sm">
                        {parsePlanFeatures(p.features).map((f) => (
                          <li key={f} className="flex items-start gap-2">
                            <CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                            {f}
                          </li>
                        ))}
                      </ul>
                      <Button className="mt-auto w-full" asChild>
                        <Link to="/signup">Start 30-day free trial</Link>
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-muted-foreground">
            30-day free trial, full access, no card. Yearly gets 2 months free. Change or cancel
            from billing any time — access runs to the end of the paid period.
          </p>
        </div>
      </section>

      <section className="border-t bg-muted/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-14">
          <div className="mx-auto max-w-md">
            <Testimonial
              quote="It costs less than a tank of gas and caught a slow week I would have missed. Nothing else on the card earns it."
              name="Jennifer Pratt"
              detail="Owner, Bayou City Electrical"
            />
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-3xl px-4 py-14">
        <h2 className="text-center text-2xl font-bold tracking-tight">Pricing questions, answered</h2>
        <Faq items={FAQS} />
      </section>

      <CtaBand
        title="Start with the trial"
        body="Thirty days of full access. If the briefings don't earn their mornings, pay nothing."
      />
    </MarketingLayout>
  );
}
