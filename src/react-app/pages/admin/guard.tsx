import { useEffect, useState } from "react";
import { Card, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Skeleton } from "../../components/ui/skeleton";
import { api } from "../../components/billing/shared";

/**
 * Superadmin gate for admin routes. Probes a superadmin-only endpoint;
 * renders a denial card for non-admins instead of the page.
 */
export function useAdminGuard(): boolean | null {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => {
    api("/api/superadmin/settings")
      .then(() => setAllowed(true))
      .catch(() => setAllowed(false));
  }, []);
  return allowed;
}

export function AdminLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

export function AdminDenied() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Superadmin only</CardTitle>
        <CardDescription>Your account does not have platform access.</CardDescription>
      </CardHeader>
    </Card>
  );
}
