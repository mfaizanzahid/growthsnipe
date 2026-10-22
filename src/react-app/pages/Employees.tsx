import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { LockClosedIcon } from "@heroicons/react/24/outline";
import { authClient } from "../lib/auth-client";
import { api } from "../lib/sidekick";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Skeleton } from "../components/ui/skeleton";
import { Switch } from "../components/ui/switch";
import { cn } from "../lib/utils";

/**
 * Management viewpoints that compose above the canonical data tools.
 * `prompt` is the server prompt name (see src/server/mcp/prompts.ts) and is
 * the key for persisted activation state. The last four are Pro-only: capped
 * (Starter) plans see them inactive, and the MCP server hides + refuses those
 * prompts for such workspaces.
 */
const EMPLOYEES = [
  { prompt: "ask-owner", name: "Business Owner / CEO Advisor", body: "The daily driver: priorities, what changed, and the three things that matter today.", pro: false },
  { prompt: "ask-cfo", name: "CFO / Performance Analyst", body: "Revenue, average ticket, service mix, and trends. Never calls revenue profit; always shows evidence.", pro: false },
  { prompt: "ask-operations", name: "Operations Manager", body: "Scheduling health, open work, capacity, and follow-through across agents.", pro: false },
  { prompt: "ask-revenue", name: "Revenue Manager", body: "Pipeline, conversion, pricing power, and where the next dollar comes from.", pro: true },
  { prompt: "ask-customer", name: "Customer Intelligence Manager", body: "Who needs attention, who refers, who drifts — all backed by your real data.", pro: true },
  { prompt: "ask-marketing", name: "Marketing / Channel Analyst", body: "Which channels and referral sources pull their weight, and which are slipping.", pro: true },
  { prompt: "ask-quality", name: "Quality / Risk Manager", body: "Defects, complaints, and risky patterns before they become reviews.", pro: true },
];

interface SubscriptionShape {
  status: string;
  plan?: { maxUsers?: number | null } | null;
}

interface EmployeeState {
  name: string;
  title: string;
  tier: "starter" | "pro";
  entitled: boolean;
  active: boolean;
}

export function Employees() {
  const { data: activeOrg } = authClient.useActiveOrganization();
  const orgId = activeOrg?.id ?? null;
  const [proTier, setProTier] = useState<boolean | null>(null);
  const [employees, setEmployees] = useState<EmployeeState[] | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [proPrompt, setProPrompt] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) {
      setProTier(null);
      setEmployees(null);
      return;
    }
    fetch(`/api/billing/subscription?orgId=${orgId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const sub = (d as { subscription?: SubscriptionShape | null } | null)?.subscription;
        // Trials run at Pro tier; paid orgs are Pro tier when uncapped.
        setProTier(!!sub && (sub.status === "trialing" || (sub.status === "active" && (sub.plan?.maxUsers ?? null) == null)));
      })
      .catch(() => setProTier(false));
    api<{ employees: EmployeeState[] }>(`/api/sidekick/employees?orgId=${orgId}`)
      .then((d) => setEmployees(d.employees))
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Could not load AI employees");
        setEmployees([]);
      });
  }, [orgId]);

  async function setActive(prompt: string, active: boolean) {
    if (!orgId || toggling) return;
    setToggling(prompt);
    try {
      const data = await api<{ employee: { employee: string; active: boolean } }>(
        `/api/sidekick/employees/${prompt}`,
        { method: "PATCH", body: JSON.stringify({ orgId, active }) },
      );
      setEmployees((prev) =>
        prev === null ? prev : prev.map((e) => (e.name === prompt ? { ...e, active: data.employee.active } : e)),
      );
      toast.success(active ? "AI employee activated" : "AI employee deactivated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update AI employee");
    } finally {
      setToggling(null);
    }
  }

  const proEmployee = proPrompt ? EMPLOYEES.find((e) => e.prompt === proPrompt) ?? null : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">AI Employees</h1>
        <p className="text-sm text-muted-foreground">
          Advisory viewpoints that share one business context. They compose above the data tools — they are not separate data sources.
        </p>
      </div>
      {proTier === false && (
        <Alert>
          <LockClosedIcon className="size-4" />
          <AlertTitle>4 of 7 employees need Pro</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-2">
            Your plan includes 3 AI employees. Upgrade to unlock the full team on the dashboard and the MCP server.
            <Button variant="outline" size="sm" asChild>
              <Link to="/billing">Upgrade to Pro</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {proTier === null && !orgId ? (
          <p className="text-sm text-muted-foreground">Select a workspace to see your AI team.</p>
        ) : proTier === null || employees === null ? (
          <>
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </>
        ) : (
          EMPLOYEES.map((e) => {
            const state = employees.find((s) => s.name === e.prompt);
            const entitled = state?.entitled ?? !e.pro;
            const active = state?.active ?? entitled;
            const gated = !entitled;
            const busy = toggling === e.prompt;
            return (
              <Card key={e.name} className={cn(gated && "border-dashed opacity-60 grayscale")}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    {gated && <LockClosedIcon className="size-4 shrink-0" aria-hidden />}
                    {e.name}
                    {active ? (
                      <Badge variant="success">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <CardDescription>{e.body}</CardDescription>
                  <div className="flex flex-wrap items-center gap-2">
                    {gated ? (
                      <Button variant="outline" size="sm" onClick={() => setProPrompt(e.prompt)}>
                        Activate
                      </Button>
                    ) : (
                      <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                        <Switch
                          checked={active}
                          disabled={busy}
                          onCheckedChange={(v) => void setActive(e.prompt, v === true)}
                          aria-label={`${e.name} ${active ? "active" : "inactive"}`}
                        />
                        {busy ? "Updating…" : active ? "On" : "Off"}
                      </label>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <Dialog open={proEmployee !== null} onOpenChange={(open) => { if (!open) setProPrompt(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>This is a Pro feature</DialogTitle>
            <DialogDescription>
              {proEmployee ? `“${proEmployee.name}” is not included in your plan. ` : ""}
              Upgrade to Pro to activate this AI employee on the dashboard and the MCP server.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProPrompt(null)}>
              Cancel
            </Button>
            <Button asChild>
              <Link to="/billing">Upgrade to Pro</Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
