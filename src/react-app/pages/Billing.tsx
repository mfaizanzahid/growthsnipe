import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { LockClosedIcon, CheckCircleIcon } from "@heroicons/react/24/outline";
import { authClient } from "../lib/auth-client";
import { formatMoney, formatWholeMoney } from "../lib/money";
import { notifyBillingChanged } from "../lib/billing-events";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import { Checkbox } from "../components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Skeleton } from "../components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip";
import { SafepayPayment } from "../components/SafepayPayment";
import { BillingAddressFields, EMPTY_BILLING_ADDRESS, billingAddressValid, requiresStateCode, type BillingAddress } from "../components/BillingAddressFields";
import { COUNTRIES, DEFAULT_COUNTRY_CODE } from "../lib/countries";
import { parsePlanFeatures } from "../lib/plan-features";

interface Method {
  id: string;
  brand: string | null;
  last4: string | null;
  expiryMonth: number | null;
  expiryYear: number | null;
  isDefault: boolean;
  priority: number;
  status: string;
}

interface Invoice {
  id: string;
  number: string | null;
  type: string;
  status: string;
  amountMinor: number;
  currency: string;
  description: string | null;
}

interface Subscription {
  id: string;
  planId: string;
  interval: string;
  status: string;
  nextCharge: number;
  recurringAmountMinor: number;
  currency: string;
  trialEndsAt?: number | null;
  /** 1 = the trial was prepaid: the plan starts when the trial ends. */
  trialPrepaid?: number | null;
}

interface Plan {
  id: string;
  name: string;
  monthlyMinor: number;
  annualMinor: number;
  currency: string;
  maxUsers: number | null;
  allowBriefings: number | null;
  contactOnly?: number;
  features: string | null;
}

function selfServePlans(plans: Plan[]): Plan[] {
  return plans.filter((p) => (p.contactOnly ?? 0) === 0);
}

function statusBadge(status: string) {
  const variant =
    status === "paid" || status === "active" || status === "trialing"
      ? "success"
      : status === "failed" || status === "past_due" || status === "unpaid" || status === "expired" || status === "trial_expired" || status === "revoked" || status === "suspended"
        ? "destructive"
        : "default";
  return <Badge variant={variant}>{status.replace("_", " ")}</Badge>;
}

export function Billing() {
  const { data: activeOrg } = authClient.useActiveOrganization();
  const orgId = activeOrg?.id ?? null;
  const [methods, setMethods] = useState<Method[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [superadmin, setSuperadmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState<string | null>(null);
  const [addingCard, setAddingCard] = useState<
    | { state: "address" }
    | { state: "loading" }
    | { state: "ready"; tracker: string; clientToken: string; environment: string }
    | null
  >(null);
  const [addCardAddress, setAddCardAddress] = useState<BillingAddress>(EMPTY_BILLING_ADDRESS);
  const [addCardCountry, setAddCardCountry] = useState(DEFAULT_COUNTRY_CODE);
  const [addCardPhone, setAddCardPhone] = useState("");
  const [changePlanId, setChangePlanId] = useState("");
  const [changeInterval, setChangeInterval] = useState<"month" | "year">("month");
  const [changeOpen, setChangeOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [invoicePage, setInvoicePage] = useState(1);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    invoice: Invoice & { description: string | null };
    items: Array<{ description: string; amountMinor: number; currency: string }>;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [m, inv, sub, p, mem, me] = await Promise.all([
        fetch(`/api/billing/methods?orgId=${orgId}`).then(
          async (r) => ((await r.json()) as { methods?: Method[] }),
        ),
        fetch(`/api/billing/invoices?orgId=${orgId}`).then(
          async (r) => ((await r.json()) as { invoices?: Invoice[] }),
        ),
        fetch(`/api/billing/subscription?orgId=${orgId}`).then(
          async (r) => ((await r.json()) as { subscription?: Subscription | null }),
        ),
        fetch("/api/plans").then(async (r) => ((await r.json()) as { plans?: Plan[] })),
        fetch(`/api/orgs/${orgId}/membership`).then((r) => (r.ok ? r.json() : null)),
        fetch("/api/me").then((r) => (r.ok ? r.json() : null)),
      ]);
      setMethods(m.methods ?? []);
      setInvoices(inv.invoices ?? []);
      setSubscription(sub.subscription ?? null);
      setPlans(p.plans ?? []);
      setRole((mem as { role?: string } | null)?.role ?? null);
      setSuperadmin(!!(me as { superadmin?: boolean } | null)?.superadmin);
    } catch {
      toast.error("Could not load billing data");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function post(path: string, body: unknown) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { error?: string } & Record<string, unknown>;
    if (!res.ok) throw new Error(data.error ?? "Request failed");
    return data;
  }

  async function pay(invoiceId: string, paymentMethodId?: string) {
    setPaying(invoiceId);
    try {
      await post(`/api/billing/invoices/${invoiceId}/pay`, { orgId, paymentMethodId });
      toast.success("Payment successful");
      await refresh();
      notifyBillingChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setPaying(null);
    }
  }

  async function setPrimary(id: string) {
    try {
      const res = await fetch(`/api/billing/methods/${id}?orgId=${orgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, isDefault: true }),
      });
      const data = (await res.json()) as { error?: string; methods?: Method[] };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setMethods(data.methods ?? []);
      toast.success("Primary card updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  async function remove(id: string) {
    try {
      const res = await fetch(`/api/billing/methods/${id}?orgId=${orgId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success("Card removed");
      setRemoveId(null);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  async function startAddCard() {
    // Open the modal on the billing-address step first — Cybersource rejects
    // payer authentication without street/city/state.
    setAddingCard({ state: "address" });
  }

  async function startAddCardSession(e: React.FormEvent) {
    e.preventDefault();
    const selected = COUNTRIES.find((c) => c.code === addCardCountry);
    const digits = addCardPhone.replace(/\D/g, "");
    if (!selected || digits.length < 7 || digits.length > 15) {
      toast.error("Enter a valid phone number");
      return;
    }
    if (!billingAddressValid(addCardAddress, addCardCountry)) {
      toast.error(
        requiresStateCode(addCardCountry)
          ? "Enter your billing street address, city, and 2-letter state code"
          : "Enter your billing street address, city, and state",
      );
      return;
    }
    setAddingCard({ state: "loading" });
    try {
      const data = (await post("/api/billing/session", {
        orgId,
        purpose: "setup",
        phone: `+${selected.dial}${digits}`,
        country: selected.code,
      })) as {
        tracker: string;
        clientToken: string;
        environment: string;
      };
      setAddingCard({ state: "ready", ...data });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start card setup");
      setAddingCard(null);
    }
  }

  async function confirmAddCard(tracker: string) {
    try {
      await post("/api/billing/methods/confirm", { orgId, tracker });
      setAddingCard(null);
      toast.success("Card saved");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save card");
      setAddingCard(null);
    }
  }

  async function change() {
    if (!changePlanId) return;
    try {
      const data = (await post("/api/billing/subscription/change", {
        orgId,
        planId: changePlanId,
        interval: changeInterval,
      })) as { kind: string; proratedMinor: number };
      toast.success(
        data.kind === "upgrade"
          ? `Upgraded: prorated charge ${formatMoney(data.proratedMinor)}`
          : data.kind === "downgrade"
            ? "Downgrade scheduled for next cycle"
            : "No change",
      );
      await refresh();
      notifyBillingChanged();
      setChangeOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Plan change failed");
    }
  }

  async function cancel() {
    try {
      await post("/api/billing/subscription/cancel", { orgId });
      toast.success("Subscription canceled: access continues until period end");
      setCancelOpen(false);
      await refresh();
      notifyBillingChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cancel failed");
    }
  }

  const isAdmin = role === "admin";
  const canAccessBilling = isAdmin || superadmin;
  const pastDue = subscription?.status === "past_due";
  // A prepaid trial already paid: the plan starts when the trial ends, so the
  // subscribe card must not reappear (it would offer a second charge).
  const prepaidTrial = !!subscription?.trialPrepaid && subscription.status === "trialing";
  const trialDaysLeft =
    subscription?.status === "trialing" && subscription.trialEndsAt
      ? Math.max(0, Math.ceil((subscription.trialEndsAt - Date.now() / 1000) / 86400))
      : null;
  const trialExpired = subscription?.status === "trial_expired";
  const needsSubscribe =
    isAdmin && (!subscription || (subscription.status === "trialing" && !prepaidTrial) || trialExpired);

  const PAGE_SIZE = 10;
  const pageCount = Math.max(1, Math.ceil(invoices.length / PAGE_SIZE));
  const safePage = Math.min(invoicePage, pageCount);
  const pagedInvoices = invoices.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  async function openPreview(invoiceId: string) {
    setPreviewId(invoiceId);
    setPreview(null);
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/billing/invoices/${invoiceId}?orgId=${orgId}`);
      const data = (await res.json()) as {
        error?: string;
        invoice?: Invoice & { description: string | null };
        items?: Array<{ description: string; amountMinor: number; currency: string }>;
      };
      if (!res.ok) throw new Error(data.error ?? "Could not load invoice");
      setPreview({ invoice: data.invoice!, items: data.items ?? [] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load invoice");
      setPreviewId(null);
    } finally {
      setPreviewLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (orgId && !canAccessBilling) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Billing & payments</h1>
          <p className="text-sm text-muted-foreground">Invoices, payment methods, and subscription.</p>
        </div>
        <Alert>
          <AlertDescription>
            Billing & payments is available to workspace admins only. Ask an admin of this
            workspace for access.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Billing & payments</h1>
        <p className="text-sm text-muted-foreground">Invoices, payment methods, and subscription.</p>
      </div>

      {pastDue && (() => {
        const overdue = invoices.find((i) => i.status === "failed" || i.status === "due") ?? null;
        return (
          <Alert variant="destructive">
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              <span>
                Your subscription is past due and suspended. Retry with your primary card or update
                your payment method: your data is retained.
              </span>
              {overdue && (
                <Button size="sm" disabled={paying === overdue.id} onClick={() => pay(overdue.id)}>
                  {paying === overdue.id ? "Processing…" : "Retry with primary card"}
                </Button>
              )}
            </AlertDescription>
          </Alert>
        );
      })()}
      {trialDaysLeft !== null && (
        <Alert>
          <AlertDescription>
            {prepaidTrial ? (
              <>
                Your {plans.find((p) => p.id === subscription?.planId)?.name ?? "paid"} plan starts
                in {trialDaysLeft} day{trialDaysLeft === 1 ? "" : "s"}, when your trial ends on{" "}
                {subscription?.trialEndsAt
                  ? new Date(subscription.trialEndsAt * 1000).toISOString().slice(0, 10)
                  : ""}
                . We have charged you for the first period, which begins on that day.
              </>
            ) : (
              <>
                SNIPE Intelligence™ trial: {trialDaysLeft} day{trialDaysLeft === 1 ? "" : "s"} left. Subscribe below
                to keep uninterrupted access; no card is on file.
              </>
            )}
          </AlertDescription>
        </Alert>
      )}
      {trialExpired && (
        <Alert variant="destructive">
          <AlertDescription>
            Your trial has ended and features are paused. Subscribe below to restore full access.
            Your data is retained.
          </AlertDescription>
        </Alert>
      )}

      {needsSubscribe && orgId && (
        <SubscribeCard orgId={orgId} plans={plans} onDone={refresh} />
      )}

      <div className="grid gap-6 lg:grid-cols-2 lg:items-stretch">
      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
          <CardDescription>Current plan and renewal.</CardDescription>
        </CardHeader>
        <CardContent>
          {subscription ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-medium">
                    {plans.find((p) => p.id === subscription.planId)?.name ?? subscription.planId}
                  </span>{" "}
                  <span className="text-sm text-muted-foreground">
                    ({subscription.interval === "month" ? "monthly" : "yearly"}) ·{" "}
                    {formatWholeMoney(subscription.recurringAmountMinor, subscription.currency)} · next{" "}
                    {new Date(subscription.nextCharge * 1000).toISOString().slice(0, 10)}
                  </span>
                </div>
                {statusBadge(subscription.status)}
              </div>
              {isAdmin && (subscription.status === "active" || subscription.status === "past_due" || prepaidTrial) && (
                <div className="space-y-3 border-t pt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {!prepaidTrial && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setChangePlanId(subscription.planId);
                          setChangeInterval(subscription.interval as "month" | "year");
                          setChangeOpen(true);
                        }}
                      >
                        Upgrade / downgrade
                      </Button>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="destructive" onClick={() => setCancelOpen(true)}>
                          Cancel subscription
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {prepaidTrial
                          ? "Your plan will not start. Access continues until the end of the period you paid for."
                          : "Access continues until the period ends"}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              )}
              {isAdmin && subscription.status === "trialing" && !prepaidTrial && (
                <div className="space-y-3 border-t pt-4">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="destructive" onClick={() => setCancelOpen(true)}>
                        End trial early
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Ends the trial immediately</TooltipContent>
                  </Tooltip>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No subscription on this workspace yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Payment methods</CardTitle>
            <CardDescription>Primary card is charged first; backups follow in order.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={startAddCard}>
            Add card
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
      <Dialog open={addingCard !== null} onOpenChange={(o) => !o && setAddingCard(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add card</DialogTitle>
              <DialogDescription>
                Your card is captured securely and saved for renewals. No charge is made now.
              </DialogDescription>
          </DialogHeader>
          {addingCard?.state === "address" && (
            <form onSubmit={startAddCardSession} className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="addcard-phone">Phone</Label>
                <div className="flex gap-2">
                  <Select value={addCardCountry} onValueChange={setAddCardCountry}>
                    <SelectTrigger className="w-36 shrink-0" aria-label="Country code">
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
                    id="addcard-phone"
                    inputMode="tel"
                    placeholder="3001234567"
                    value={addCardPhone}
                    onChange={(e) => setAddCardPhone(e.target.value.replace(/\D/g, ""))}
                    required
                  />
                </div>
              </div>
              <BillingAddressFields value={addCardAddress} onChange={setAddCardAddress} idPrefix="addcard-billing" countryCode={addCardCountry} />
              <Button type="submit" className="w-full" disabled={!billingAddressValid(addCardAddress) || addCardPhone.replace(/\D/g, "").length < 7}>
                Continue
              </Button>
            </form>
          )}
          {addingCard?.state === "loading" && (
            <div className="flex items-center justify-center gap-3 py-10 text-sm text-muted-foreground" role="status" aria-live="polite">
              <span className="size-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
              Preparing secure checkout…
            </div>
          )}
          {addingCard?.state === "ready" && (
            <SafepayPayment
              tracker={addingCard.tracker}
              clientToken={addingCard.clientToken}
              environment={addingCard.environment}
              mode="setup"
              billingAddress={addCardAddress}
              country={addCardCountry}
              submitLabel="Save card"
              onSuccess={confirmAddCard}
              onError={(m) => {
                toast.error(m);
                setAddingCard(null);
              }}
              onCancel={() => setAddingCard(null)}
            />
          )}
        </DialogContent>
      </Dialog>
          {methods.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium">
                  {m.brand ?? "Card"} •••• {m.last4 ?? "••••"}
                </span>
                {m.expiryMonth && m.expiryYear && (
                  <span className="text-muted-foreground">
                    {m.expiryMonth}/{m.expiryYear}
                  </span>
                )}
                {m.isDefault && <Badge>primary</Badge>}
                {m.status === "failed" && <Badge variant="destructive">failed</Badge>}
              </div>
              <div className="flex gap-2">
                {!m.isDefault && m.status === "active" && (
                  <Button variant="ghost" size="sm" onClick={() => setPrimary(m.id)}>
                    Make primary
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setRemoveId(m.id)}>
                  Remove
                </Button>
              </div>
            </div>
          ))}
          {methods.length === 0 && !addingCard && (
            <p className="text-sm text-muted-foreground">No saved cards yet.</p>
          )}
        </CardContent>
      </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
          <CardDescription>Charges, renewals, and usage.</CardDescription>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          {invoices.length === 0 ? (
            <p className="px-6 text-sm text-muted-foreground">No invoices yet.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedInvoices.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium whitespace-nowrap">{inv.number ?? inv.id.slice(0, 8)}</TableCell>
                        <TableCell className="max-w-48 truncate">{inv.description ?? inv.type}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {formatMoney(inv.amountMinor, inv.currency)}
                        </TableCell>
                        <TableCell>{statusBadge(inv.status)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="sm" onClick={() => openPreview(inv.id)}>
                              View
                            </Button>
                            <Button variant="ghost" size="sm" asChild>
                              <a href={`/api/billing/invoices/${inv.id}/pdf?orgId=${orgId}`}>PDF</a>
                            </Button>
                            {(inv.status === "due" || inv.status === "failed") && (
                              <Button size="sm" disabled={paying === inv.id} onClick={() => pay(inv.id)}>
                                {paying === inv.id ? "Processing…" : inv.status === "failed" ? "Retry" : "Pay"}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {pageCount > 1 && (
                <div className="flex items-center justify-between px-6 py-3 text-sm">
                  <span className="text-muted-foreground">
                    Page {safePage} of {pageCount} · {invoices.length} invoices
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={safePage <= 1}
                      onClick={() => setInvoicePage(safePage - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={safePage >= pageCount}
                      onClick={() => setInvoicePage(safePage + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={previewId !== null} onOpenChange={(o) => !o && (setPreviewId(null), setPreview(null))}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Invoice {preview?.invoice.number ?? ""}</DialogTitle>
            <DialogDescription>HTML preview: use PDF for the downloadable copy.</DialogDescription>
          </DialogHeader>
          {previewLoading || !preview ? (
            <div className="space-y-2 py-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">{preview.invoice.number}</span>
                {statusBadge(preview.invoice.status)}
              </div>
              {preview.invoice.description && (
                <p className="text-muted-foreground">{preview.invoice.description}</p>
              )}
              <div className="divide-y rounded-md border">
                {preview.items.map((line, i) => (
                  <div key={i} className="flex justify-between px-3 py-2">
                    <span>{line.description}</span>
                    <span className={line.amountMinor < 0 ? "text-green-700" : ""}>
                      {formatMoney(line.amountMinor, line.currency)}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between bg-muted/50 px-3 py-2 font-semibold">
                  <span>Total</span>
                  <span>{formatMoney(preview.invoice.amountMinor, preview.invoice.currency)}</span>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel subscription?</DialogTitle>
            <DialogDescription>
              Access continues until the end of the current billing period. This cannot be undone
              from the portal.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              Keep subscription
            </Button>
            <Button variant="destructive" onClick={cancel}>
              Cancel at period end
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={changeOpen} onOpenChange={setChangeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change plan</DialogTitle>
            <DialogDescription>
              Upgrades are prorated and charged immediately. Downgrades start at your next billing
              cycle.
            </DialogDescription>
          </DialogHeader>
          {subscription && (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label>Plan</Label>
                <Select value={changePlanId} onValueChange={setChangePlanId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose a plan…" />
                  </SelectTrigger>
                  <SelectContent>
                    {selfServePlans(plans).map((p) => {
                      const isCurrent =
                        subscription.planId === p.id && subscription.interval === changeInterval;
                      return (
                        <SelectItem key={p.id} value={p.id} disabled={isCurrent}>
                          {p.name}
                          {isCurrent ? " (current)" : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Billing</Label>
                <Select
                  value={changeInterval}
                  onValueChange={(v) => setChangeInterval(v as "month" | "year")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="month">Monthly</SelectItem>
                    <SelectItem value="year">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(() => {
                const target = plans.find((p) => p.id === changePlanId);
                if (!target) return null;
                const targetPrice = changeInterval === "month" ? target.monthlyMinor : target.annualMinor;
                const currentPrice = subscription.recurringAmountMinor;
                const kind =
                  targetPrice > currentPrice
                    ? "upgrade"
                    : targetPrice < currentPrice
                      ? "downgrade"
                      : "same price";
                return (
                  <p className="text-sm text-muted-foreground">
                    {target.name} ({changeInterval === "month" ? "monthly" : "yearly"}):{" "}
                    {formatWholeMoney(targetPrice, target.currency)}
                    {changeInterval === "year" && hasAnnualDeal(target) && (
                      <span className="font-semibold text-primary">, get 2 months free!</span>
                    )}
                    {kind === "upgrade" && ". Charged immediately, prorated for the remaining cycle."}
                    {kind === "downgrade" && ". Takes effect from the next billing cycle."}
                    {kind === "same price" && ". No change."}
                  </p>
                );
              })()}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setChangeOpen(false)}>
                  Keep current plan
                </Button>
                <Button onClick={change} disabled={!changePlanId}>
                  Apply change
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={removeId !== null} onOpenChange={(o) => !o && setRemoveId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this card?</DialogTitle>
            <DialogDescription>
              The primary card cannot be removed: promote another card first. At least one valid
              card must remain.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRemoveId(null)}>
              Keep
            </Button>
            <Button variant="destructive" onClick={() => removeId && remove(removeId)}>
              Remove
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface SubscribePlan {
  id: string;
  name: string;
  monthlyMinor: number;
  annualMinor: number;
  currency: string;
  maxUsers: number | null;
  allowBriefings: number | null;
  contactOnly?: number;
  features: string | null;
}

/** Card-brand marks supplied by the owner (Visa, Mastercard, Amex, Discover). */
function CardBrandIcons() {
  return (
    <div className="flex items-center gap-2" role="img" aria-label="Accepted cards: Visa, Mastercard, Amex, Discover">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 29 22" className="h-6 w-auto" aria-hidden><g fill="none" fillRule="evenodd"><path fill="#F6F9FC" d="M26.58 21H2.42A2.4 2.4 0 0 1 0 18.62V4.38A2.4 2.4 0 0 1 2.42 2h24.16A2.4 2.4 0 0 1 29 4.38v14.25A2.4 2.4 0 0 1 26.58 21z"></path><path fill="#F99F1B" d="M0 18v.63A2.4 2.4 0 0 0 2.42 21h24.16A2.4 2.4 0 0 0 29 18.62V18H0z"></path><path fill="#2D4990" d="M0 5v-.63A2.4 2.4 0 0 1 2.42 2h24.16A2.4 2.4 0 0 1 29 4.38V5H0zm13.9 3.12l-1.48 6.77h-1.77l1.46-6.77h1.78zm7.47 4.38l.94-2.55.54 2.55h-1.48zm1.99 2.4H25l-1.44-6.78h-1.51a.8.8 0 0 0-.76.5l-2.67 6.27h1.87l.37-1h2.28l.22 1zm-4.64-2.22c0-1.78-2.51-1.88-2.5-2.68.01-.24.25-.5.76-.57a3.4 3.4 0 0 1 1.75.3l.31-1.43c-.42-.15-.97-.3-1.66-.3-1.76 0-3 .92-3 2.24-.01.97.88 1.52 1.55 1.84.7.33.93.55.93.84-.01.46-.56.66-1.07.66-.9.02-1.41-.23-1.82-.42l-.33 1.48c.42.19 1.19.35 1.98.36 1.87 0 3.09-.9 3.1-2.32zm-7.37-4.56L8.47 14.9H6.6L5.18 9.5c-.09-.33-.17-.45-.43-.6A7.53 7.53 0 0 0 3 8.33l.04-.2h3.03c.38 0 .73.26.82.7l.75 3.91 1.85-4.6h1.86z"></path></g></svg>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 29 19" className="h-6 w-auto" aria-hidden><g fill="none" fillRule="evenodd"><path fill="#003663" d="M26.58 19H2.42A2.4 2.4 0 0 1 0 16.62V2.38A2.4 2.4 0 0 1 2.42 0h24.16A2.4 2.4 0 0 1 29 2.38v14.25A2.4 2.4 0 0 1 26.58 19z"></path><circle cx="10.5" cy="9.5" r="6.5" fill="#EB1C26"></circle><circle cx="18.5" cy="9.5" r="6.5" fill="#F99F1B"></circle><path fill="#EF5D20" d="M14.5 4.38a6.49 6.49 0 0 0 0 10.24 6.49 6.49 0 0 0 0-10.24z"></path></g></svg>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 29 23" className="h-6 w-auto" aria-hidden><g fill="none" fillRule="evenodd"><path fill="#1D91CE" d="M26.58 21H2.42A2.4 2.4 0 0 1 0 18.62V4.38A2.4 2.4 0 0 1 29 4.38v14.25A2.4 2.4 0 0 1 26.58 21z"></path><path fill="#FFF" d="M4.063 13.896L3.591 15H-.64l3.339-7h7.975l.805 1.546L12.231 8H22.983l.919.961.987-.961h4.993l-3.545 3.492L29.729 15h-4.832l-1.081-1.031L22.744 15H5.496l-.519-1.104"></path><path fill="#1D91CE" d="M4.98 13.97h-.92.92zM15.2 9h-2.1l-1.58 3.35L9.82 9h-2.1v4.85L5.55 9H3.58l-2.32 5h1.42l.47-1.14h2.7L6.39 14H9V9.93L10.85 14h1.22l1.84-4v4h1.29V9zm8.67 1.62L22.37 9h-6.02v5h5.82l1.65-1.64L25.48 14h1.55l-2.37-2.53L27.1 9h-1.62l-1.61 1.62zM20.7 13h-3.06v-1.1h3.06v-1h-3.06V10h3.06v-.85l2.27 2.27-2.27 2.28V13zM4.53 9.82l.88 2.03H3.58l.95-2.03z"></path></g></svg>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 29 23" className="h-6 w-auto" aria-hidden><g fill="none" fillRule="evenodd"><path fill="#EBF1F8" d="M26.58 21H2.42A2.4 2.4 0 0 1 0 18.62V4.38A2.4 2.4 0 0 1 29 4.38v14.25A2.4 2.4 0 0 1 26.58 21z"></path><path fill="#F27712" d="M15.24 21h11.34A2.4 2.4 0 0 0 29 18.62v-2.85A46.81 46.81 0 0 1 15.24 21z"></path><path fill="#000" d="M28 12.9h-1.03l-1.16-1.53h-.11v1.53h-.84V9.1h1.24c.97 0 1.53.4 1.53 1.12 0 .59-.35.97-.98 1.09L28 12.9zm-1.24-2.65c0-.37-.28-.56-.8-.56h-.26v1.15h.24c.54 0 .82-.2.82-.59zM21.92 9.1h2.38v.64h-1.54v.85h1.48v.65h-1.48v1.03h1.54v.64h-2.38V9.1zm-2.7 3.9L17.4 9.09h.92l1.15 2.56 1.16-2.56h.9L19.69 13h-.45zm-7.61-.01c-1.28 0-2.28-.87-2.28-2 0-1.1 1.02-1.99 2.3-1.99.36 0 .66.07 1.03.23v.88a1.5 1.5 0 0 0-1.05-.43c-.8 0-1.41.58-1.41 1.31 0 .77.6 1.32 1.45 1.32.38 0 .67-.12 1.01-.42v.88c-.38.16-.7.22-1.05.22zm-2.54-1.25c0 .74-.61 1.25-1.49 1.25-.64 0-1.1-.22-1.49-.72l.55-.47c.19.34.51.51.91.51.38 0 .65-.23.65-.53 0-.17-.08-.3-.25-.4a3.48 3.48 0 0 0-.58-.22c-.79-.25-1.06-.52-1.06-1.05 0-.62.58-1.09 1.34-1.09.48 0 .91.15 1.27.43l-.44.5a.92.92 0 0 0-.68-.3c-.36 0-.62.18-.62.42 0 .2.15.31.65.48.96.3 1.24.58 1.24 1.2zM4.94 9.1h.84v3.81h-.84V9.1zm-2.7 3.81H1V9.1h1.24c1.36 0 2.3.78 2.3 1.9 0 .57-.28 1.11-.77 1.47-.42.3-.89.44-1.54.44zm.98-2.86c-.28-.22-.6-.3-1.15-.3h-.23v2.52h.23c.54 0 .88-.1 1.15-.3.29-.24.46-.6.46-.97s-.17-.72-.46-.95z"></path><path fill="#F27712" d="M15 9c-1.1 0-2 .88-2 1.97 0 1.16.86 2.03 2 2.03 1.12 0 2-.88 2-2s-.87-2-2-2z"></path></g></svg>
    </div>
  );
}

/** Yearly billing at ~10x monthly means ~2 months free vs paying monthly. */
function hasAnnualDeal(plan: { monthlyMinor: number; annualMinor: number }): boolean {
  return plan.monthlyMinor > 0 && plan.annualMinor > 0 && plan.annualMinor <= 10 * plan.monthlyMinor;
}

/** Subscribe now: pick plan + interval, optional coupon, card, pay first period. */
function SubscribeCard({ orgId, plans, onDone }: { orgId: string; plans: SubscribePlan[]; onDone: () => void }) {
  const [planId, setPlanId] = useState("");
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [coupon, setCoupon] = useState("");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY_CODE);
  const [billingAddress, setBillingAddress] = useState<BillingAddress>(EMPTY_BILLING_ADDRESS);
  const [agreed, setAgreed] = useState(false);
  const [session, setSession] = useState<{ tracker: string; clientToken: string; environment: string; amountMinor: number } | null>(null);
  const [pending, setPending] = useState(false);
  const plan = plans.find((p) => p.id === planId) ?? null;
  const price = plan ? (interval === "month" ? plan.monthlyMinor : plan.annualMinor) : 0;

  async function start(e: React.FormEvent) {
    e.preventDefault();
    if (!plan) return;
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
      const data = (await res.json()) as { tracker?: string; clientToken?: string; environment?: string; amountMinor?: number; error?: string };
      if (!res.ok || !data.tracker || !data.clientToken) throw new Error(data.error ?? "Could not start payment");
      setSession({ tracker: data.tracker, clientToken: data.clientToken, environment: data.environment ?? "sandbox", amountMinor: data.amountMinor ?? 0 });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start payment");
    } finally {
      setPending(false);
    }
  }

  async function confirm(tracker: string) {
    if (!plan) return;
    try {
      const res = await fetch("/api/billing/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, planId: plan.id, interval, couponCode: coupon || undefined, tracker }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Subscription failed");
      toast.success("Subscription active: welcome aboard!");
      setSession(null);
      onDone();
      notifyBillingChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Subscription failed");
      setSession(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Subscribe</CardTitle>
        <CardDescription>Pick a plan and pay the first period: access restores immediately.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Tabs value={interval} onValueChange={(v) => setInterval(v as "month" | "year")}>
          <TabsList className="grid w-full max-w-xs grid-cols-2">
            <TabsTrigger value="month">Monthly</TabsTrigger>
            <TabsTrigger value="year">Yearly</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <div className="grid gap-3 sm:grid-cols-2">
              {selfServePlans(plans).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPlanId(p.id)}
                  className={`flex flex-col items-start rounded-lg border p-4 text-left transition-colors hover:border-primary ${planId === p.id ? "border-primary ring-1 ring-primary" : ""}`}
                >
                  <div className="font-semibold">{p.name}</div>
                  <div className="mt-1 text-2xl font-bold">
                    {formatWholeMoney(interval === "month" ? p.monthlyMinor : p.annualMinor, p.currency)}
                    <span className="text-sm font-normal text-muted-foreground">/{interval === "month" ? "mo" : "yr"}</span>
                  </div>
                  {interval === "year" && hasAnnualDeal(p) && (
                    <div className="mt-1 text-xs font-semibold text-primary">Get 2 months free!</div>
                  )}
                  <ul className="mt-3 space-y-1.5 text-sm">
                    {parsePlanFeatures(p.features).map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                        {f}
                      </li>
                    ))}
                  </ul>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="sub-coupon">Discount code (optional)</Label>
              <Input id="sub-coupon" placeholder="SAVE20" value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} />
            </div>
            {session ? (
              <div className="space-y-3">
                <CardBrandIcons />
                <SafepayPayment
                  tracker={session.tracker}
                  clientToken={session.clientToken}
                  environment={session.environment}
                  mode="payment"
                  billingAddress={billingAddress}
                  country={countryCode}
                  submitLabel={`Pay ${formatMoney(session.amountMinor, plan?.currency ?? "USD")}`}
                  onSuccess={confirm}
                  onError={(m) => toast.error(m)}
                  onCancel={() => setSession(null)}
                />
                <p className="flex items-center justify-center gap-1.5 text-xs font-medium text-green-700 dark:text-green-400">
                  <LockClosedIcon className="size-3.5" aria-hidden />
                  All payments are secured by 256-bit encryption
                </p>
              </div>
            ) : (
              <form onSubmit={start} className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="sub-phone">Phone</Label>
                  <div className="flex gap-2">
                    <Select value={countryCode} onValueChange={setCountryCode}>
                      <SelectTrigger className="w-36 shrink-0" aria-label="Country code">
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
                    <Input id="sub-phone" inputMode="tel" placeholder="3001234567" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} required />
                  </div>
                </div>
                <BillingAddressFields value={billingAddress} onChange={setBillingAddress} idPrefix="sub-billing" countryCode={countryCode} />
                <label className="flex cursor-pointer items-start gap-2 text-xs/relaxed text-muted-foreground">
                  <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} aria-label="Agree to Terms of Service and Privacy Policy" />
                  <span>
                    I agree to the <a className="underline" href="/terms" target="_blank" rel="noreferrer">Terms of Service</a>{" "}
                    and <a className="underline" href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>, and
                    authorize auto-charging of my payment method for the recurring subscription fee.
                  </span>
                </label>
                <div className="flex justify-between text-sm font-semibold">
                  <span>Due today</span>
                  <span>{plan ? formatMoney(price, plan.currency) : "-"}</span>
                </div>
                <Button type="submit" className="w-full" disabled={pending || !plan || !agreed || !billingAddressValid(billingAddress, countryCode)}>
                  {pending ? "Starting payment…" : "Continue to payment"}
                </Button>
              </form>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
