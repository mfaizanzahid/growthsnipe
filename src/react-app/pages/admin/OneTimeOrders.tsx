import { useEffect, useState } from "react";
import { ArrowDownTrayIcon, PaperAirplaneIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { DataTable, RowAction, type DataColumn } from "../../components/DataTable";
import { api } from "../../components/billing/shared";
import { formatMoney } from "../../lib/money";
import { AdminDenied, AdminLoading, useAdminGuard } from "./guard";

interface AdminOneTimeInvoice {
  id: string;
  number: string;
  status: string;
  amountMinor: number;
  currency: string;
  paidAt: number | null;
  emailSentAt: number | null;
  emailResendCount: number;
}

interface AdminOneTimeOrder {
  id: string;
  email: string;
  name: string | null;
  businessName: string | null;
  productName: string | null;
  productSlug: string | null;
  amountMinor: number;
  currency: string;
  status: string;
  createdAt: number;
  paidAt: number | null;
  documentSentAt: number | null;
  invoice: AdminOneTimeInvoice | null;
}

function orderBadge(status: string) {
  const variant =
    status === "paid" ? "success" : status === "failed" ? "destructive" : "secondary";
  return <Badge variant={variant}>{status.replace(/_/g, " ")}</Badge>;
}

function shortDate(value: number | null): string {
  return value ? new Date(value).toLocaleDateString() : "-";
}

export function AdminOneTimeOrders() {
  const allowed = useAdminGuard();
  const [orders, setOrders] = useState<AdminOneTimeOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    try {
      const data = (await api("/api/superadmin/one-time-orders")) as {
        orders?: AdminOneTimeOrder[];
      };
      setOrders(data.orders ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load one-time orders");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (allowed) void load();
  }, [allowed]);

  async function resend(order: AdminOneTimeOrder, kind: "invoice" | "document") {
    setBusy(`${order.id}:${kind}`);
    try {
      await api(
        `/api/superadmin/one-time-orders/${order.id}/${kind === "invoice" ? "resend-invoice" : "resend-document"}`,
        { method: "POST" },
      );
      toast.success(
        kind === "invoice"
          ? `Invoice re-sent to ${order.email}`
          : `Playbook re-sent to ${order.email}`,
      );
      await load();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : kind === "invoice"
            ? "Could not resend invoice"
            : "Could not resend playbook",
      );
    } finally {
      setBusy(null);
    }
  }

  if (allowed === null || (allowed && loading)) return <AdminLoading />;
  if (allowed === false) return <AdminDenied />;

  const columns: DataColumn<AdminOneTimeOrder>[] = [
    {
      key: "customer",
      header: "Customer",
      sortable: true,
      render: (order) => (
        <div>
          <div className="font-medium">{order.businessName ?? order.name ?? order.email}</div>
          <div className="text-xs text-muted-foreground">{order.email}</div>
        </div>
      ),
      sortValue: (order) =>
        (order.businessName ?? order.name ?? order.email).toLowerCase(),
      searchValue: (order) =>
        `${order.businessName ?? ""} ${order.name ?? ""} ${order.email}`,
    },
    {
      key: "product",
      header: "Product",
      sortable: true,
      render: (order) => order.productName ?? "-",
      sortValue: (order) => (order.productName ?? "").toLowerCase(),
      searchValue: (order) => order.productName ?? "",
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (order) => orderBadge(order.status),
      sortValue: (order) => order.status,
      searchValue: (order) => order.status,
    },
    {
      key: "amount",
      header: "Amount",
      sortable: true,
      render: (order) => formatMoney(order.amountMinor, order.currency),
      sortValue: (order) => order.amountMinor,
    },
    {
      key: "paid",
      header: "Paid",
      sortable: true,
      render: (order) => shortDate(order.paidAt),
      sortValue: (order) => order.paidAt ?? 0,
    },
    {
      key: "invoice",
      header: "Invoice",
      sortable: true,
      render: (order) => (
        <div className="text-xs">
          <div className="font-medium">{order.invoice?.number ?? "Not generated"}</div>
          {order.invoice ? (
            <div className="text-muted-foreground">
              {order.invoice.emailSentAt ? `Sent ${shortDate(order.invoice.emailSentAt)}` : "Not sent"}
              {order.invoice.emailResendCount > 0
                ? ` · ${order.invoice.emailResendCount}x`
                : ""}
            </div>
          ) : null}
        </div>
      ),
      sortValue: (order) => order.invoice?.number ?? "",
      searchValue: (order) => order.invoice?.number ?? "",
    },
    {
      key: "document",
      header: "Playbook",
      sortable: true,
      render: (order) =>
        order.productSlug === "loops" ? (
          <span className="text-xs">
            {order.documentSentAt ? `Sent ${shortDate(order.documentSentAt)}` : "Not sent"}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        ),
      sortValue: (order) => order.documentSentAt ?? 0,
    },
    {
      key: "actions",
      header: "Actions",
      render: (order) => {
        const invoiceBusy = busy === `${order.id}:invoice`;
        const documentBusy = busy === `${order.id}:document`;
        const hasInvoice = Boolean(order.invoice);
        const hasDocument = order.productSlug === "loops" && order.status === "paid";
        if (!hasInvoice && !hasDocument) {
          return <span className="text-xs text-muted-foreground">No actions</span>;
        }
        return (
          <div className="flex justify-start gap-0.5">
            {hasInvoice && (
              <RowAction
                label="Download invoice"
                onClick={() =>
                  window.open(
                    `/api/superadmin/one-time-orders/${order.id}/invoice`,
                    "_blank",
                    "noopener,noreferrer",
                  )
                }
              >
                <ArrowDownTrayIcon className="size-4" />
              </RowAction>
            )}
            {hasInvoice && (
              <RowAction
                label={invoiceBusy ? "Sending…" : "Resend invoice"}
                loading={invoiceBusy}
                disabled={busy !== null || order.status !== "paid"}
                onClick={() => {
                  if (busy === null && order.status === "paid") void resend(order, "invoice");
                }}
              >
                <PaperAirplaneIcon className="size-4" />
              </RowAction>
            )}
            {hasDocument && (
              <RowAction
                label={documentBusy ? "Sending…" : "Resend Loops playbook"}
                loading={documentBusy}
                disabled={busy !== null}
                onClick={() => {
                  if (busy === null) void resend(order, "document");
                }}
              >
                <PaperAirplaneIcon className="size-4" />
              </RowAction>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">One-time orders</h1>
        <p className="text-sm text-muted-foreground">
          Guest Diagnostic, Blueprint and SNIPE Loops purchases with their invoices. Paid orders
          without an invoice are backfilled when this page loads.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Guest purchases</CardTitle>
          <CardDescription>
            Download an invoice, send a fresh invoice email, or resend the Loops playbook.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            rows={orders}
            columns={columns}
            rowId={(order) => order.id}
            pageSize={20}
            searchPlaceholder="Search customer, product, or invoice…"
            empty="No one-time orders yet."
          />
        </CardContent>
      </Card>
    </div>
  );
}
