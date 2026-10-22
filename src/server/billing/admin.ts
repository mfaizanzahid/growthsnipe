import type { Env } from "../types";
import { nowSec } from "../lib/time";
import { withIdem, requestHashFor, DuplicateIdempotencyError, type IdempotencyBackend } from "../lib/idempotency";
import type { BillingStore, PlanRow, CouponRow } from "../repositories/billing";
import { collectionOrder, resolveMethodToken, setPrimary } from "./methods";
import { decryptCustomerToken } from "./customers";
import {
  sendChargeReceipt,
  sendPaymentFailed,
  sendRefundNotice,
} from "./mail";
import { invitationEmail, sendEmail /*, superadminBcc */ } from "../lib/email";
import { validateCoupon } from "./coupons";
import { BillingError } from "./errors";
import type { Gateway } from "./gateway";

export const MAX_ACTIVE_PLANS = 4;

/* Clients */

export interface ClientSummary {
  orgId: string;
  name: string;
  slug: string | null;
  ownerEmail: string | null;
  subscriptionStatus: string | null;
  openAmountMinor: number;
}

export async function listClients(store: BillingStore): Promise<ClientSummary[]> {
  const orgs = await store.listOrganizations();
  const out: ClientSummary[] = [];
  for (const org of orgs) {
    const [members, sub, invoices] = await Promise.all([
      store.listOrgMembers(org.id),
      store.getOrgSubscription(org.id),
      store.listInvoicesForOrg(org.id),
    ]);
    const owner = members.find((m) => m.role === "admin") ?? members[0] ?? null;
    const open = invoices
      .filter((i) => i.status === "due" || i.status === "failed")
      .reduce((sum, i) => sum + i.amountMinor, 0);
    out.push({
      orgId: org.id,
      name: org.name,
      slug: org.slug,
      ownerEmail: owner?.email ?? null,
      subscriptionStatus: sub?.status ?? null,
      openAmountMinor: open,
    });
  }
  return out;
}

export async function getClientDetail(store: BillingStore, orgId: string) {
  const org = await store.getOrganization(orgId);
  if (!org) throw new BillingError("Organization not found", 404);
  const [members, sub, invoices, methods] = await Promise.all([
    store.listOrgMembers(orgId),
    store.getOrgSubscription(orgId),
    store.listInvoicesForOrg(orgId),
    store.listPaymentMethods(orgId),
  ]);
  const plan = sub ? await store.getPlan(sub.planId) : null;
  return {
    org,
    members: members.map((m) => ({ id: m.id, userId: m.userId, email: m.email, name: m.name, role: m.role, status: m.status })),
    subscription: sub,
    plan,
    invoices: invoices.map((i) => ({
      id: i.id,
      number: i.number,
      type: i.type,
      status: i.status,
      amountMinor: i.amountMinor,
      currency: i.currency,
      description: i.description,
    })),
    methods: methods.map((m) => ({
      id: m.id,
      brand: m.brand,
      last4: m.last4,
      expiryMonth: m.expiryMonth,
      expiryYear: m.expiryYear,
      isDefault: m.isDefault === 1,
      status: m.status,
    })),
  };
}

/* Usage charges (charge now) */

export interface UsageChargeInput {
  orgId: string;
  amountMinor: number;
  currency?: string;
  description: string;
  createdBy: string;
  idempotencyKey?: string | null;
  recipientEmails: string[];
  /** Superadmin actor email for the audit trail. */
  actorEmail?: string | null;
}

export async function createUsageCharge(
  env: Env,
  store: BillingStore,
  idem: IdempotencyBackend,
  gateway: Gateway,
  input: UsageChargeInput,
  now = nowSec(),
): Promise<{ cached: boolean; result: { invoiceId: string; invoiceNumber: string; chargeId: string | null } }> {
  const amountMinor = Math.floor(input.amountMinor);
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
    throw new BillingError("Amount must be positive", 422);
  }
  if (!input.description?.trim()) throw new BillingError("Description is required", 422);
  const currency = (input.currency ?? "USD").toUpperCase();
  if (currency !== "USD") throw new BillingError("Only USD billing is supported", 422);
  const org = await store.getOrganization(input.orgId);
  if (!org) throw new BillingError("Organization not found", 404);

  const window = Math.floor(now / 300);
  const key =
    input.idempotencyKey ??
    `usage:${input.orgId}:${amountMinor}:${await requestHashFor(input.description)}:${window}`;
  const hash = await requestHashFor({
    orgId: input.orgId,
    amountMinor,
    currency,
    description: input.description,
  });
  const actorNote = input.actorEmail ? ` — by ${input.actorEmail} (superadmin)` : "";

  try {
    return await withIdem(idem, key, hash, "usage-charge", async () => {
      const invoice = await store.createInvoice(
        {
          id: crypto.randomUUID(),
          orgId: input.orgId,
          type: "usage",
          status: "due",
          amountMinor,
          currency,
          description: input.description,
          idempotencyKey: key,
          dueAt: now,
          createdBy: input.createdBy,
        },
        [{ description: input.description, amountMinor }],
        now,
      );

      const customerToken = await decryptCustomerToken(env, store, input.orgId);
      const methods = await collectionOrder(store, input.orgId);
      let collected: { tracker: string; chargeId: string } | null = null;
      if (customerToken && methods.length > 0) {
        for (const method of methods) {
          let token: string;
          try {
            token = await resolveMethodToken(env, method);
          } catch {
            await store.updatePaymentMethod(method.id, { status: "failed" });
            continue;
          }
          try {
            collected = await gateway.chargeSavedCard({
              customerToken,
              merchantApiKey: env.SAFEPAY_PUBLIC_KEY,
              paymentMethodToken: token,
              currency,
              amountMinor,
            });
            await store.updatePaymentMethod(method.id, { status: "active" });
            if (method.isDefault !== 1) await setPrimary(store, input.orgId, method.id);
            break;
          } catch {
            await store.updatePaymentMethod(method.id, { status: "failed" });
            await store.insertTransaction({
              orgId: input.orgId,
              invoiceId: invoice.id,
              kind: "usage_charge",
              status: "failed",
              amountMinor,
              currency,
              description: `${input.description}${actorNote}`,
            });
          }
        }
      }

      if (!collected) {
        await store.updateInvoice(invoice.id, { status: "failed" });
        await sendPaymentFailed(env, store, input.recipientEmails, {
          invoiceNumber: invoice.number ?? invoice.id,
          amountMinor,
          currency,
          attempt: methods.length === 0 ? "no valid payment method" : "all payment methods failed",
        });
        throw new BillingError("Usage charge failed on all methods", 402);
      }

      await store.insertTransaction({
        orgId: input.orgId,
        invoiceId: invoice.id,
        tracker: collected.tracker,
        chargeId: collected.chargeId,
        kind: "usage_charge",
        status: "succeeded",
        amountMinor,
        currency,
        description: `${input.description}${actorNote}`,
      });
      await store.updateInvoice(invoice.id, {
        status: "paid",
        tracker: collected.tracker,
        chargeId: collected.chargeId,
        paidAt: now,
      });
      await sendChargeReceipt(env, store, input.recipientEmails, {
        invoiceNumber: invoice.number ?? invoice.id,
        amountMinor,
        currency,
        planName: "Usage charge",
      });
      return {
        invoiceId: invoice.id,
        invoiceNumber: invoice.number ?? invoice.id,
        chargeId: collected.chargeId,
      };
    });
  } catch (err) {
    if (err instanceof DuplicateIdempotencyError) {
      throw new BillingError("Duplicate request — already processing", 429);
    }
    throw err;
  }
}

/**
 * Suspend or reactivate a member. Never suspends the last active admin.
 * Manual suspensions are marked admin so plan upgrades never auto-restore
 * them; manual reactivation clears the marker.
 */export async function setMemberAccess(
  store: BillingStore,
  orgId: string,
  memberId: string,
  status: "active" | "suspended",
): Promise<void> {
  const members = await store.listOrgMembers(orgId);
  const target = members.find((m) => m.id === memberId);
  if (!target) throw new BillingError("Member not found", 404);
  if (status === "suspended" && target.role === "admin") {
    const activeAdmins = members.filter((m) => m.role === "admin" && m.status === "active");
    if (activeAdmins.length <= 1) {
      throw new BillingError("Cannot suspend the last active admin", 409);
    }
  }
  const ok = await store.setMemberStatus(orgId, memberId, status, status === "suspended" ? "admin" : null);
  if (!ok) throw new BillingError("Member not found", 404);
}

/**
 * Superadmin member management (bypasses the org plugin, which requires
 * org membership the superadmin doesn't have). Invitations land in the same
 * table, so invitees accept through the standard plugin flow.
 */
export async function inviteOrgMember(
  env: Env,
  store: BillingStore,
  input: {
    orgId: string;
    email: string;
    role: string;
    inviterUserId: string;
  },
): Promise<{ invitationId: string }> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BillingError("Invalid email", 422);
  if (!["admin", "user", "viewer"].includes(input.role)) {
    throw new BillingError("Role must be admin, user, or viewer", 422);
  }
  const org = await store.getOrganization(input.orgId);
  if (!org) throw new BillingError("Organization not found", 404);
  const members = await store.listOrgMembers(input.orgId);
  if (members.some((m) => m.email.toLowerCase() === email)) {
    throw new BillingError("User is already a member", 409);
  }
  const invitationId = crypto.randomUUID();
  await store.createInvitation({
    id: invitationId,
    orgId: input.orgId,
    email,
    role: input.role,
    inviterId: input.inviterUserId,
  });
  const settings = await store.getAllSettings();
  // Member invitations are auth emails: Resend (Brevo is billing-only + signup list).
  await sendEmail(
    env.RESEND_API_KEY,
    {
      ...invitationEmail(
        email,
        org.name,
        `${env.APP_BASE_URL}/accept-invitation/${invitationId}`,
        settings.support_email ?? "",
      ),
      // bcc: superadminBcc(env, email),
    },
    env.RESEND_FROM_EMAIL,
  );
  return { invitationId };
}

export async function updateOrgMemberRole(
  store: BillingStore,
  orgId: string,
  memberId: string,
  role: string,
): Promise<void> {
  if (!["admin", "user", "viewer"].includes(role)) {
    throw new BillingError("Role must be admin, user, or viewer", 422);
  }
  const members = await store.listOrgMembers(orgId);
  const target = members.find((m) => m.id === memberId);
  if (!target) throw new BillingError("Member not found", 404);
  if (target.role === "admin" && role !== "admin") {
    const activeAdmins = members.filter((m) => m.role === "admin" && m.status === "active");
    if (activeAdmins.length <= 1) {
      throw new BillingError("Cannot demote the last active admin", 409);
    }
  }
  await store.setMemberRole(orgId, memberId, role);
}

export async function removeOrgMember(
  store: BillingStore,
  orgId: string,
  memberId: string,
): Promise<void> {
  const members = await store.listOrgMembers(orgId);
  const target = members.find((m) => m.id === memberId);
  if (!target) throw new BillingError("Member not found", 404);
  if (target.role === "admin") {
    const activeAdmins = members.filter((m) => m.role === "admin" && m.status === "active");
    if (activeAdmins.length <= 1) {
      throw new BillingError("Cannot remove the last active admin", 409);
    }
  }
  await store.deleteMember(orgId, memberId);
}

/**
 * Delete a client workspace and all its data. Blocked while a billable
 * subscription exists (active/trialing/scheduled/past_due) — cancel it first.
 */
export async function deleteClient(store: BillingStore, orgId: string): Promise<{ orgId: string }> {
  const org = await store.getOrganization(orgId);
  if (!org) throw new BillingError("Organization not found", 404);
  const sub = await store.getOrgSubscription(orgId);
  if (sub) {
    throw new BillingError("Cancel the subscription before deleting this client", 409);
  }
  await store.deleteOrganization(orgId);
  return { orgId };
}

/* Refunds (superadmin-only, full or partial, no credits) */

export async function refundInvoice(
  env: Env,
  store: BillingStore,
  gateway: Gateway,
  input: { invoiceId: string; amountMinor?: number | null; recipientEmails: string[]; actorEmail?: string | null },
): Promise<{ refundId?: string; refundedMinor: number; invoiceStatus: string }> {
  const invoice = await store.getInvoiceByNumberOrId(input.invoiceId);
  if (!invoice) throw new BillingError("Invoice not found", 404);
  if (invoice.status !== "paid") throw new BillingError("Only paid invoices can be refunded", 422);
  if (!invoice.tracker) throw new BillingError("Invoice has no gateway reference", 422);
  const target =
    input.amountMinor === undefined || input.amountMinor === null
      ? invoice.amountMinor
      : Math.floor(input.amountMinor);
  if (!Number.isFinite(target) || target <= 0 || target > invoice.amountMinor) {
    throw new BillingError("Refund amount is invalid", 422);
  }
  const result = await gateway.refund({
    gatewayTracker: invoice.tracker,
    amountMinor: target,
    currency: invoice.currency,
  });
  const actorNote = input.actorEmail ? ` — by ${input.actorEmail} (superadmin)` : "";
  await store.insertTransaction({
    orgId: invoice.orgId,
    invoiceId: invoice.id,
    tracker: invoice.tracker,
    chargeId: result.refundId ?? null,
    kind: "refund",
    status: "succeeded",
    amountMinor: -target,
    currency: invoice.currency,
    description: `Refund — ${invoice.number ?? invoice.id}${actorNote}`,
  });
  const full = target >= invoice.amountMinor;
  if (full) {
    await store.updateInvoice(invoice.id, { status: "refunded" });
  }
  await sendRefundNotice(env, store, input.recipientEmails, {
    invoiceNumber: invoice.number ?? invoice.id,
    amountMinor: target,
    currency: invoice.currency,
    full,
  });
  return { refundId: result.refundId, refundedMinor: target, invoiceStatus: full ? "refunded" : "paid" };
}

/* Plans */

export interface PlanInput {
  name: string;
  monthlyMinor: number;
  annualMinor: number;
  setupFeeMinor: number;
  trialPeriodDays?: number | null;
  description?: string | null;
  sortOrder?: number | null;
  active?: number | null;
  maxUsers?: number | null;
  allowBriefings?: number | null;
  /** 1 = displayed but not purchasable (contact sales). */
  contactOnly?: number | null;
  /** Comma-separated feature bullets (single source of truth for pricing + billing). */
  features?: string | null;
}

function validatePlanInput(input: PlanInput): void {
  if (!input.name?.trim() || input.name.length > 80) throw new BillingError("Plan name is required", 422);
  for (const [k, v] of [
    ["monthlyMinor", input.monthlyMinor],
    ["annualMinor", input.annualMinor],
    ["setupFeeMinor", input.setupFeeMinor],
  ] as const) {
    if (!Number.isInteger(v) || v < 0) throw new BillingError(`${k} must be a non-negative integer`, 422);
  }
  // Trial-first model: plans carry no setup fee and no plan-level trial.
  if (input.setupFeeMinor !== 0) {
    throw new BillingError("setupFeeMinor must be 0 — plans have no setup fee", 422);
  }
  if (input.trialPeriodDays !== undefined && input.trialPeriodDays !== null && input.trialPeriodDays !== 0) {
    throw new BillingError("trialPeriodDays must be 0 — trials are subscription-level", 422);
  }
  if (input.maxUsers !== undefined && input.maxUsers !== null) {
    if (!Number.isInteger(input.maxUsers) || input.maxUsers < 1) {
      throw new BillingError("maxUsers must be a positive integer or null (unlimited)", 422);
    }
  }
  if (input.allowBriefings !== undefined && input.allowBriefings !== null && input.allowBriefings !== 0 && input.allowBriefings !== 1) {
    throw new BillingError("allowBriefings must be 0 or 1", 422);
  }
  if (input.contactOnly !== undefined && input.contactOnly !== null && input.contactOnly !== 0 && input.contactOnly !== 1) {
    throw new BillingError("contactOnly must be 0 or 1", 422);
  }
  if (input.features !== undefined && input.features !== null) {
    if (typeof input.features !== "string" || input.features.length > 2000) {
      throw new BillingError("features must be a comma-separated string up to 2000 characters", 422);
    }
  }
}

export async function createPlan(store: BillingStore, input: PlanInput): Promise<PlanRow> {
  validatePlanInput(input);
  if ((input.active ?? 1) === 1 && (await store.countActivePlans()) >= MAX_ACTIVE_PLANS) {
    throw new BillingError(`At most ${MAX_ACTIVE_PLANS} active plans are allowed`, 422);
  }
  return store.insertPlan({
    id: `plan_${Math.random().toString(36).slice(2, 10)}`,
    name: input.name.trim(),
    monthlyMinor: input.monthlyMinor,
    annualMinor: input.annualMinor,
    // Trial-first model: no setup fees, no plan-level trials.
    setupFeeMinor: 0,
    trialPeriodDays: 0,
    description: input.description ?? null,
    sortOrder: input.sortOrder ?? 0,
    currency: "USD",
    active: input.active ?? 1,
    maxUsers: input.maxUsers ?? null,
    allowBriefings: input.allowBriefings ?? 1,
    contactOnly: input.contactOnly ?? 0,
    features: input.features ?? null,
  });
}

export async function updatePlan(
  store: BillingStore,
  id: string,
  patch: Partial<PlanInput & { active: number }>,
): Promise<PlanRow> {
  const plan = await store.getPlan(id);
  if (!plan) throw new BillingError("Plan not found", 404);
  if (patch.active === 1 && plan.active !== 1 && (await store.countActivePlans()) >= MAX_ACTIVE_PLANS) {
    throw new BillingError(`At most ${MAX_ACTIVE_PLANS} active plans are allowed`, 422);
  }
  if (patch.name !== undefined && (!patch.name.trim() || patch.name.length > 80)) {
    throw new BillingError("Plan name is required", 422);
  }
  if (patch.features !== undefined && patch.features !== null) {
    if (typeof patch.features !== "string" || patch.features.length > 2000) {
      throw new BillingError("features must be a comma-separated string up to 2000 characters", 422);
    }
  }
  await store.updatePlan(id, {
    ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
    ...(patch.monthlyMinor !== undefined ? { monthlyMinor: patch.monthlyMinor } : {}),
    ...(patch.annualMinor !== undefined ? { annualMinor: patch.annualMinor } : {}),
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    ...(patch.sortOrder !== undefined && patch.sortOrder !== null ? { sortOrder: patch.sortOrder } : {}),
    ...(patch.active !== undefined ? { active: patch.active } : {}),
    ...(patch.maxUsers !== undefined ? { maxUsers: patch.maxUsers } : {}),
    ...(patch.allowBriefings !== undefined && patch.allowBriefings !== null
      ? { allowBriefings: patch.allowBriefings }
      : {}),
    ...(patch.contactOnly !== undefined && patch.contactOnly !== null
      ? { contactOnly: patch.contactOnly }
      : {}),
    ...(patch.features !== undefined ? { features: patch.features } : {}),
  });
  const updated = await store.getPlan(id);
  return updated!;
}

export async function deletePlan(store: BillingStore, id: string): Promise<void> {
  const plan = await store.getPlan(id);
  if (!plan) throw new BillingError("Plan not found", 404);
  if ((await store.countSubscriptionsForPlan(id)) > 0) {
    throw new BillingError("Plan has subscriptions and cannot be deleted — archive it instead", 409);
  }
  await store.deletePlan(id);
}

/* Coupons */

export interface CouponInput {
  code: string;
  kind: "percent" | "fixed";
  percentOff?: number | null;
  amountOffMinor?: number | null;
  duration?: "once" | "repeating" | "forever";
  durationCycles?: number | null;
  appliesToSetup?: number | null;
  planIds?: string[];
  maxRedemptions?: number | null;
  validFrom?: number | null;
  validUntil?: number | null;
}

function validateCouponInput(input: CouponInput): void {
  if (!/^[A-Z0-9][A-Z0-9_-]*$/.test(input.code)) {
    throw new BillingError("Code must be uppercase alphanumeric (dashes/underscores allowed)", 422);
  }
  if (input.kind !== "percent" && input.kind !== "fixed") {
    throw new BillingError("kind must be percent or fixed", 422);
  }
  if (input.kind === "percent") {
    if (!Number.isInteger(input.percentOff) || (input.percentOff ?? 0) < 1 || (input.percentOff ?? 0) > 100) {
      throw new BillingError("percentOff must be 1-100", 422);
    }
  } else if (!Number.isInteger(input.amountOffMinor) || (input.amountOffMinor ?? 0) <= 0) {
    throw new BillingError("amountOffMinor must be positive", 422);
  }
  const duration = input.duration ?? "once";
  if (!["once", "repeating", "forever"].includes(duration)) {
    throw new BillingError("duration must be once, repeating, or forever", 422);
  }
  if (duration === "repeating" && (!Number.isInteger(input.durationCycles) || (input.durationCycles ?? 0) <= 0)) {
    throw new BillingError("durationCycles is required for repeating coupons", 422);
  }
  if (input.maxRedemptions !== undefined && input.maxRedemptions !== null && (!Number.isInteger(input.maxRedemptions) || input.maxRedemptions <= 0)) {
    throw new BillingError("maxRedemptions must be positive", 422);
  }
}

export async function createCoupon(
  store: BillingStore,
  input: CouponInput,
  createdBy: string,
): Promise<CouponRow> {
  const code = input.code.trim().toUpperCase();
  validateCouponInput({ ...input, code });
  if (await store.getCouponByCode(code)) throw new BillingError("Code is already in use", 409);
  const planIds = input.planIds ?? [];
  for (const planId of planIds) {
    if (!(await store.getPlan(planId))) throw new BillingError(`Unknown plan: ${planId}`, 422);
  }
  const coupon = await store.insertCoupon({
    id: `cpn_${Math.random().toString(36).slice(2, 10)}`,
    code,
    kind: input.kind,
    percentOff: input.kind === "percent" ? (input.percentOff as number) : null,
    amountOffMinor: input.kind === "fixed" ? (input.amountOffMinor as number) : null,
    currency: "USD",
    duration: input.duration ?? "once",
    durationCycles: input.duration === "repeating" ? (input.durationCycles as number) : null,
    appliesToSetup: input.appliesToSetup ?? 0,
    maxRedemptions: input.maxRedemptions ?? null,
    redeemedCount: 0,
    validFrom: input.validFrom ?? null,
    validUntil: input.validUntil ?? null,
    active: 1,
    createdBy,
  });
  await store.setCouponPlans(coupon.id, planIds);
  return coupon;
}

export async function updateCoupon(
  store: BillingStore,
  id: string,
  patch: Partial<Pick<CouponRow, "active" | "maxRedemptions" | "validFrom" | "validUntil" | "durationCycles">>,
): Promise<CouponRow> {
  const coupon = await store.getCouponById(id);
  if (!coupon) throw new BillingError("Coupon not found", 404);
  await store.updateCoupon(id, patch);
  return (await store.getCouponById(id))!;
}

/** Superadmin explicitly assigns a coupon to a subscription (replaces existing). */
export async function attachCoupon(
  store: BillingStore,
  subscriptionId: string,
  code: string,
  planId: string,
  now = nowSec(),
): Promise<void> {
  const { coupon } = await validateCoupon(store, code, planId, now);
  const existing = await store.activeSubscriptionCoupon(subscriptionId);
  if (existing) {
    await store.advanceSubscriptionCoupon(existing.id, existing.cyclesApplied, "removed");
  }
  await store.attachSubscriptionCoupon(subscriptionId, coupon.id);
  await store.bumpCouponRedemptions(coupon.id);
}
