import type { PlanRow } from "../repositories/billing";

/** Minimal surface for plan-limit enforcement (stores satisfy it). */
export interface LimitsDeps {
  getPlan(id: string): Promise<Pick<PlanRow, "maxUsers" | "allowBriefings"> | null>;
  listMembers(orgId: string): Promise<Array<{ id: string; role: string; status: string; suspendedBy: string | null; createdAt: number | Date }>>;
  setMemberStatus(orgId: string, memberId: string, status: "active" | "suspended", suspendedBy?: string | null): Promise<unknown>;
  listSchedules(orgId: string): Promise<Array<{ id: string; enabled: boolean }>>;
  updateSchedule(id: string, orgId: string, patch: { enabled: boolean }): Promise<unknown>;
}

/**
 * Enforce a plan's limits right after subscribing or changing to it:
 * - maxUsers: suspend active members beyond the cap (oldest stays; the last
 *   active admin is never suspended), marked plan_limits.
 * - reactivate (subscribe + upgrade only): fill free seats by reactivating
 *   plan_limits-suspended members oldest-first — unlimited plans restore
 *   everyone. Admin-suspended and legacy unmarked members are never
 *   auto-restored (fail closed). Downgrades never reactivate.
 * - allowBriefings = 0: disable all enabled briefing schedules.
 */
export async function enforcePlanLimits(
  deps: LimitsDeps,
  orgId: string,
  planId: string,
  opts: { reactivate?: boolean } = {},
): Promise<void> {
  const plan = await deps.getPlan(planId);
  if (!plan) return;

  if (plan.maxUsers != null) {
    const actives = (await deps.listMembers(orgId))
      .filter((m) => (m.status ?? "active") === "active")
      .sort((a, b) => Number(a.createdAt) - Number(b.createdAt));
    if (actives.length > plan.maxUsers) {
      const admins = actives.filter((m) => m.role === "admin");
      const keep = admins.length > 0 ? admins[0]! : actives[0]!;
      for (const m of actives) {
        if (m.id === keep.id) continue;
        // Never leave the org without an active admin.
        if (m.role === "admin" && admins.filter((a) => a.id !== m.id).length === 0 && keep.role !== "admin") continue;
        await deps.setMemberStatus(orgId, m.id, "suspended", "plan_limits");
      }
    }
  }

  if (opts.reactivate) {
    const current = await deps.listMembers(orgId);
    const autoSuspended = current.filter(
      (m) => (m.status ?? "active") !== "active" && (m.suspendedBy ?? null) === "plan_limits",
    );
    if (autoSuspended.length > 0) {
      const activeNow = current.filter((m) => (m.status ?? "active") === "active").length;
      const room =
        plan.maxUsers == null ? autoSuspended.length : Math.max(0, plan.maxUsers - activeNow);
      const restore = autoSuspended
        .sort((a, b) => Number(a.createdAt) - Number(b.createdAt))
        .slice(0, room);
      for (const m of restore) {
        await deps.setMemberStatus(orgId, m.id, "active", null);
      }
    }
  }

  if ((plan.allowBriefings ?? 1) === 0) {
    const schedules = await deps.listSchedules(orgId);
    for (const s of schedules) {
      if (s.enabled) await deps.updateSchedule(s.id, orgId, { enabled: false });
    }
  }
}
