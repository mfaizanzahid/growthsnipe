import { useEffect, useState } from "react";
import {
  ArrowPathIcon,
  ArrowUturnLeftIcon,
  DocumentDuplicateIcon,
  EyeIcon,
} from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { DataTable, RowAction, type DataColumn } from "../../components/DataTable";
import { formatMoney } from "../../lib/money";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { api, runBulk, toastBulk } from "../../components/billing/shared";
import {
  BulkRefundDialog,
  ChargeDialog,
  InvoicePreviewDialog,
  RefundDialog,
  RetryDialog,
  statusBadge,
  type PreviewLine,
  type RetryMethod,
} from "../../components/billing/dialogs";
import { AdminDenied, AdminLoading, useAdminGuard } from "./guard";
import type { AdminClient, AdminInvoice } from "./types";

export function AdminInvoices() {
  const allowed = useAdminGuard();
  const [invoices, setInvoices] = useState<AdminInvoice[]>([]);
  const [clients, setClients] = useState<AdminClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  const [preview, setPreview] = useState<{ invoice: AdminInvoice; items: PreviewLine[] } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [retryState, setRetryState] = useState<{ invoice: AdminInvoice; methods: RetryMethod[] } | null>(null);
  const [refundInv, setRefundInv] = useState<AdminInvoice | null>(null);
  const [bulkRefundInvs, setBulkRefundInvs] = useState<AdminInvoice[] | null>(null);
  const [createState, setCreateState] = useState({ orgId: "", amount: "", description: "" });

  async function load() {
    try {
      const [inv, c] = await Promise.all([
        api("/api/superadmin/invoices"),
        api("/api/superadmin/clients"),
      ]);
      setInvoices(((inv as { invoices?: AdminInvoice[] }).invoices ?? []) as AdminInvoice[]);
      setClients(((c as { clients?: AdminClient[] }).clients ?? []) as AdminClient[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load invoices");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (allowed) void load();
  }, [allowed]);

  async function openPreview(inv: AdminInvoice) {
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/billing/invoices/${inv.id}?orgId=${inv.orgId}`);
      const data = (await res.json()) as { error?: string; items?: PreviewLine[] };
      if (!res.ok) throw new Error(data.error ?? "Could not load invoice");
      setPreview({ invoice: inv, items: data.items ?? [] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load invoice");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function openRetry(inv: AdminInvoice) {
    try {
      const d = (await api(`/api/superadmin/clients/${inv.orgId}`)) as { methods: RetryMethod[] };
      setRetryState({ invoice: inv, methods: d.methods ?? [] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load methods");
    }
  }

  async function doRetry(invoiceId: string, orgId: string, methodId?: string) {
    setBusy(true);
    try {
      await api(`/api/billing/invoices/${invoiceId}/pay`, {
        method: "POST",
        body: JSON.stringify({ orgId, paymentMethodId: methodId }),
      });
      toast.success("Payment collected");
      setRetryState(null);
      await load();
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
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Refund failed");
    } finally {
      setBusy(false);
    }
  }

  async function doBulkRetry(invs: AdminInvoice[]) {
    setBusy(true);
    const failed = invs.filter((i) => i.status === "failed" || i.status === "due");
    const result = await runBulk(
      failed,
      (i) => i.number ?? i.id,
      (i) =>
        api(`/api/billing/invoices/${i.id}/pay`, {
          method: "POST",
          body: JSON.stringify({ orgId: i.orgId }),
        }).then(() => undefined),
    );
    toastBulk("Bulk retry", result);
    setBusy(false);
    await load();
  }

  if (allowed === null || (allowed && loading)) return <AdminLoading />;
  if (allowed === false) return <AdminDenied />;

  const columns: DataColumn<AdminInvoice>[] = [
    {
      key: "number",
      header: "Invoice",
      sortable: true,
      render: (r) => <span className="font-medium whitespace-nowrap">{r.number ?? r.id.slice(0, 8)}</span>,
      sortValue: (r) => r.number ?? r.id,
      searchValue: (r) => `${r.number ?? ""} ${r.description ?? ""}`,
    },
    {
      key: "org",
      header: "Workspace",
      sortable: true,
      render: (r) => r.orgName ?? "—",
      sortValue: (r) => (r.orgName ?? "").toLowerCase(),
      searchValue: (r) => r.orgName ?? "",
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
          <RowAction
            label="Duplicate as new invoice"
            onClick={() => {
              setCreateState({
                orgId: r.orgId,
                amount: (r.amountMinor / 100).toFixed(2),
                description: r.description ?? "",
              });
            }}
          >
            <DocumentDuplicateIcon className="size-4" />
          </RowAction>
          {(r.status === "due" || r.status === "failed") && (
            <RowAction label="Retry payment" onClick={() => openRetry(r)}>
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

  const selectedRows = invoices.filter((i) => selected.includes(i.id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Invoices</h1>
        <p className="text-sm text-muted-foreground">Every invoice across all tenants.</p>
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Invoices</CardTitle>
            <CardDescription>Every invoice across all tenants.</CardDescription>
          </div>
          <Button
            size="sm"
            onClick={() => setCreateState({ orgId: clients[0]?.orgId ?? "", amount: "", description: "" })}
          >
            Create invoice
          </Button>
        </CardHeader>
        <CardContent>
          <DataTable
            rows={invoices}
            columns={columns}
            rowId={(r) => r.id}
            selectable
            selected={selected}
            onSelect={setSelected}
            searchPlaceholder="Search number, workspace, status…"
            empty="No invoices yet."
            bulkBar={(ids) => (
              <div className="flex flex-wrap gap-2 rounded-md border bg-muted/40 p-2">
                <Button variant="outline" size="sm" onClick={() => doBulkRetry(selectedRows.filter((i) => ids.includes(i.id)))} disabled={busy}>
                  Retry failed ({ids.length})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setBulkRefundInvs(selectedRows.filter((i) => ids.includes(i.id) && i.status === "paid"))}
                >
                  Refund ({ids.length})
                </Button>
              </div>
            )}
          />
        </CardContent>
      </Card>

      <InvoicePreviewDialog
        open={preview !== null || previewLoading}
        onClose={() => setPreview(null)}
        invoice={preview?.invoice ?? null}
        items={preview?.items ?? null}
        loading={previewLoading}
      />

      {retryState && (
        <RetryDialog
          open
          onClose={() => setRetryState(null)}
          invoiceLabel={retryState.invoice.number ?? retryState.invoice.id}
          methods={retryState.methods}
          busy={busy}
          onSubmit={(methodId) => void doRetry(retryState.invoice.id, retryState.invoice.orgId, methodId)}
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

      <ChargeDialog
        open={createState.orgId !== ""}
        onClose={() => setCreateState({ orgId: "", amount: "", description: "" })}
        orgName="New invoice"
        busy={busy}
        initial={{ amount: createState.amount, description: createState.description }}
        orgPicker={{
          orgs: clients.map((c) => ({ id: c.orgId, name: c.name })),
          value: createState.orgId,
          onChange: (id) => setCreateState({ ...createState, orgId: id }),
        }}
        onSubmit={(amountMinor, description) => {
          const orgId = createState.orgId;
          if (!orgId) return;
          setBusy(true);
          api("/api/superadmin/usage-charges", {
            method: "POST",
            body: JSON.stringify({ orgId, amountMinor, description }),
          })
            .then(() => {
              toast.success("Invoice created and collected");
              setCreateState({ orgId: "", amount: "", description: "" });
              return load();
            })
            .catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Failed"))
            .finally(() => setBusy(false));
        }}
      />

      {bulkRefundInvs && (
        <BulkRefundDialog
          open
          onClose={() => setBulkRefundInvs(null)}
          count={bulkRefundInvs.length}
          busy={busy}
          onSubmit={(amountMinor) => {
            const invs = bulkRefundInvs;
            setBusy(true);
            runBulk(
              invs.filter((i) => i.status === "paid"),
              (i) => i.number ?? i.id,
              (i) =>
                api("/api/superadmin/refunds", {
                  method: "POST",
                  body: JSON.stringify({ invoiceId: i.id, amountMinor }),
                }).then(() => undefined),
            )
              .then((result) => {
                toastBulk("Bulk refund", result);
                setBulkRefundInvs(null);
                return load();
              })
              .catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Failed"))
              .finally(() => setBusy(false));
          }}
        />
      )}
    </div>
  );
}
