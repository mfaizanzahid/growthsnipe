import { useCallback, useEffect, useState } from "react";
import { authClient, useSession } from "../lib/auth-client";
import { useBillingRevision } from "../lib/billing-events";

export interface Org {
  id: string;
  name: string;
  slug?: string | null;
}

interface Me {
  user: { id: string; email: string; name: string | null };
  superadmin: boolean;
  defaultOrgId: string | null;
}

/** Workspace access state as reported by the member-readable membership probe. */
export interface OrgAccessInfo {
  state: "trial" | "active" | "expired" | "none";
  /** Raw subscription status (`trialing`, `past_due`, `trial_expired`, …) or null. */
  status: string | null;
  trialEndsAt: number | null;
  proTier: boolean;
}

/**
 * Active-organization state.
 * - Loads orgs, session-active org, and the user's persistent default.
 * - On login with no active org, activates default → first-created org.
 * - Switching saves to the session (server-side via setActive).
 */
export function useActiveOrg() {
  const { data: session, isPending: sessionPending } = useSession();
  const { data: orgs, isPending: orgsPending, refetch: refetchOrgs } = authClient.useListOrganizations();
  const { data: activeOrg, refetch: refetchActive } = authClient.useActiveOrganization();
  const [me, setMe] = useState<Me | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [access, setAccess] = useState<OrgAccessInfo | null>(null);
  const [initializing, setInitializing] = useState(true);
  /**
   * Whether the profile probe has settled. The superadmin flag lives here,
   * and it is what decides whether a user without a workspace must onboard.
   * Until it is known, "no workspace" cannot be acted on - a superadmin has
   * no workspace by design, so redirecting on that signal alone would bounce
   * them between the app shell and the wizard forever.
   */
  const [meLoaded, setMeLoaded] = useState(false);
  // Re-read access after a payment/subscribe/plan change, otherwise the gate
  // keeps the stale trial state until a manual refresh.
  const billingRevision = useBillingRevision();

  const refreshMe = useCallback(async () => {
    try {
      const res = await fetch("/api/me");
      if (res.ok) setMe((await res.json()) as Me);
    } catch {
      // nav degrades gracefully without profile data
    } finally {
      setMeLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refreshMe();
  }, [refreshMe, session?.user?.id]);

  // Auto-select on login: default org, else first org, when none is active.
  useEffect(() => {
    if (sessionPending || orgsPending) return;
    if (!session?.user) {
      setInitializing(false);
      return;
    }
    if (activeOrg?.id || !orgs || orgs.length === 0) {
      setInitializing(false);
      return;
    }
    const fallback =
      (me?.defaultOrgId && orgs.some((o) => o.id === me.defaultOrgId) ? me.defaultOrgId : null) ??
      orgs[0]!.id;
    authClient.organization
      .setActive({ organizationId: fallback })
      .then(() => refetchActive())
      .catch(() => undefined)
      .finally(() => setInitializing(false));
  }, [sessionPending, orgsPending, session?.user, activeOrg?.id, orgs, me?.defaultOrgId, refetchActive]);

  useEffect(() => {
    if (!activeOrg?.id) {
      setRole(null);
      setAccess(null);
      return;
    }
    fetch(`/api/orgs/${activeOrg.id}/membership`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const data = d as { role?: string; access?: OrgAccessInfo | null } | null;
        setRole(data?.role ?? null);
        setAccess(data?.access ?? null);
      })
      .catch(() => {
        setRole(null);
        setAccess(null);
      });
  }, [activeOrg?.id, billingRevision]);

  const switchOrg = useCallback(
    async (organizationId: string) => {
      await authClient.organization.setActive({ organizationId });
      await refetchActive();
      setRole(null);
      setAccess(null);
    },
    [refetchActive],
  );

  const makeDefault = useCallback(async (organizationId: string) => {
    const res = await fetch("/api/me/default-org", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId: organizationId }),
    });
    if (!res.ok) throw new Error("Could not save default organization");
    await refreshMe();
  }, [refreshMe]);

  return {
    orgs: (orgs ?? []) as Org[],
    activeOrg: (activeOrg ?? null) as Org | null,
    activeOrgId: activeOrg?.id ?? null,
    role,
    access,
    superadmin: me?.superadmin ?? false,
    defaultOrgId: me?.defaultOrgId ?? null,
    email: session?.user?.email ?? me?.user.email ?? "",
    userName: session?.user?.name ?? me?.user.name ?? "",
    // The profile probe is part of "loading": until it settles we do not know
    // whether the user is a superadmin, so we must not treat "no workspace"
    // as "needs onboarding".
    loading: sessionPending || orgsPending || initializing || !meLoaded,
    switchOrg,
    makeDefault,
    refresh: () => {
      void refetchOrgs();
      void refetchActive();
      void refreshMe();
    },
  };
}
