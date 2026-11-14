import { useEffect, useState } from "react";
import { ArrowDownTrayIcon, PaperAirplaneIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { DataTable, RowAction, type DataColumn } from "../../components/DataTable";
import { api } from "../../components/billing/shared";
import { AdminDenied, AdminLoading, useAdminGuard } from "./guard";

interface AdminDiagnosticReport {
  id: string;
  orderId: string;
  email: string;
  businessName: string | null;
  provider: string | null;
  status: string;
  stage: string | null;
  progress: number;
  readyAt: number | null;
  reportEmailSentAt: number | null;
  reportEmailResentAt: number | null;
  reportEmailResendCount: number;
  createdAt: number;
}

function reportBadge(status: string) {
  const variant =
    status === "ready"
      ? "success"
      : status === "failed"
        ? "destructive"
        : status === "ready_email_failed"
          ? "outline"
          : "secondary";
  return <Badge variant={variant}>{status.replace(/_/g, " ")}</Badge>;
}

function shortDate(value: number | null): string {
  return value ? new Date(value).toLocaleDateString() : "—";
}

export function AdminReports() {
  const allowed = useAdminGuard();
  const [reports, setReports] = useState<AdminDiagnosticReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    try {
      const data = (await api("/api/superadmin/diagnostic-reports")) as {
        reports?: AdminDiagnosticReport[];
      };
      setReports(data.reports ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load reports");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (allowed) void load();
  }, [allowed]);

  async function resend(report: AdminDiagnosticReport) {
    setBusy(report.id);
    try {
      await api(`/api/superadmin/diagnostic-reports/${report.id}/resend`, { method: "POST" });
      toast.success(`Report link re-sent to ${report.email}`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not resend report");
    } finally {
      setBusy(null);
    }
  }

  if (allowed === null || (allowed && loading)) return <AdminLoading />;
  if (allowed === false) return <AdminDenied />;

  const columns: DataColumn<AdminDiagnosticReport>[] = [
    {
      key: "business",
      header: "Business",
      sortable: true,
      render: (report) => (
        <div>
          <div className="font-medium">{report.businessName ?? "—"}</div>
          <div className="text-xs text-muted-foreground">{report.email}</div>
        </div>
      ),
      sortValue: (report) => (report.businessName ?? "").toLowerCase(),
      searchValue: (report) =>
        `${report.businessName ?? ""} ${report.email} ${report.orderId}`,
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (report) => reportBadge(report.status),
      sortValue: (report) => report.status,
      searchValue: (report) => report.status,
    },
    {
      key: "progress",
      header: "Progress",
      sortable: true,
      render: (report) => `${report.progress}%`,
      sortValue: (report) => report.progress,
    },
    {
      key: "provider",
      header: "Platform",
      render: (report) => report.provider ?? "—",
      searchValue: (report) => report.provider ?? "",
    },
    {
      key: "ready",
      header: "Ready",
      sortable: true,
      render: (report) => shortDate(report.readyAt),
      sortValue: (report) => report.readyAt ?? 0,
    },
    {
      key: "emails",
      header: "Emails",
      sortable: true,
      render: (report) => (
        <div className="text-xs">
          <div>Sent {shortDate(report.reportEmailSentAt)}</div>
          {report.reportEmailResendCount > 0 && (
            <div className="text-muted-foreground">
              Resent {report.reportEmailResendCount}x
              {report.reportEmailResentAt ? ` · ${shortDate(report.reportEmailResentAt)}` : ""}
            </div>
          )}
        </div>
      ),
      sortValue: (report) => report.reportEmailSentAt ?? 0,
    },
    {
      key: "actions",
      header: "Actions",
      render: (report) => {
        const ready = report.status === "ready" || report.status === "ready_email_failed";
        if (!ready) return <span className="text-xs text-muted-foreground">Not ready</span>;
        return (
          <div className="flex justify-start gap-0.5">
            <RowAction
              label="Download PDF"
              onClick={() =>
                window.open(
                  `/api/superadmin/diagnostic-reports/${report.id}/report`,
                  "_blank",
                  "noopener,noreferrer",
                )
              }
            >
              <ArrowDownTrayIcon className="size-4" />
            </RowAction>
            <RowAction
              label={busy === report.id ? "Sending…" : "Resend report link"}
              onClick={() => {
                if (busy !== report.id) void resend(report);
              }}
            >
              <PaperAirplaneIcon className="size-4" />
            </RowAction>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Generated SNIPE Diagnostic reports across all buyers. Download a report or send a fresh
          report link.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Diagnostic reports</CardTitle>
          <CardDescription>
            Ready reports can be downloaded or re-sent to the buyer email. Resending creates a new
            90-day report link.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            rows={reports}
            columns={columns}
            rowId={(report) => report.id}
            pageSize={20}
            searchPlaceholder="Search business, email, or order…"
            empty="No diagnostic reports yet."
          />
        </CardContent>
      </Card>
    </div>
  );
}
