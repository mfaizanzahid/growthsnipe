import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowPathIcon, ArrowUturnLeftIcon, EyeIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { DataTable, RowAction, type DataColumn } from "../components/DataTable";
import { formatMoney } from "../lib/money";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Skeleton } from "../components/ui/skeleton";
import { api } from "../components/billing/shared";
import {
  ChangePlanDialog,
  ChargeDialog,
  ConfirmDialog,
  InvoicePreviewDialog,
  RefundDialog,
  RetryDialog,
  statusBadge,
  type PlanOption,
  type PreviewInvoice,
  type PreviewLine,
} from "../components/billing/dialogs";

interface Detail {
  org: { id: string; name: string; slug: string | null };
  members: Array<{ id: string; userId: string; email: string; role: string; status: string }>;
  subscription: {
    id: string;
    planId: string;
    interval: string;
    status: string;
    nextCharge: number;
    recurringAmountMinor: number;
    currency: string;
  } | null;
  plan: { name: string } | null;
  invoices: PreviewInvoice[];
  methods: Array<{
    id: string;
    brand: string | null;
    last4: string | null;
    expiryMonth: number | null;
    expiryYear: number | null;
    isDefault: boolean;
    status: string;
  }>;
}

export function ClientProfile() {
  const { orgId } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [preview, setPreview] = useState<{ invoice: PreviewInvoice; items: PreviewLine[] } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [retryInv, setRetryInv] = useState<PreviewInvoice | null>(null);
  const [refundInv, setRefundInv] = useState<PreviewInvoice | null>(null);
  const [changeOpen, setChangeOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [chargeOpen, setChargeOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");

  const refresh = useCallback(async () => {
    if (!orgId) return;
    try {
      const [d, p] = await Promise.all([
        api(`/api/superadmin/clients/${orgId}`),
        api("/api/superadmin/plans"),
      ]);
      setDetail(d as unknown as Detail);
      setPlans(((p.plans ?? []) as PlanOption[]).filter((pl) => (pl as { active?: number }).active !== 0));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function openPreview(inv: PreviewInvoice) {
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/billing/invoices/${inv.id}?orgId=${orgId}`);
      const data = (await res.json()) as {
        error?: string;
        items?: PreviewLine[];
      };
      if (!res.ok) throw new Error(data.error ?? "Could not load invoice");
      setPreview({ invoice: inv, items: data.items ?? [] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load invoice");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function doRetry(invoiceId: string, methodId?: string) {
    setBusy(true);
    try {
      await api(`/api/billing/invoices/${invoiceId}/pay`, {
        method: "POST",
        body: JSON.stringify({ orgId, paymentMethodId: methodId }),
      });
      toast.success("Payment collected");
      setRetryInv(null);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setBusy(false);
    }
  }

  async function doRefund(invoiceId: string, amountMinor?: number) {
    setBusy(true);
    try {
      await api("/api/superadmin/refunds", {
        method: "POST",
        body: JSON.stringify({ invoiceId, amountMinor }),
      });
      toast.success("Refund issued");
      setRefundInv(null);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Refund failed");
    } finally {
      setBusy(false);
    }
  }

  async function doCharge(amountMinor: number, description: string) {
    setBusy(true);
    try {
      await api("/api/superadmin/usage-charges", {
        method: "POST",
        body: JSON.stringify({ orgId, amountMinor, description }),
      });
      toast.success("Charge created and collected");
      setChargeOpen(false);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Charge failed");
    } finally {
      setBusy(false);
    }
  }

  async function doChange(planId: string, interval: "month" | "year") {
    setBusy(true);
    try {
      const r = (await api("/api/billing/subscription/change", {
        method: "POST",
        body: JSON.stringify({ orgId, planId, interval }),
      })) as { kind: string; proratedMinor: number };
      toast.success(
        r.kind === "upgrade"
          ? `Upgraded — prorated ${formatMoney(r.proratedMinor)}`
          : r.kind === "downgrade"
            ? "Downgrade takes effect next cycle"
            : "No change",
      );
      setChangeOpen(false);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Plan change failed");
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    setBusy(true);
    try {
      await api(`/api/superadmin/clients/${orgId}`, { method: "DELETE" });
      toast.success("Client deleted");
      navigate("/superadmin/clients");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
      setBusy(false);
    }
  }

  async function doCancel() {
    setBusy(true);
    try {
      await api("/api/billing/subscription/cancel", {
        method: "POST",
        body: JSON.stringify({ orgId }),
      });
      toast.success("Subscription canceled at period end");
      setCancelOpen(false);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setBusy(false);
    }
  }

  async function doInvite() {
    setBusy(true);
    try {
      await api(`/api/superadmin/clients/${orgId}/members/invite`, {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      toast.success("Invitation sent");
      setInviteEmail("");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setBusy(false);
    }
  }

  async function doRole(memberId: string, role: string) {
    setBusy(true);
    try {
      await api(`/api/superadmin/clients/${orgId}/members/${memberId}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      toast.success("Role updated");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Role update failed");
    } finally {
      setBusy(false);
    }
  }

  async function doRemove(memberId: string, email: string) {
    if (!window.confirm(`Remove ${email} from this workspace?`)) return;
    setBusy(true);
    try {
      await api(`/api/superadmin/clients/${orgId}/members/${memberId}`, { method: "DELETE" });
      toast.success("Member removed");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setBusy(false);
    }
  }

  async function doToggleStatus(memberId: string, status: "active" | "suspended") {
    setBusy(true);
    try {
      await api(`/api/superadmin/clients/${orgId}/members/${memberId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      toast.success(status === "suspended" ? "Member suspended" : "Member reactivated");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Status change failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !detail) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const sub = detail.subscription;
  const pastDue = sub?.status === "past_due";

  const invoiceColumns: DataColumn<PreviewInvoice>[] = [
    {
      key: "number",
      header: "Invoice",
      sortable: true,
      render: (r) => <span className="font-medium whitespace-nowrap">{r.number ?? r.id.slice(0, 8)}</span>,
      sortValue: (r) => r.number ?? r.id,
      searchValue: (r) => `${r.number ?? ""} ${r.description ?? ""}`,
    },
    {
      key: "amount",
      header: "Amount",
      sortable: true,
      render: (r) => <span className="whitespace-nowrap">{formatMoney(r.amountMinor, r.currency)}</span>,
      sortValue: (r) => r.amountMinor,
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (r) => statusBadge(r.status),
      sortValue: (r) => r.status,
      searchValue: (r) => r.status,
    },
    {
      key: "actions",
      header: "Actions",
      render: (r) => (
        <div className="flex justify-start gap-0.5">
          <RowAction label="View invoice" onClick={() => openPreview(r)}>
            <EyeIcon className="size-4" />
          </RowAction>
          {(r.status === "due" || r.status === "failed") && (
            <RowAction label="Retry payment" onClick={() => setRetryInv(r)}>
              <ArrowPathIcon className="size-4" />
            </RowAction>
          )}
          {r.status === "paid" && (
            <RowAction label="Refund" onClick={() => setRefundInv(r)}>
              <ArrowUturnLeftIcon className="size-4" />
            </RowAction>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link to="/superadmin/clients" className="text-sm text-muted-foreground underline">
          ← All clients
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{detail.org.name}</h1>
        <p className="text-sm text-muted-foreground">
          {detail.members.length} member{detail.members.length === 1 ? "" : "s"}
        </p>
      </div>

      {pastDue && (
        <Alert variant="destructive">
          <AlertDescription>This subscription is past due and suspended.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
        </CardHeader>
        <CardContent>
          {sub ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  <span className="font-medium">{detail.plan?.name ?? sub.planId}</span>{" "}
                  <span className="text-muted-foreground">
                    ({sub.interval === "month" ? "monthly" : "yearly"}) ·{" "}
                    {formatMoney(sub.recurringAmountMinor, sub.currency)} · next{" "}
                    {new Date(sub.nextCharge * 1000).toISOString().slice(0, 10)}
                  </span>
                </span>
                {statusBadge(sub.status)}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setChangeOpen(true)}>
                  Upgrade / downgrade
                </Button>
                <Button variant="outline" size="sm" onClick={() => setChargeOpen(true)}>
                  Add charge
                </Button>
                {sub.status !== "canceled" && (
                  <Button variant="destructive" size="sm" onClick={() => setCancelOpen(true)}>
                    Cancel subscription
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">No subscription on this workspace.</p>
              <Button variant="outline" size="sm" onClick={() => setChargeOpen(true)}>
                Add charge
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment methods</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {detail.methods.length === 0 && (
            <p className="text-sm text-muted-foreground">No saved cards.</p>
          )}
          {detail.methods.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
              <span className="font-medium">
                {m.brand ?? "Card"} •••• {m.last4 ?? "••••"}
              </span>
              <span className="flex gap-2">
                {m.isDefault && <Badge>primary</Badge>}
                {m.status === "failed" && <Badge variant="destructive">failed</Badge>}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {detail.members.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
              <div>
                <div className="font-medium">{m.email}</div>
                <div className="mt-1 flex gap-1">
                  <Badge>{m.role}</Badge>
                  {m.status === "active" ? (
                    <Badge variant="success">active</Badge>
                  ) : (
                    <Badge variant="destructive">suspended</Badge>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={m.role} onValueChange={(v) => void doRole(m.id, v)}>
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">admin</SelectItem>
                    <SelectItem value="user">user</SelectItem>
                    <SelectItem value="viewer">viewer</SelectItem>
                  </SelectContent>
                </Select>
                {m.status === "active" ? (
                  <Button variant="ghost" size="sm" onClick={() => void doToggleStatus(m.id, "suspended")}>
                    Suspend
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => void doToggleStatus(m.id, "active")}>
                    Reactivate
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => void doRemove(m.id, m.email)}>
                  Remove
                </Button>
              </div>
            </div>
          ))}
          <div className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row">
            <Input
              placeholder="Email"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
            <Select value={inviteRole} onValueChange={setInviteRole}>
              <SelectTrigger className="w-full sm:w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">admin</SelectItem>
                <SelectItem value="user">user</SelectItem>
                <SelectItem value="viewer">viewer</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => void doInvite()} disabled={busy || !inviteEmail.trim()}>
              Invite
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            rows={detail.invoices}
            columns={invoiceColumns}
            rowId={(r) => r.id}
            searchPlaceholder="Search invoices…"
            empty="No invoices."
          />
        </CardContent>
      </Card>

      <InvoicePreviewDialog
        open={preview !== null || previewLoading}
        onClose={() => {
          setPreview(null);
        }}
        invoice={preview?.invoice ?? null}
        items={preview?.items ?? null}
        loading={previewLoading}
      />

      {retryInv && (
        <RetryDialog
          open
          onClose={() => setRetryInv(null)}
          invoiceLabel={retryInv.number ?? retryInv.id}
          methods={detail.methods.map((m) => ({
            id: m.id,
            brand: m.brand,
            last4: m.last4,
            isDefault: m.isDefault,
            status: m.status,
          }))}
          busy={busy}
          onSubmit={(methodId) => void doRetry(retryInv.id, methodId)}
        />
      )}

      {refundInv && (
        <RefundDialog
          open
          onClose={() => setRefundInv(null)}
          invoiceLabel={refundInv.number ?? refundInv.id}
          maxMinor={refundInv.amountMinor}
          currency={refundInv.currency}
          busy={busy}
          onSubmit={(amountMinor) => void doRefund(refundInv.id, amountMinor)}
        />
      )}

      {sub && (
        <ChangePlanDialog
          open={changeOpen}
          onClose={() => setChangeOpen(false)}
          plans={plans.map((p) => ({
            id: String(p.id),
            name: String(p.name),
            monthlyMinor: Number(p.monthlyMinor),
            annualMinor: Number(p.annualMinor),
            currency: String(p.currency ?? "USD"),
          }))}
          currentPlanId={sub.planId}
          currentInterval={sub.interval}
          currentPrice={sub.recurringAmountMinor}
          busy={busy}
          onSubmit={(planId, interval) => void doChange(planId, interval)}
        />
      )}

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel this subscription?"
        description={`${detail.org.name} keeps access until the end of the current period.`}
        confirmLabel="Cancel subscription"
        destructive
        busy={busy}
        onConfirm={() => void doCancel()}
      />

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive">Danger zone</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {sub
              ? "Cancel the subscription first — a client with an active subscription cannot be deleted."
              : "Permanently delete this workspace and all its data (members, invoices, payment methods, history). This cannot be undone."}
          </p>
          <Button variant="destructive" size="sm" disabled={sub !== null || busy} onClick={() => setDeleteOpen(true)}>
            Delete Client
          </Button>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={`Delete ${detail.org.name}?`}
        description="The workspace and all its data will be permanently removed. This cannot be undone."
        confirmLabel="Delete client"
        destructive
        busy={busy}
        onConfirm={() => void doDelete()}
      />

      {detail && (
        <ChargeDialog
          open={chargeOpen}
          onClose={() => setChargeOpen(false)}
          orgName={detail.org.name}
          busy={busy}
          onSubmit={(amountMinor, description) => void doCharge(amountMinor, description)}
        />
      )}
    </div>
  );
}
