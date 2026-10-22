import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { EyeIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { DataTable, RowAction, type DataColumn } from "../../components/DataTable";
import { formatMoney } from "../../lib/money";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { api, runBulk, toastBulk } from "../../components/billing/shared";
import { ChargeDialog, ConfirmDialog, statusBadge } from "../../components/billing/dialogs";
import { AdminDenied, AdminLoading, useAdminGuard } from "./guard";
import type { AdminClient } from "./types";

export function AdminClients() {
  const allowed = useAdminGuard();
  const navigate = useNavigate();
  const [clients, setClients] = useState<AdminClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [chargeState, setChargeState] = useState<{ orgIds: string[]; label: string } | null>(null);
  const [cancelOrgs, setCancelOrgs] = useState<AdminClient[] | null>(null);

  async function load() {
    try {
      const c = await api("/api/superadmin/clients");
      setClients(((c as { clients?: AdminClient[] }).clients ?? []) as AdminClient[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load clients");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (allowed) void load();
  }, [allowed]);

  async function doCharge(orgIds: string[], amountMinor: number, description: string) {
    setBusy(true);
    const result = await runBulk(
      orgIds,
      (id) => clients.find((c) => c.orgId === id)?.name ?? id,
      (orgId) =>
        api("/api/superadmin/usage-charges", {
          method: "POST",
          body: JSON.stringify({ orgId, amountMinor, description }),
        }).then(() => undefined),
    );
    toastBulk(orgIds.length > 1 ? "Bulk charge" : "Charge", result);
    setChargeState(null);
    setBusy(false);
    await load();
  }

  async function doBulkCancel(orgs: AdminClient[]) {
    setBusy(true);
    const result = await runBulk(
      orgs,
      (o) => o.name,
      (o) =>
        api("/api/billing/subscription/cancel", {
          method: "POST",
          body: JSON.stringify({ orgId: o.orgId }),
        }).then(() => undefined),
    );
    toastBulk("Bulk cancel", result);
    setCancelOrgs(null);
    setBusy(false);
    await load();
  }

  if (allowed === null || (allowed && loading)) return <AdminLoading />;
  if (allowed === false) return <AdminDenied />;

  const columns: DataColumn<AdminClient>[] = [
    {
      key: "name",
      header: "Workspace",
      sortable: true,
      render: (r) => <span className="font-medium">{r.name}</span>,
      sortValue: (r) => r.name.toLowerCase(),
      searchValue: (r) => `${r.name} ${r.slug ?? ""}`,
    },
    {
      key: "owner",
      header: "Owner",
      sortable: true,
      render: (r) => r.ownerEmail ?? "—",
      sortValue: (r) => (r.ownerEmail ?? "").toLowerCase(),
      searchValue: (r) => r.ownerEmail ?? "",
    },
    {
      key: "sub",
      header: "Subscription",
      sortable: true,
      render: (r) => statusBadge(r.subscriptionStatus ?? "none"),
      sortValue: (r) => r.subscriptionStatus ?? "",
      searchValue: (r) => r.subscriptionStatus ?? "",
    },
    {
      key: "open",
      header: "Open",
      sortable: true,
      render: (r) => <span className="whitespace-nowrap">{formatMoney(r.openAmountMinor)}</span>,
      sortValue: (r) => r.openAmountMinor,
    },
    {
      key: "actions",
      header: "Actions",
      render: (r) => (
        <div className="flex justify-start">
          <RowAction label="View client" onClick={() => navigate(`/superadmin/clients/${r.orgId}`)}>
            <EyeIcon className="size-4" />
          </RowAction>
        </div>
      ),
    },
  ];

  const selectedRows = clients.filter((c) => selected.includes(c.orgId));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Clients</h1>
        <p className="text-sm text-muted-foreground">All tenant workspaces. Select rows for bulk actions.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Clients</CardTitle>
          <CardDescription>All tenant workspaces. Select rows for bulk actions.</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            rows={clients}
            columns={columns}
            rowId={(r) => r.orgId}
            selectable
            selected={selected}
            onSelect={setSelected}
            searchPlaceholder="Search workspaces or owners…"
            empty="No organizations yet."
            bulkBar={(ids) => (
              <div className="flex flex-wrap gap-2 rounded-md border bg-muted/40 p-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCancelOrgs(selectedRows.filter((c) => ids.includes(c.orgId)))}
                >
                  Cancel subscriptions ({ids.length})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setChargeState({
                      orgIds: ids,
                      label: `${ids.length} workspaces`,
                    })
                  }
                >
                  Add charge ({ids.length})
                </Button>
              </div>
            )}
          />
          <div className="mt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  await api("/api/superadmin/billing/run-renewals", { method: "POST" });
                  toast.success("Renewal run complete");
                  await load();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Failed");
                }
              }}
            >
              Run renewals now
            </Button>
          </div>
        </CardContent>
      </Card>

      {chargeState && (
        <ChargeDialog
          open
          onClose={() => setChargeState(null)}
          orgName={
            chargeState.orgIds.length === 1
              ? (clients.find((c) => c.orgId === chargeState.orgIds[0])?.name ?? chargeState.label)
              : chargeState.label
          }
          busy={busy}
          onSubmit={(amountMinor, description) => void doCharge(chargeState.orgIds, amountMinor, description)}
        />
      )}

      {cancelOrgs && (
        <ConfirmDialog
          open
          onClose={() => setCancelOrgs(null)}
          title={`Cancel ${cancelOrgs.length} subscription${cancelOrgs.length === 1 ? "" : "s"}?`}
          description={`Access continues until period end: ${cancelOrgs.map((o) => o.name).join(", ")}`}
          confirmLabel="Cancel subscriptions"
          destructive
          busy={busy}
          onConfirm={() => void doBulkCancel(cancelOrgs)}
        />
      )}
    </div>
  );
}
