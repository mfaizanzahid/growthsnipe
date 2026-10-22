import { useEffect, useState } from "react";
import { toast } from "sonner";
import { formatMoney } from "../../lib/money";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Checkbox } from "../../components/ui/checkbox";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { api } from "../../components/billing/shared";
import { ConfirmDialog } from "../../components/billing/dialogs";
import { AdminDenied, AdminLoading, useAdminGuard } from "./guard";

export function AdminPlans() {
  const allowed = useAdminGuard();
  const [plans, setPlans] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [deletePlanId, setDeletePlanId] = useState<string | null>(null);
  const [planForm, setPlanForm] = useState({ name: "", monthly: "", annual: "", maxUsers: "", briefings: true, features: "" });
  const [editingFeaturesId, setEditingFeaturesId] = useState<string | null>(null);
  const [editingFeatures, setEditingFeatures] = useState("");

  async function load() {
    try {
      const p = await api("/api/superadmin/plans");
      setPlans(((p as { plans?: Array<Record<string, unknown>> }).plans ?? []) as Array<Record<string, unknown>>);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load plans");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (allowed) void load();
  }, [allowed]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      toast.success(ok);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  if (allowed === null || (allowed && loading)) return <AdminLoading />;
  if (allowed === false) return <AdminDenied />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Plans</h1>
        <p className="text-sm text-muted-foreground">At most 4 active. Delete is blocked while subscriptions reference a plan.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Plans</CardTitle>
          <CardDescription>At most 4 active. Delete is blocked while subscriptions reference a plan.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {plans.map((p) => (
            <div key={String(p.id)} className="space-y-2 rounded-md border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-medium">{String(p.name)}</span>{" "}
                  <span className="text-muted-foreground">
                    {formatMoney(Number(p.monthlyMinor))}/mo · {formatMoney(Number(p.annualMinor))}/yr ·{" "}
                    {p.maxUsers == null ? "unlimited users" : `${Number(p.maxUsers)} user${Number(p.maxUsers) === 1 ? "" : "s"}`} ·{" "}
                    {Number(p.allowBriefings) === 1 ? "briefings on" : "no briefings"}
                  </span>{" "}
                  {Number(p.active) !== 1 && <Badge>archived</Badge>}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditingFeaturesId(String(p.id));
                      setEditingFeatures(typeof p.features === "string" ? p.features : "");
                    }}
                  >
                    Features
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      run(async () => {
                        await api(`/api/superadmin/plans/${String(p.id)}`, {
                          method: "PATCH",
                          body: JSON.stringify({ active: Number(p.active) === 1 ? 0 : 1 }),
                        });
                      }, "Plan updated")
                    }
                  >
                    {Number(p.active) === 1 ? "Archive" : "Activate"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeletePlanId(String(p.id))}>
                    Delete
                  </Button>
                </div>
              </div>
              {typeof p.features === "string" && p.features.trim() !== "" && (
                <p className="text-xs text-muted-foreground">Features: {p.features}</p>
              )}
              {editingFeaturesId === String(p.id) && (
                <div className="space-y-2">
                  <Textarea
                    rows={3}
                    placeholder="Feature one, Feature two, Feature three"
                    value={editingFeatures}
                    onChange={(e) => setEditingFeatures(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Comma-separated list shown on the pricing page and the billing subscribe picker. Avoid commas inside a single feature.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() =>
                        run(async () => {
                          await api(`/api/superadmin/plans/${String(p.id)}`, {
                            method: "PATCH",
                            body: JSON.stringify({ features: editingFeatures.trim() === "" ? null : editingFeatures }),
                          });
                          setEditingFeaturesId(null);
                        }, "Plan features updated")
                      }
                    >
                      Save features
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditingFeaturesId(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
          <div className="grid gap-3 rounded-md border p-4">
            <div className="font-medium">New plan</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input placeholder="Name" value={planForm.name} onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })} />
              <Input placeholder="Max users (blank = unlimited)" value={planForm.maxUsers} onChange={(e) => setPlanForm({ ...planForm, maxUsers: e.target.value })} />
              <Input placeholder="Monthly USD" value={planForm.monthly} onChange={(e) => setPlanForm({ ...planForm, monthly: e.target.value })} />
              <Input placeholder="Yearly USD" value={planForm.annual} onChange={(e) => setPlanForm({ ...planForm, annual: e.target.value })} />
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={planForm.briefings} onCheckedChange={(v) => setPlanForm({ ...planForm, briefings: v === true })} />
                Scheduled briefings allowed
              </label>
              <div className="sm:col-span-2">
                <Textarea
                  rows={2}
                  placeholder="Features (comma-separated): 1 user, AI connection, 3 AI Advisors"
                  value={planForm.features}
                  onChange={(e) => setPlanForm({ ...planForm, features: e.target.value })}
                />
              </div>
            </div>
            <Button
              onClick={() =>
                run(async () => {
                  await api("/api/superadmin/plans", {
                    method: "POST",
                    body: JSON.stringify({
                      name: planForm.name,
                      monthlyMinor: Math.round(Number(planForm.monthly) * 100),
                      annualMinor: Math.round(Number(planForm.annual) * 100),
                      setupFeeMinor: 0,
                      trialPeriodDays: 0,
                      maxUsers: planForm.maxUsers.trim() === "" ? null : Math.max(1, Math.round(Number(planForm.maxUsers))),
                      allowBriefings: planForm.briefings ? 1 : 0,
                      features: planForm.features.trim() === "" ? null : planForm.features,
                    }),
                  });
                  setPlanForm({ name: "", monthly: "", annual: "", maxUsers: "", briefings: true, features: "" });
                }, "Plan created")
              }
            >
              Create plan
            </Button>
          </div>
        </CardContent>
      </Card>

      {deletePlanId && (
        <ConfirmDialog
          open
          onClose={() => setDeletePlanId(null)}
          title="Delete this plan?"
          description="Blocked while any subscription references the plan — archive it instead."
          confirmLabel="Delete"
          destructive
          busy={busy}
          onConfirm={() => {
            const id = deletePlanId;
            setDeletePlanId(null);
            setBusy(true);
            api(`/api/superadmin/plans/${id}`, { method: "DELETE" })
              .then(() => {
                toast.success("Plan deleted");
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
