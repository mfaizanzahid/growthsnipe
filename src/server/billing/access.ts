import type { PlanRow, SubscriptionRow } from "../repositories/billing";
import { nowSec } from "../lib/time";

/** Pro-trial length for a first organization (days). No card required. */
export const TRIAL_DAYS = 30;

/** The plan every trial runs on (Pro tier). */
export const TRIAL_PLAN_ID = "pro";

/** Trial reminder offsets, in days relative to trial end (negative = before). */
export const TRIAL_REMINDER_OFFSETS = [-5, -3, 0, 3, 5] as const;

/**
 * A trial the customer subscribed to DURING the trial window: the first
 * period is already paid, the row still carries the trial end, and the paid
 * plan takes over from there.
 */
export function isPrepaidTrial(sub: {
  trialPrepaid?: number | null;
  trialEndsAt?: number | null;
}): boolean {
  return (sub.trialPrepaid ?? 0) === 1 && sub.trialEndsAt != null;
}

/** Minimal surface for access decisions (BillingStore satisfies it). */
export interface OrgReader {
  getAnySubscription(orgId: string): Promise<SubscriptionRow | null>;
  getPlan(id: string): Promise<PlanRow | null>;
  listUserOrgs(userId: string): Promise<Array<{ id: string; createdAt: number | Date }>>;
  listOrgMembers(orgId: string): Promise<Array<{ role: string; status: string }>>;
}

export type AccessState = "trial" | "active" | "expired" | "none";

export interface OrgAccess {
  state: AccessState;
  planId: string | null;
  /** Days of Pro trial remaining (trial state only). */
  trialDaysLeft?: number;
  trialEndsAt?: number | null;
  /** Plan limits (trial counts as unlimited Pro). */
  maxUsers: number | null;
  allowBriefings: boolean;
}

/**
 * Subscription access for feature gating. Trialing counts as full (Pro-tier)
 * access until trial_ends_at; canceled keeps access until nextCharge; every
 * other non-active status (past_due, trial_expired, expired, …) is gated.
 *
 * A prepaid trial (subscribed during the trial) is resolved here rather than
 * waiting for the daily Cron: the trial tier applies until trial_ends_at and
 * the paid plan takes over from there, so a paying customer is never locked
 * out waiting for the flip.
 */
export async function orgAccess(store: OrgReader, orgId: string, now = nowSec()): Promise<OrgAccess> {
  const sub = await store.getAnySubscription(orgId);
  if (!sub) return { state: "none", planId: null, maxUsers: null, allowBriefings: false };
  if (isPrepaidTrial(sub)) {
    const trialEndsAt = sub.trialEndsAt as number;
    if (now <= trialEndsAt) {
      return {
        state: "trial",
        planId: TRIAL_PLAN_ID,
        trialDaysLeft: Math.max(0, Math.ceil((trialEndsAt - now) / 86400)),
        trialEndsAt,
        maxUsers: null,
        allowBriefings: true,
      };
    }
    if (sub.status === "canceled" && sub.nextCharge <= now) {
      return { state: "expired", planId: sub.planId, maxUsers: null, allowBriefings: false };
    }
    const plan = await store.getPlan(sub.planId);
    return {
      state: "active",
      planId: sub.planId,
      maxUsers: plan?.maxUsers ?? null,
      allowBriefings: (plan?.allowBriefings ?? 1) === 1,
    };
  }
  switch (sub.status) {
    case "trialing": {
      if (sub.trialEndsAt == null || now > sub.trialEndsAt) {
        return { state: "expired", planId: sub.planId, maxUsers: null, allowBriefings: false };
      }
      return {
        state: "trial",
        planId: sub.planId,
        trialDaysLeft: Math.max(0, Math.ceil((sub.trialEndsAt - now) / 86400)),
        trialEndsAt: sub.trialEndsAt,
        maxUsers: null,
        allowBriefings: true,
      };
    }
    case "active": {
      const plan = await store.getPlan(sub.planId);
      return {
        state: "active",
        planId: sub.planId,
        maxUsers: plan?.maxUsers ?? null,
        allowBriefings: (plan?.allowBriefings ?? 1) === 1,
      };
    }
    case "canceled": {
      if (sub.nextCharge > now) {
        const plan = await store.getPlan(sub.planId);
        return {
          state: "active",
          planId: sub.planId,
          maxUsers: plan?.maxUsers ?? null,
          allowBriefings: (plan?.allowBriefings ?? 1) === 1,
        };
      }
      return { state: "expired", planId: sub.planId, maxUsers: null, allowBriefings: false };
    }
    default:
      return { state: "expired", planId: sub.planId, maxUsers: null, allowBriefings: false };
  }
}

/**
 * Multi-org rule: a user may create another organization only while their
 * FIRST-created org holds an active paid subscription. No second orgs during
 * a trial, and trial subscriptions never transfer.
 *
 * A prepaid trial counts as paid: the customer has been charged, so the
 * second workspace opens even though the plan has not started yet.
 */
export async function canCreateOrg(store: OrgReader, userId: string, now = nowSec()): Promise<{ ok: boolean; reason?: string }> {
  const orgs = await store.listUserOrgs(userId);
  const first = orgs[0];
  if (!first) return { ok: true };
  const access = await orgAccess(store, first.id, now);
  if (access.state === "active") return { ok: true };
  const sub = await store.getAnySubscription(first.id);
  if (sub && isPrepaidTrial(sub) && sub.status !== "canceled") return { ok: true };
  return {
    ok: false,
    reason:
      access.state === "trial"
        ? "Finish your trial or subscribe first — new workspaces open once the first one is on a paid plan."
        : "The first workspace must hold an active paid subscription before opening another.",
  };
}

/** Active member count for Starter cap enforcement. */
export async function activeMemberCount(store: OrgReader, orgId: string): Promise<number> {
  const members = await store.listOrgMembers(orgId);
  return members.filter((m) => (m.status ?? "active") === "active").length;
}
