import { useEffect } from "react";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "./components/ui/tooltip";
import { Toaster } from "./components/ui/sonner";
import { Protected } from "./components/Protected";
import { AppShell } from "./components/shell/AppShell";
import { Login } from "./pages/Login";
import { MagicLink } from "./pages/MagicLink";
import { Onboarding } from "./pages/Onboarding";
import { Dashboard } from "./pages/Dashboard";
import { Billing } from "./pages/Billing";
import { Profile } from "./pages/Profile";
import { MARKETING_ROUTES } from "./marketing-routes";
import { OrgSettings } from "./pages/OrgSettings";
import { AdminDashboard } from "./pages/admin/Dashboard";
import { AdminClients } from "./pages/admin/Clients";
import { AdminInvoices } from "./pages/admin/Invoices";
import { AdminPlans } from "./pages/admin/Plans";
import { AdminCoupons } from "./pages/admin/Coupons";
import { AdminLeads } from "./pages/admin/Leads";
import { AdminLogs } from "./pages/admin/Logs";
import { AdminSettings } from "./pages/admin/SettingsPage";
import { ClientProfile } from "./pages/ClientProfile";
import { AcceptInvitation } from "./pages/AcceptInvitation";
import { Connections } from "./pages/Connections";
import { BusinessProfile } from "./pages/BusinessProfile";
import { AuditLog } from "./pages/AuditLog";
import { NotFound } from "./pages/NotFound";

export const router = createBrowserRouter([
  ...MARKETING_ROUTES.map(({ path, Component }) => ({ path, element: <Component /> })),
  { path: "/login", element: <Login /> },
  { path: "/magic", element: <MagicLink /> },
  // Invite-only: public signup and password flows are retired. Old links land on Book.
  { path: "/signup", element: <Navigate to="/book" replace /> },
  // Retired marketing pages redirect to their strategy replacements.
  { path: "/features", element: <Navigate to="/snipe-system" replace /> },
  { path: "/integrations", element: <Navigate to="/how-it-works" replace /> },
  { path: "/who-we-help", element: <Navigate to="/home-inspectors" replace /> },
  { path: "/pricing", element: <Navigate to="/engine" replace /> },
  { path: "/forgot-password", element: <Navigate to="/login" replace /> },
  { path: "/reset-password", element: <Navigate to="/login" replace /> },
  { path: "/verify-email", element: <Navigate to="/login" replace /> },
  {
    path: "/onboarding",
    element: (
      <Protected>
        <Onboarding />
      </Protected>
    ),
  },
  {
    path: "/accept-invitation/:id",
    element: (
      <Protected>
        <AcceptInvitation />
      </Protected>
    ),
  },
  {
    element: (
      <Protected>
        <AppShell />
      </Protected>
    ),
    children: [
      { path: "/dashboard", element: <Dashboard /> },
      { path: "/connections", element: <Connections /> },
      { path: "/business-profile", element: <BusinessProfile /> },
      { path: "/billing", element: <Billing /> },
      { path: "/audit", element: <AuditLog /> },
      { path: "/profile", element: <Profile /> },
      { path: "/settings", element: <OrgSettings /> },
      { path: "/superadmin", element: <AdminDashboard /> },
      { path: "/superadmin/clients", element: <AdminClients /> },
      { path: "/superadmin/invoices", element: <AdminInvoices /> },
      { path: "/superadmin/plans", element: <AdminPlans /> },
        { path: "/superadmin/coupons", element: <AdminCoupons /> },
        { path: "/superadmin/leads", element: <AdminLeads /> },
      { path: "/superadmin/logs", element: <AdminLogs /> },
      { path: "/superadmin/settings", element: <AdminSettings /> },
      { path: "/superadmin/clients/:orgId", element: <ClientProfile /> },
    ],
  },
  { path: "*", element: <NotFound /> },
]);

export function App() {
  useEffect(() => {
    fetch("/api/portal")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const name = (d as { portal_name?: string } | null)?.portal_name;
        // Per-page marketing titles win: only apply the portal name while the
        // title is still the index.html default (slow fetch must not clobber).
        if (name && (document.title === "GrowthSnipe" || !document.title)) document.title = name;
      })
      .catch(() => undefined);
  }, []);
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <TooltipProvider>
        <RouterProvider router={router} />
        <Toaster position="top-right" closeButton />
      </TooltipProvider>
    </ThemeProvider>
  );
}
