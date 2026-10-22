import { useEffect, useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import {
  Bars3Icon,
  BuildingOfficeIcon,
  ChartBarIcon,
  CircleStackIcon,
  ClockIcon,
  Cog6ToothIcon,
  CreditCardIcon,
  DocumentTextIcon,
  CubeIcon,
  HomeIcon,
  MoonIcon,
  ShieldCheckIcon,
  SunIcon,
  TicketIcon,
  UsersIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import { useTheme } from "next-themes";
import { Button } from "../ui/button";
import { Separator } from "../ui/separator";
import { Sheet, SheetContent, SheetTrigger } from "../ui/sheet";
import { Skeleton } from "../ui/skeleton";
import { cn } from "../../lib/utils";
import { noticeTone } from "../../lib/trial-notice";
import { useBillingRevision } from "../../lib/billing-events";
import { useActiveOrg } from "../../hooks/useActiveOrg";
import { shouldForceOnboarding } from "../../lib/onboarding-gate";
import { OrgSwitcher } from "./OrgSwitcher";
import { ProfileMenu } from "./ProfileMenu";
import { BillingGate } from "./BillingGate";
import { BrandLogo } from "../BrandLogo";
import { EmbedScripts } from "../EmbedScripts";

/** The dashboard product name (the marketing brand is GrowthSnipe). */
const APP_BRAND = "SNIPE Intelligence™";

const NAV = [
  { to: "/dashboard", label: "Scorecard", icon: HomeIcon, end: true },
  { to: "/connections", label: "Connections", icon: CircleStackIcon, end: false },
  { to: "/business-profile", label: "Business profile", icon: BuildingOfficeIcon, end: false },
  { to: "/billing", label: "Billing", icon: CreditCardIcon, end: false },
  { to: "/audit", label: "Audit log", icon: ClockIcon, end: false },
  { to: "/settings", label: "Settings", icon: Cog6ToothIcon, end: false },
];

const ADMIN_NAV = [
  { to: "/superadmin", label: "Dashboard", icon: ChartBarIcon, end: true },
  { to: "/superadmin/clients", label: "Clients", icon: UsersIcon, end: false },
  { to: "/superadmin/invoices", label: "Invoices", icon: DocumentTextIcon, end: false },
  { to: "/superadmin/plans", label: "Plans", icon: CubeIcon, end: false },
  { to: "/superadmin/coupons", label: "Coupons", icon: TicketIcon, end: false },
  { to: "/superadmin/logs", label: "Logs", icon: WrenchScrewdriverIcon, end: false },
  { to: "/superadmin/settings", label: "Settings", icon: Cog6ToothIcon, end: false },
];

/**
 * Screens that stay reachable while a workspace is gated. Billing is how the
 * owner fixes it; business profile, settings and profile are account-level and
 * never depend on the subscription.
 */
const GATE_EXEMPT = ["/billing", "/business-profile", "/settings", "/profile"];

function isGatedRoute(pathname: string): boolean {
  if (pathname.startsWith("/superadmin")) return false;
  return !GATE_EXEMPT.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function NavItems({ superadmin, onNavigate }: { superadmin: boolean; onNavigate?: () => void }) {
  // Superadmins get the platform console only — no client pages.
  const items = superadmin ? ADMIN_NAV : NAV;
  return (
    <nav className="space-y-1">
      {superadmin && (
        <div className="flex items-center gap-2 px-3 pt-1 pb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          <ShieldCheckIcon className="size-4" />
          Admin
        </div>
      )}
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )
          }
        >
          <item.icon className="size-5 shrink-0" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

export function AppShell() {
  const { theme, setTheme } = useTheme();
  const location = useLocation();
  const [portalName] = useState(APP_BRAND);
  const [drawer, setDrawer] = useState(false);
  const {
    orgs,
    activeOrgId,
    role,
    access,
    superadmin,
    defaultOrgId,
    email,
    userName,
    loading,
    switchOrg,
    makeDefault,
    refresh,
  } = useActiveOrg();

  const [billingNotice, setBillingNotice] = useState<{
    kind: "trial" | "expired" | "past_due" | "prepaid";
    daysLeft?: number;
  } | null>(null);
  const billingRevision = useBillingRevision();

  // Trial / subscribe notice bar above every app page (org members only).
  useEffect(() => {
    if (!activeOrgId || superadmin) {
      setBillingNotice(null);
      return;
    }
    fetch(`/api/billing/subscription?orgId=${activeOrgId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const sub = (
          d as { subscription?: { status: string; trialEndsAt?: number | null; trialPrepaid?: number | null } | null } | null
        )?.subscription;
        if (!sub) {
          setBillingNotice(null);
          return;
        }
        if (sub.status === "trialing" && sub.trialEndsAt) {
          // A prepaid trial: the customer already paid, the plan starts when
          // the trial ends - nothing to nag them about.
          setBillingNotice({
            kind: sub.trialPrepaid ? "prepaid" : "trial",
            daysLeft: Math.max(0, Math.ceil((sub.trialEndsAt - Date.now() / 1000) / 86400)),
          });
        } else if (sub.status === "trial_expired") {
          setBillingNotice({ kind: "expired" });
        } else if (sub.status === "past_due") {
          setBillingNotice({ kind: "past_due" });
        } else {
          setBillingNotice(null);
        }
      })
      .catch(() => setBillingNotice(null));
  }, [activeOrgId, superadmin, billingRevision]);

  // A workspace is gated when its subscription is not trialing/active. Only
  // known-good access gates the UI: a still-loading or failed lookup (null)
  // must never lock a paying workspace out.
  const gated =
    !superadmin &&
    access !== null &&
    access.state !== "trial" &&
    access.state !== "active" &&
    isGatedRoute(location.pathname);

  // Fresh signups haven't onboarded until they belong to a workspace.
  // Force them into the wizard from every app route except the wizard itself
  // (and invitation acceptance, which grants membership). Superadmins are exempt.
  const onOnboardingRoute =
    location.pathname === "/onboarding" || location.pathname.startsWith("/accept-invitation");
  if (
    shouldForceOnboarding({
      loading,
      superadmin,
      onOnboardingRoute,
      orgCount: orgs.length,
    })
  ) {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
        {/* Operator-configured app snippet (chat widget etc.), injected as the
            last child of <body>. Skipped on /superadmin screens. */}
        <EmbedScripts surface="app" />
        {/* Desktop sidebar */}
        <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r bg-sidebar md:flex">
          <div className="p-3">
            <div className="mb-1 flex items-center gap-2 px-2 text-sm font-bold text-sidebar-primary">
              <Link to="/" aria-label="Home"><BrandLogo name={portalName} /></Link>
            </div>
            {!superadmin && (
              <OrgSwitcher
                orgs={orgs}
                activeOrgId={activeOrgId}
                defaultOrgId={defaultOrgId}
                onSwitch={switchOrg}
                onDefault={makeDefault}
                onChanged={refresh}
              />
            )}
          </div>
          <Separator />
          <div className="flex-1 overflow-y-auto p-3">
            <NavItems superadmin={superadmin} />
          </div>
          <div className="border-t p-3 text-xs text-muted-foreground">
            {role ? (
              <span>
                Signed in as <span className="font-medium text-foreground">{role}</span>
              </span>
            ) : (
              <span>Workspace access</span>
            )}
          </div>
        </aside>

        <div className="md:pl-64">
          {billingNotice && !gated && (
            <div
              className={`flex flex-wrap items-center justify-center gap-x-2 px-3 py-1 text-center text-xs font-medium ${noticeTone(
                billingNotice.kind,
                billingNotice.daysLeft,
              )}`}
            >
              {billingNotice.kind === "trial" && (
                <span>
                  SNIPE Intelligence™ trial: {billingNotice.daysLeft} day{billingNotice.daysLeft === 1 ? "" : "s"} left. Subscribe to keep full access.
                </span>
              )}
              {billingNotice.kind === "prepaid" && (
                <span>
                  Your plan starts in {billingNotice.daysLeft} day{billingNotice.daysLeft === 1 ? "" : "s"},
                  when your trial ends. Everything stays available until then.
                </span>
              )}
              {billingNotice.kind === "expired" && (
                <span>Trial ended: subscribe to restore full access. Your data is retained.</span>
              )}
              {billingNotice.kind === "past_due" && (
                <span>Subscription past due: pay now to restore full access.</span>
              )}
              {billingNotice.kind !== "prepaid" && (
                <Button size="xs" variant="secondary" asChild>
                  <Link to="/billing">Subscribe</Link>
                </Button>
              )}
              {billingNotice.kind === "prepaid" && (
                <Button size="xs" variant="secondary" asChild>
                  <Link to="/billing">View plan</Link>
                </Button>
              )}
            </div>
          )}
          {/* Header */}
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur sm:px-4">
            <Sheet open={drawer} onOpenChange={setDrawer}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                  <Bars3Icon className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-3">
                <div className="mb-2 px-2 text-sm font-bold text-sidebar-primary"><Link to="/" aria-label="Home" onClick={() => setDrawer(false)}><BrandLogo name={portalName} /></Link></div>
                {!superadmin && (
                  <OrgSwitcher
                    orgs={orgs}
                    activeOrgId={activeOrgId}
                    defaultOrgId={defaultOrgId}
                    onSwitch={switchOrg}
                    onDefault={makeDefault}
                    onChanged={() => {
                      refresh();
                      setDrawer(false);
                    }}
                  />
                )}
                <Separator className="my-3" />
                <NavItems superadmin={superadmin} onNavigate={() => setDrawer(false)} />
              </SheetContent>
            </Sheet>
            <span className="font-semibold md:hidden"><Link to="/" aria-label="Home"><BrandLogo name={portalName} /></Link></span>
            <div className="ml-auto flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              >
                {theme === "dark" ? <SunIcon className="size-5" /> : <MoonIcon className="size-5" />}
              </Button>
              <ProfileMenu email={email} userName={userName} role={role} superadmin={superadmin} />
            </div>
          </header>

          {/* Content */}
          <main className="mx-auto w-full max-w-6xl p-4 sm:p-6">
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : (
              <BillingGate gated={gated} access={access} isAdmin={role === "admin"}>
                <Outlet />
              </BillingGate>
            )}
          </main>
        </div>
      </div>
  );
}
