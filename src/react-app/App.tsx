import { useEffect } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "./components/ui/tooltip";
import { Toaster } from "./components/ui/sonner";
import { Protected } from "./components/Protected";
import { AppShell } from "./components/shell/AppShell";
import { Login } from "./pages/Login";
import { Signup } from "./pages/Signup";
import { MagicLink } from "./pages/MagicLink";
import { ForgotPassword } from "./pages/ForgotPassword";
import { ResetPassword } from "./pages/ResetPassword";
import { VerifyEmail } from "./pages/VerifyEmail";
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
  { path: "/signup", element: <Signup /> },
  { path: "/magic", element: <MagicLink /> },
  { path: "/forgot-password", element: <ForgotPassword /> },
  { path: "/reset-password", element: <ResetPassword /> },
  { path: "/verify-email", element: <VerifyEmail /> },
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
