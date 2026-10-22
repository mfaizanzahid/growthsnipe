import { useEffect, useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { ArrowLeftIcon, ArrowRightIcon, CheckCircleIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { authClient } from "../lib/auth-client";
import { useActiveOrg } from "../hooks/useActiveOrg";
import { COUNTRIES, DEFAULT_COUNTRY_CODE } from "../lib/countries";
import { formatMoney } from "../lib/money";
import { SafepayPayment } from "../components/SafepayPayment";
import { BillingAddressFields, EMPTY_BILLING_ADDRESS, billingAddressValid, requiresStateCode, type BillingAddress } from "../components/BillingAddressFields";
import { BusinessProfileForm, EMPTY_PROFILE, type BusinessProfileValues } from "../components/BusinessProfileForm";
import { ConnectPlatformForm } from "../components/ConnectPlatformForm";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Checkbox } from "../components/ui/checkbox";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Skeleton } from "../components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";
import { cn } from "../lib/utils";

interface Plan {
  id: string;
  name: string;
  monthlyMinor: number;
  annualMinor: number;
  setupFeeMinor: number;
  trialPeriodDays: number;
  description: string | null;
  currency: string;
}

type Step = "org" | "profile" | "connect" | "plan" | "review";
type Flow = "trial" | "paid";

const STEP_LABELS: Record<Step, string> = {
  org: "Workspace",
  profile: "Profile",
  connect: "Connect",
  plan: "Plan",
  review: "Pay",
};

function slugify(name: string): string {
  const base =
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "org";
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Forced onboarding: create org → pick plan (+coupon) → pay. */
export function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("org");
  const [orgName, setOrgName] = useState("");
  const [orgId, setOrgId] = useState<string | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [planId, setPlanId] = useState<string | null>(null);
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [coupon, setCoupon] = useState("");
  const [profile, setProfile] = useState<BusinessProfileValues>(EMPTY_PROFILE);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY_CODE);
  const [billingAddress, setBillingAddress] = useState<BillingAddress>(EMPTY_BILLING_ADDRESS);
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedBilling, setAgreedBilling] = useState(false);
  const [session, setSession] = useState<{
    tracker: string;
    clientToken: string;
    environment: string;
    amountMinor: number;
  } | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);
  // Trial flow (first workspace): org → profile → Pro trial → connect, no
  // card, no plan picker. Paid flow (further workspaces): org → profile →
  // plan → pay now → connect. Connect runs after billing is resolved so the
  // gated connections API accepts the save.
  const [flow, setFlow] = useState<Flow | null>(null);
  const [trialEndsAt, setTrialEndsAt] = useState<number | null>(null);
  const { orgs: existingOrgs, activeOrgId, loading: orgsLoading, superadmin } = useActiveOrg();

  useEffect(() => {
    fetch("/api/plans")
      .then(async (r) => ((await r.json()) as { plans?: Plan[] }))
      .then((data) => setPlans(data.plans ?? []))
      .catch(() => toast.error("Could not load plans"))
      .finally(() => setPlansLoading(false));
  }, []);

  // Returning users who already own a workspace continue to the profile step
  // (prefilled when a profile exists) instead of skipping straight to plans.
  const [orgStepSeen, setOrgStepSeen] = useState(false);
  // True when going "Back" from plan selection should return to workspace creation
  // (fresh users, or users who explicitly tapped "New"), not the dashboard.
  const [orgBackAllowed, setOrgBackAllowed] = useState(false);
  useEffect(() => {
    if (orgsLoading || orgStepSeen || step !== "org" || orgId) return;
    if (existingOrgs.length === 0) {
      setFlow("trial");
      setOrgBackAllowed(true);
      setOrgStepSeen(true);
      return;
    }
    const first = existingOrgs[0]!;
    if (existingOrgs.length === 1) {
      // A single workspace that never started any subscription (abandoned
      // onboarding) still gets its free trial — the paid flow would trap
      // users who never received the trial they were promised.
      setOrgStepSeen(true);
      fetch(`/api/billing/subscription?orgId=${first.id}`)
        .then((r) => {
          // Non-admin members can't read billing (or start trials): paid flow.
          if (!r.ok) throw new Error("paid flow");
          return r.json();
        })
        .then((d) => {
          const sub = (d as { subscription?: object | null } | null)?.subscription;
          setOrgId(activeOrgId ?? first.id);
          setFlow(sub ? "paid" : "trial");
          setStep("profile");
        })
        .catch(() => {
          setOrgId(activeOrgId ?? first.id);
          setFlow("paid");
          setStep("profile");
        });
      return;
    }
    setOrgId(activeOrgId ?? first.id);
    setFlow("paid");
    setStep("profile");
    setOrgStepSeen(true);
  }, [orgsLoading, orgStepSeen, step, orgId, existingOrgs, activeOrgId]);

  async function createOrg(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      const { data, error } = await authClient.organization.create({
        name: orgName.trim(),
        slug: slugify(orgName),
      });
      if (error || !data) throw new Error(error?.message ?? "Could not create organization");
      await authClient.organization.setActive({ organizationId: data.id });
      setOrgId(data.id);
      toast.success(`Workspace "${data.name}" created`);
      setOrgBackAllowed(false);
      setFlow(existingOrgs.length > 0 ? "paid" : "trial");
      setStep("profile");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create organization");
    } finally {
      setPending(false);
    }
  }

  async function startPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!plan || !orgId) return;
    if (!agreedTerms || !agreedBilling) {
      toast.error("Please accept the terms and billing authorization to continue");
      return;
    }
    const selected = COUNTRIES.find((c) => c.code === countryCode);
    const digits = phone.replace(/\D/g, "");
    if (!selected || digits.length < 7 || digits.length > 15) {
      toast.error("Enter a valid phone number");
      return;
    }
    if (!billingAddressValid(billingAddress, countryCode)) {
      toast.error(
        requiresStateCode(countryCode)
          ? "Enter your billing street address, city, and 2-letter state code"
          : "Enter your billing street address, city, and state",
      );
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/billing/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId,
          purpose: "signup",
          planId: plan.id,
          interval,
          couponCode: coupon || undefined,
          phone: `+${selected.dial}${digits}`,
          country: selected.code,
        }),
      });
      const data = (await res.json()) as {
        tracker?: string;
        clientToken?: string;
        environment?: string;
        amountMinor?: number;
        error?: string;
      };
      if (!res.ok || !data.tracker || !data.clientToken) {
        throw new Error(data.error ?? "Could not start payment");
      }
      setSession({
        tracker: data.tracker,
        clientToken: data.clientToken,
        environment: data.environment ?? "sandbox",
        amountMinor: data.amountMinor ?? 0,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start payment");
    } finally {
      setPending(false);
    }
  }

  async function confirmPayment(tracker: string) {
    if (!plan || !orgId) return;
    try {
      const res = await fetch("/api/billing/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId,
          planId: plan.id,
          interval,
          couponCode: coupon || undefined,
          tracker,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Subscription failed");
      setStep("connect");
      toast.success("Subscription active — now connect your platform!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Subscription failed");
      setSession(null);
    }
  }

  // Leaving the connect step finishes onboarding. The trial is already active
  // by now (it starts before connect so the connections gate passes); the
  // repeat-guarded beginTrial call below is a safe no-op.
  async function finishConnect() {
    if (activeFlow === "trial") {
      if (await beginTrial()) setDone(true);
    } else {
      setDone(true);
    }
  }

  const plan = plans.find((p) => p.id === planId) ?? null;
  const recurring = plan ? (interval === "month" ? plan.monthlyMinor : plan.annualMinor) : 0;
  const dueNow = (plan?.setupFeeMinor ?? 0) + recurring;
  const activeFlow: Flow = flow ?? "trial";
  const steps: Step[] = activeFlow === "trial" ? ["org", "profile", "connect"] : ["org", "profile", "plan", "review", "connect"];

  // Prefill the business profile when entering the profile step.
  useEffect(() => {
    if (step !== "profile" || !orgId || profileLoaded) return;
    fetch(`/api/sidekick/business-profile?orgId=${orgId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const p = (d as { profile?: Record<string, string | null> } | null)?.profile;
        if (p) {
          setProfile({
            businessName: p.businessName ?? "",
            trade: p.trade ?? "",
            serviceArea: p.serviceArea ?? "",
            ownerName: p.ownerName ?? "",
            teamSize: p.teamSize ?? "",
            servicesMain: p.servicesMain ?? "",
            servicesHighValue: p.servicesHighValue ?? "",
            servicesRecurring: p.servicesRecurring ?? "",
          });
        }
      })
      .catch(() => undefined)
      .finally(() => setProfileLoaded(true));
  }, [step, orgId, profileLoaded]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setPending(true);
    try {
      const res = await fetch("/api/sidekick/business-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, ...profile }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null) as { error?: string } | null)?.error ?? "Could not save business profile");
      if (activeFlow === "trial") {
        // Trial starts before connect: the connections API requires trialing.
        if (await beginTrial()) setStep("connect");
      } else {
        setStep("plan");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save business profile");
    } finally {
      setPending(false);
    }
  }

  // Starts the Pro trial (first workspace only). Returns true when the org is
  // trialing afterwards — including when the trial was already started (page
  // revisit, Back-button repeat: the server 409s, so we recover the existing
  // trial end instead of failing). The trial must be active BEFORE the
  // connect step: saving a platform connection requires trialing/active.
  async function beginTrial(): Promise<boolean> {
    if (!orgId) return false;
    if (trialEndsAt) return true;
    setPending(true);
    try {
      const res = await fetch("/api/billing/trial/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId }),
      });
      const data = (await res.json().catch(() => null)) as { trialEndsAt?: number; error?: string } | null;
      if (!res.ok) {
        if (/already has a subscription/i.test(data?.error ?? "")) {
          const sub = (await fetch(`/api/billing/subscription?orgId=${orgId}`).then((r) =>
            r.ok ? r.json() : null,
          ).catch(() => null)) as { subscription?: { trialEndsAt?: number | null } | null } | null;
          setTrialEndsAt(sub?.subscription?.trialEndsAt ?? null);
          return true;
        }
        throw new Error(data?.error ?? "Could not start trial");
      }
      setTrialEndsAt(data?.trialEndsAt ?? null);
      toast.success("Pro trial started — welcome aboard!");
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start trial");
      return false;
    } finally {
      setPending(false);
    }
  }

  // Superadmins are platform operators — no workspace or subscription needed.
  if (!orgsLoading && superadmin) return <Navigate to="/superadmin" replace />;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
      <div className="mb-6 flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={s} className="flex flex-1 items-center gap-2 last:flex-none">
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                steps.indexOf(step) >= i ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {i + 1}
            </span>
            <span className={cn("hidden text-xs font-medium sm:block", steps.indexOf(step) >= i ? "text-foreground" : "text-muted-foreground")}>
              {STEP_LABELS[s]}
            </span>
            {i < steps.length - 1 && <span className="h-px flex-1 bg-border" />}
          </div>
        ))}
      </div>

      {step === "org" && (
        <Card>
          <CardHeader>
            <CardTitle>Create your workspace</CardTitle>
            <CardDescription>Each workspace has its own billing, members, and subscription.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={createOrg} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="org-name">Organization name</Label>
                <Input id="org-name" placeholder="Acme Inc" value={orgName} onChange={(e) => setOrgName(e.target.value)} required />
              </div>
              <Button type="submit" className="w-full" disabled={pending || !orgName.trim()}>
                {pending ? "Creating…" : "Create workspace"}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => navigate("/dashboard")}>
                Cancel
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {step === "profile" && (
        <Card>
          <CardHeader>
            <CardTitle>About your business</CardTitle>
            <CardDescription>Personalizes your briefings, snapshots, and AI answers. Business name and trade are required.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={saveProfile} className="space-y-4">
              <BusinessProfileForm value={profile} onChange={setProfile} idPrefix="ob" />
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => (orgBackAllowed ? setStep("org") : navigate("/dashboard"))}>
                  <ArrowLeftIcon className="size-4" /> Back
                </Button>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => {
                      if (activeFlow === "trial") {
                        void beginTrial().then((ok) => {
                          if (ok) setStep("connect");
                        });
                      } else {
                        setStep("plan");
                      }
                    }}
                  >
                    Skip
                  </Button>
                  <Button type="submit" disabled={pending || !profile.businessName.trim() || !profile.trade.trim()}>
                    {pending ? "Saving…" : "Continue"} <ArrowRightIcon className="size-4" />
                  </Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {step === "connect" && orgId && !done && (
        <Card>
          <CardHeader>
            <CardTitle>Connect your platform</CardTitle>
            <CardDescription>
              Link Spectora or ISN so your AI can read your live business data. Credentials are encrypted and never shown again.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ConnectPlatformForm orgId={orgId} submitLabel="Connect platform" onConnected={() => finishConnect()} />
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(activeFlow === "trial" ? "profile" : "review")}>
                <ArrowLeftIcon className="size-4" /> Back
              </Button>
              <Button variant="ghost" onClick={() => finishConnect()}>
                Skip for now
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "plan" && activeFlow === "paid" && (
        <Card>
          <CardHeader>
            <CardTitle>Pick a plan</CardTitle>
            <CardDescription>No trial on additional workspaces — the first period is charged today.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {existingOrgs.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="billing-org">Bill this workspace</Label>
                <div className="flex gap-2">
                  <Select value={orgId ?? undefined} onValueChange={setOrgId}>
                    <SelectTrigger id="billing-org" className="flex-1">
                      <SelectValue placeholder="Select workspace" />
                    </SelectTrigger>
                    <SelectContent>
                      {existingOrgs.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" onClick={() => { setOrgBackAllowed(true); setStep("org"); }}>
                    New
                  </Button>
                </div>
              </div>
            )}
            <Tabs value={interval} onValueChange={(v) => setInterval(v as "month" | "year")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="month">Monthly</TabsTrigger>
                <TabsTrigger value="year">Yearly</TabsTrigger>
              </TabsList>
            </Tabs>
            {plansLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {plans.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPlanId(p.id)}
                    className={cn(
                      "rounded-lg border p-4 text-left transition-colors hover:border-primary",
                      planId === p.id && "border-primary ring-1 ring-primary",
                    )}
                  >
                    <div className="font-semibold">{p.name}</div>
                    <div className="mt-1 text-2xl font-bold">
                      {formatMoney(interval === "month" ? p.monthlyMinor : p.annualMinor, p.currency)}
                      <span className="text-sm font-normal text-muted-foreground">
                        /{interval === "month" ? "mo" : "yr"}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      + {formatMoney(p.setupFeeMinor, p.currency)} setup
                      {p.trialPeriodDays > 0 && ` · ${p.trialPeriodDays}-day trial`}
                    </div>
                    {p.description && <div className="mt-2 text-sm">{p.description}</div>}
                  </button>
                ))}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="coupon">Discount code (optional)</Label>
              <Input id="coupon" placeholder="SAVE20" value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} />
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep("profile")}>
                <ArrowLeftIcon className="size-4" /> Back
              </Button>
              <Button disabled={!plan || !orgId} onClick={() => setStep("review")}>
                Review order <ArrowRightIcon className="size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "review" && plan && activeFlow === "paid" && (
        <Card>
          <CardHeader>
            <CardTitle>Review & pay</CardTitle>
            <CardDescription>
              {plan.name} ({interval === "month" ? "monthly" : "yearly"})
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span>First period</span>
                <span>{formatMoney(recurring, plan.currency)}</span>
              </div>
              <div className="flex justify-between">
                <span>Setup fee</span>
                <span>{formatMoney(plan.setupFeeMinor, plan.currency)}</span>
              </div>
              {coupon && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Discount ({coupon})</span>
                  <span>applied at payment</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-2 font-semibold">
                <span>Due today</span>
                <span>{formatMoney(dueNow, plan.currency)}</span>
              </div>
            </div>
            {session ? (
              <SafepayPayment
              tracker={session.tracker}
              clientToken={session.clientToken}
              environment={session.environment}
              mode="payment"
              billingAddress={billingAddress}
              country={countryCode}
              submitLabel={`Pay ${formatMoney(session.amountMinor, plan.currency)}`}
              onSuccess={confirmPayment}
              onError={(m) => toast.error(m)}
              onCancel={() => setSession(null)}
            />
            ) : (
              <form onSubmit={startPayment} className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <div className="flex gap-2">
                    <Select value={countryCode} onValueChange={setCountryCode}>
                      <SelectTrigger id="country-code" className="w-36 shrink-0" aria-label="Country code">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COUNTRIES.map((c) => (
                          <SelectItem key={`${c.code}-${c.dial}`} value={c.code}>
                            {c.name} +{c.dial}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      id="phone"
                      inputMode="tel"
                      placeholder="3001234567"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                      required
                    />
                  </div>
                </div>
                <BillingAddressFields value={billingAddress} onChange={setBillingAddress} idPrefix="ob-billing" countryCode={countryCode} />
                <label className="flex cursor-pointer items-start gap-2 text-xs/relaxed text-muted-foreground">
                  <Checkbox
                    checked={agreedTerms}
                    onCheckedChange={(v) => setAgreedTerms(v === true)}
                    aria-label="Agree to Terms of Service and Privacy Policy"
                  />
                  <span>
                    I agree to the{" "}
                    <a
                      className="underline"
                      href="/terms"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Terms of Service
                    </a>{" "}
                    and{" "}
                    <a
                      className="underline"
                      href="/privacy"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Privacy Policy
                    </a>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 text-xs/relaxed text-muted-foreground">
                  <Checkbox
                    checked={agreedBilling}
                    onCheckedChange={(v) => setAgreedBilling(v === true)}
                    aria-label="Authorize recurring and usage charges"
                  />
                  <span>
                    I authorize auto-charging of my payment method for the recurring subscription fee.
                  </span>
                </label>
                <Button type="submit" className="w-full" disabled={pending || !agreedTerms || !agreedBilling || !billingAddressValid(billingAddress, countryCode)}>
                  {pending ? "Starting payment…" : "Continue to payment"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      {done && activeFlow === "trial" && (
        <Card>
          <CardContent className="space-y-3 pt-6 text-center">
            <CheckCircleIcon className="mx-auto size-12 text-green-600" />
            <p className="font-medium">
              Pro trial active{trialEndsAt ? ` — ends ${new Date(trialEndsAt * 1000).toLocaleDateString()}` : ""}!
            </p>
            <p className="text-sm text-muted-foreground">Full access for 30 days, no card required. Subscribe anytime from billing.</p>
            <Button className="w-full" onClick={() => navigate("/dashboard")}>
              Go to dashboard
            </Button>
          </CardContent>
        </Card>
      )}

      {done && activeFlow === "paid" && (
        <Card>
          <CardContent className="space-y-3 pt-6 text-center">
            <CheckCircleIcon className="mx-auto size-12 text-green-600" />
            <p className="font-medium">Payment complete — welcome aboard!</p>
            <p className="text-sm text-muted-foreground">Your workspace is subscribed and ready.</p>
            <Button className="w-full" onClick={() => navigate("/dashboard")}>
              Go to dashboard
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

