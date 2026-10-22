import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  ArrowPathIcon,
  ArrowRightIcon,
  BellAlertIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  CircleStackIcon,
  CreditCardIcon,
  ExclamationTriangleIcon,
  KeyIcon,
} from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { authClient } from "../lib/auth-client";
import { useActiveOrg } from "../hooks/useActiveOrg";
import { api, type Briefing, type ManagementSnapshot, type McpToken, type SidekickConnection } from "../lib/sidekick";
import { formatMoney } from "../lib/money";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";

/** Sidekick overview: latest briefing, live business snapshot, connection status. */
export function Dashboard() {
  const { data: activeOrg } = authClient.useActiveOrganization();
  const { superadmin, loading: orgLoading } = useActiveOrg();
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [connections, setConnections] = useState<SidekickConnection[]>([]);
  const [activeTokens, setActiveTokens] = useState<McpToken[]>([]);
  const [oauthConnected, setOAuthConnected] = useState(false);
  const [businessProfile, setBusinessProfile] = useState<{ businessName: string | null; trade: string | null } | null>(null);
  const [subscription, setSubscription] = useState<{ status: string; trialEndsAt?: number | null } | null>(null);
  const [snapshot, setSnapshot] = useState<ManagementSnapshot | null>(null);
  const [snapshotState, setSnapshotState] = useState<"idle" | "loading" | "missing" | "error">("idle");
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [gettingStartedOpen, setGettingStartedOpen] = useState(true);
  const hasSnapshotRef = useRef(false);

  const orgId = activeOrg?.id ?? null;

  const loadSnapshot = useCallback(
    async (id: string, quiet = false) => {
      setSnapshotState("loading");
      setSnapshotError(null);
      try {
        // No provider param: the server resolves the org's actual platform
        // connection, so ISN workspaces don't loop on a hard-coded spectora
        // default and Retry reflects the real provider state.
        const data = await api<{ snapshot: ManagementSnapshot }>(
          `/api/sidekick/snapshot?orgId=${id}`,
        );
        hasSnapshotRef.current = true;
        setSnapshot(data.snapshot);
        setSnapshotState("idle");
        setSnapshotError(null);
        if (!quiet) toast.success("Snapshot refreshed — last 30 days");
      } catch (err) {
        const message = err instanceof Error && err.message ? err.message : "Snapshot unavailable";
        if (/no .* connection configured/i.test(message)) {
          setSnapshotState("missing");
          setSnapshotError(null);
        } else if (hasSnapshotRef.current) {
          // Keep a previously loaded snapshot visible on refresh failure so
          // Retry never blanks the card into a stuck "unavailable" state.
          setSnapshotState("idle");
          setSnapshotError(message);
        } else {
          setSnapshotState("error");
          setSnapshotError(message);
        }
        if (!quiet && !/no .* connection configured/i.test(message)) toast.error(message);
      }
    },
    [],
  );

  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    // Reset snapshot state when switching workspaces so a previous org's
    // error never sticks around as a stale "unavailable" card.
    hasSnapshotRef.current = false;
    setSnapshot(null);
    setSnapshotState("idle");
    setSnapshotError(null);
    Promise.all([
      api<{ overview: { connections: SidekickConnection[]; activeTokens: McpToken[]; oauthConnected: boolean; latestBriefing: Briefing | null } }>(
        `/api/sidekick/overview?orgId=${orgId}`,
      ).catch(() => null),
      fetch(`/api/billing/subscription?orgId=${orgId}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      api<{ profile: { businessName: string | null; trade: string | null } | null }>(
        `/api/sidekick/business-profile?orgId=${orgId}`,
      ).catch(() => null),
    ])
      .then(([overview, sub, bp]) => {
        setConnections(overview?.overview.connections ?? []);
        setActiveTokens(overview?.overview.activeTokens ?? []);
        setOAuthConnected(overview?.overview.oauthConnected ?? false);
        setBriefing(overview?.overview.latestBriefing ?? null);
        setSubscription((sub as { subscription?: { status: string; trialEndsAt?: number | null } | null })?.subscription ?? null);
        setBusinessProfile(bp?.profile ?? null);
        // Load the snapshot after the overview so the server-side fallback
        // and the connections banner stay consistent on first paint.
        void loadSnapshot(orgId, true);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [orgId, loadSnapshot]);

  // Superadmins live in the admin console — the client dashboard is hidden from them.
  if (!orgLoading && superadmin) return <Navigate to="/superadmin" replace />;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      </div>
    );
  }

  if (!orgId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Welcome to Tradesmatic</CardTitle>
          <CardDescription>Create a workspace to connect your business platform.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link to="/onboarding">Get started</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const facts = snapshot?.facts;
  const unusual: string[] = [];
  if (facts) {
    if (facts.openOrders > 0) unusual.push(`${facts.openOrders} open order${facts.openOrders === 1 ? "" : "s"} need attention.`);
    if (facts.recentOrders === 0) unusual.push("No recent orders returned — check the provider connection and date window.");
  }
  const trialDaysLeft =
    subscription?.status === "trialing" && subscription.trialEndsAt
      ? Math.max(0, Math.ceil((subscription.trialEndsAt - Date.now() / 1000) / 86400))
      : null;
  const trialExpired = subscription?.status === "trial_expired";

  // Onboarding checklist: checked when complete, pending otherwise. Hidden
  // once everything is done. Platform connection follows billing because the
  // connections API only accepts saves for trialing/active workspaces.
  const checklist = [
    { label: "Create your workspace", done: true, to: null as string | null, action: null as string | null },
    {
      label: "Complete your business profile",
      done: Boolean(businessProfile?.businessName && businessProfile?.trade),
      to: "/business-profile",
      action: "Complete",
    },
    {
      label: "Start your trial or subscribe",
      done: subscription !== null && ["trialing", "active", "canceled"].includes(subscription.status),
      to: "/billing",
      action: "Subscribe",
    },
    {
      label: "Connect your platform",
      done: connections.length > 0,
      to: "/connections",
      action: "Connect",
    },
    {
      label: "Connect your AI",
      done: activeTokens.length > 0 || oauthConnected,
      to: "/mcp-access",
      action: "Connect AI",
    },
  ];
  const pendingSteps = checklist.filter((s) => !s.done);

  return (
    <div className="space-y-4">
      {pendingSteps.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div className="space-y-1.5">
              <CardTitle>Getting started</CardTitle>
              <CardDescription>
                {pendingSteps.length} step{pendingSteps.length === 1 ? "" : "s"} left to finish setting up {activeOrg?.name ?? "your workspace"}.
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-expanded={gettingStartedOpen}
              aria-label={gettingStartedOpen ? "Hide getting started" : "Show getting started"}
              onClick={() => setGettingStartedOpen((v) => !v)}
            >
              <ChevronDownIcon className={`size-4 transition-transform duration-300 ${gettingStartedOpen ? "" : "-rotate-180"}`} />
            </Button>
          </CardHeader>
          <div
            className={`grid transition-all duration-300 ease-in-out ${gettingStartedOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
          >
            <div className="overflow-hidden">
              <CardContent>
                <ul className="space-y-2">
                  {checklist.map((s) => (
                    <li key={s.label} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2">
                        {s.done ? (
                          <CheckCircleIcon className="size-5 shrink-0 text-green-600" aria-label="Completed" />
                        ) : (
                          <span className="size-5 shrink-0 rounded-full border-2 border-muted-foreground/40" aria-label="Pending" />
                        )}
                        <span className={s.done ? "text-muted-foreground" : "font-medium"}>{s.label}</span>
                      </span>
                      {!s.done && s.to && (
                        <Button variant="outline" size="sm" asChild>
                          <Link to={s.to}>{s.action}</Link>
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </div>
          </div>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
        <Button variant="outline" size="sm" asChild>
          <Link to="/briefings-schedules">
            <BellAlertIcon className="size-4" /> Briefings &amp; schedules
          </Link>
        </Button>
      </div>

      {connections.length === 0 && (
        <Alert>
          <ExclamationTriangleIcon className="size-4" />
          <AlertTitle>No provider connected</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-2">
            Connect your business platform to unlock briefings, snapshots, and AI answers.
            <Button variant="outline" size="sm" asChild>
              <Link to="/connections">
                Connect <ArrowRightIcon className="size-4" />
              </Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {trialDaysLeft !== null && (
        <Alert>
          <AlertTitle>Pro trial — {trialDaysLeft} day{trialDaysLeft === 1 ? "" : "s"} left</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-2">
            Full access until the trial ends. No card required yet.
            <Button variant="outline" size="sm" asChild>
              <Link to="/billing">
                Subscribe <ArrowRightIcon className="size-4" />
              </Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {trialExpired ? (
        <Card>
          <CardHeader>
            <CardTitle>Trial ended — subscribe to restore access</CardTitle>
            <CardDescription>
              Dashboard, AI access, and briefings are paused. Your data is retained.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/billing">Go to billing</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Latest briefing</CardTitle>
            <CardDescription>
              {briefing ? `From ${new Date(briefing.createdAt).toLocaleString()} (${briefing.status})` : "No briefings delivered yet"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {briefing?.briefingText ? (
              <p className="text-sm whitespace-pre-wrap">{briefing.briefingText}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {briefing
                  ? `Latest run ${briefing.status}. ${briefing.errorText ?? ""}`
                  : "Enable a briefing schedule to receive owner briefings by email."}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Last 30 Days Snapshot</CardTitle>
            <CardDescription>
              {snapshot
                ? `Rolling 30-day window · updated ${new Date(snapshot.generatedAt).toLocaleString()}`
                : "Rolling 30-day provider readout"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {snapshotState === "loading" && !snapshot && (
              <div className="space-y-2">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-2/3" />
              </div>
            )}
            {snapshotState === "missing" && (
              <p className="text-sm text-muted-foreground">
                Connect a provider to see live numbers.{" "}
                <Link className="underline" to="/connections">
                  Go to connections
                </Link>
              </p>
            )}
            {snapshotState === "error" && !snapshot && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {snapshotError ?? "Snapshot unavailable right now."}
                </p>
                {/subscription required/i.test(snapshotError ?? "") ? (
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/billing">Go to billing</Link>
                  </Button>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => orgId && void loadSnapshot(orgId)}>
                      <ArrowPathIcon className="size-4" />
                      Retry
                    </Button>
                    <Button variant="ghost" size="sm" asChild>
                      <Link to="/connections">Check connection</Link>
                    </Button>
                  </div>
                )}
              </div>
            )}
            {snapshotError && snapshot && (
              <div className="mb-3 space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-sm text-muted-foreground">Refresh failed: {snapshotError}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" disabled={snapshotState === "loading"} onClick={() => orgId && void loadSnapshot(orgId)}>
                    <ArrowPathIcon className={`size-4 ${snapshotState === "loading" ? "animate-spin" : ""}`} />
                    Retry
                  </Button>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to="/connections">Check connection</Link>
                  </Button>
                </div>
              </div>
            )}
            {facts && (
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-muted-foreground">Recent orders</dt><dd className="text-xl font-bold">{facts.recentOrders}</dd></div>
                <div><dt className="text-muted-foreground">Open orders</dt><dd className="text-xl font-bold">{facts.openOrders}</dd></div>
                <div><dt className="text-muted-foreground">Completed revenue</dt><dd className="text-xl font-bold">{formatMoney(facts.recentCompletedRevenue, "USD")}</dd></div>
                <div><dt className="text-muted-foreground" title="Distinct agents named on inspections in the last 30 days">Recent agents</dt><dd className="text-xl font-bold">{facts.recentAgents}</dd></div>
              </dl>
            )}
            {snapshot?.caveats.map((c) => (
              <p key={c} className="mt-3 text-xs text-muted-foreground">{c}</p>
            ))}
            {snapshot && (
              <Button variant="outline" size="sm" className="mt-3" disabled={snapshotState === "loading"} onClick={() => orgId && void loadSnapshot(orgId)}>
                <ArrowPathIcon className={`size-4 ${snapshotState === "loading" ? "animate-spin" : ""}`} />
                {snapshotState === "loading" ? "Refreshing…" : "Refresh snapshot"}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
      )}

      {unusual.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Anything unusual</CardTitle>
            <CardDescription>Callouts derived from the latest snapshot — verify against source records.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {unusual.map((u) => (
                <li key={u}>{u}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CircleStackIcon className="size-5 text-primary" /> Connections
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {connections.length === 0 ? "None yet" : `${connections.length} connected`}
            </span>
            <Button variant="outline" size="sm" asChild>
              <Link to="/connections">Manage</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyIcon className="size-5 text-primary" /> AI access
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Via Tradesmatic MCP Server</span>
            <Button variant="outline" size="sm" asChild>
              <Link to="/mcp-access">Manage</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCardIcon className="size-5 text-primary" /> Billing
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Invoices & methods</span>
            <Button variant="outline" size="sm" asChild>
              <Link to="/billing">Open</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
