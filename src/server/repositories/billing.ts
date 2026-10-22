import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import {
  couponPlans,
  coupons,
  invoiceItems,
  invoiceSequences,
  invitations,
  invoices,
  members,
  organizations,
  orgSubscriptions,
  paymentMethods,
  paymentSessions,
  plans,
  safepayCustomers,
  sessions,
  subscriptionCoupons,
  transactions,
  users,
  webhookEvents,
} from "../../../db/schema";
import type { Db } from "./db";
import { getAllSettings } from "./index";
import { nowMs } from "../lib/time";
import { formatInvoiceNumber } from "../lib/billing-math";

export type PlanRow = typeof plans.$inferSelect;
export type CouponRow = typeof coupons.$inferSelect;
export type SubscriptionRow = typeof orgSubscriptions.$inferSelect;
export type PaymentMethodRow = typeof paymentMethods.$inferSelect;
export type InvoiceRow = typeof invoices.$inferSelect;
export type TransactionRow = typeof transactions.$inferSelect;

/* Plans */

export async function getPlan(db: Db, id: string): Promise<PlanRow | null> {
  const rows = await db.select().from(plans).where(eq(plans.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function listActivePlans(db: Db): Promise<PlanRow[]> {
  return db
    .select()
    .from(plans)
    .where(eq(plans.active, 1))
    .orderBy(asc(plans.sortOrder));
}

export async function listAllPlans(db: Db): Promise<PlanRow[]> {
  return db.select().from(plans).orderBy(asc(plans.sortOrder));
}
export async function listAllCoupons(db: Db): Promise<CouponRow[]> {
  return db.select().from(coupons).orderBy(desc(coupons.createdAt));
}

/** All invoices newest-first with owning org names (superadmin console). */
export async function listAllInvoicesWithOrgs(
  db: Db,
): Promise<Array<InvoiceRow & { orgName: string | null }>> {
  const rows = await db
    .select({ invoice: invoices, orgName: organizations.name })
    .from(invoices)
    .leftJoin(organizations, eq(invoices.orgId, organizations.id))
    .orderBy(desc(invoices.createdAt));
  return rows.map((r) => ({ ...r.invoice, orgName: r.orgName }));
}

/* Coupons */

export async function getCouponByCode(db: Db, code: string): Promise<CouponRow | null> {  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;
  const rows = await db.select().from(coupons).where(eq(coupons.code, normalized)).limit(1);
  return rows[0] ?? null;
}

export async function getCouponById(db: Db, id: string): Promise<CouponRow | null> {
  const rows = await db.select().from(coupons).where(eq(coupons.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function listCouponPlans(db: Db, couponId: string): Promise<string[]> {  const rows = await db
    .select({ planId: couponPlans.planId })
    .from(couponPlans)
    .where(eq(couponPlans.couponId, couponId));
  return rows.map((r) => r.planId);
}

export async function bumpCouponRedemptions(db: Db, couponId: string): Promise<void> {
  await db
    .update(coupons)
    .set({ redeemedCount: sql`${coupons.redeemedCount} + 1`, updatedAt: nowMs() })
    .where(eq(coupons.id, couponId));
}

/* Subscriptions */

const BILLABLE = ["active", "trialing", "scheduled", "past_due"] as const;

export async function getOrgSubscription(db: Db, orgId: string): Promise<SubscriptionRow | null> {
  const rows = await db
    .select()
    .from(orgSubscriptions)
    .where(and(eq(orgSubscriptions.orgId, orgId), inArray(orgSubscriptions.status, [...BILLABLE])))
    .orderBy(desc(orgSubscriptions.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function getSubscription(db: Db, id: string): Promise<SubscriptionRow | null> {
  const rows = await db.select().from(orgSubscriptions).where(eq(orgSubscriptions.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Latest subscription regardless of status (access checks, not billing). */
export async function getAnySubscription(db: Db, orgId: string): Promise<SubscriptionRow | null> {
  const rows = await db
    .select()
    .from(orgSubscriptions)
    .where(eq(orgSubscriptions.orgId, orgId))
    .orderBy(desc(orgSubscriptions.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

/** All subscriptions, every status — for system-wide analytics. */
export async function listAllSubscriptions(db: Db): Promise<SubscriptionRow[]> {
  return db.select().from(orgSubscriptions).orderBy(desc(orgSubscriptions.createdAt));
}

export async function insertSubscription(
  db: Db,
  row: Omit<SubscriptionRow, "createdAt" | "updatedAt">,
): Promise<SubscriptionRow> {
  const now = nowMs();
  const inserted = await db
    .insert(orgSubscriptions)
    .values({ ...row, createdAt: now, updatedAt: now })
    .returning();
  return inserted[0]!;
}

export async function updateSubscription(
  db: Db,
  id: string,
  patch: Partial<Omit<SubscriptionRow, "id" | "createdAt" | "updatedAt">>,
): Promise<void> {
  await db
    .update(orgSubscriptions)
    .set({ ...patch, updatedAt: nowMs() })
    .where(eq(orgSubscriptions.id, id));
}

export async function dueSubscriptions(db: Db, nowSec: number): Promise<SubscriptionRow[]> {
  return db
    .select()
    .from(orgSubscriptions)
    .where(
      and(
        inArray(orgSubscriptions.status, ["active", "past_due"]),
        lte(orgSubscriptions.nextCharge, nowSec),
        sql`(${orgSubscriptions.totalCycles} IS NULL OR ${orgSubscriptions.cyclesCharged} < ${orgSubscriptions.totalCycles})`,
      ),
    );
}

/**
 * Subscriptions renewing in (fromSec, toSec] — for pre-renewal reminders.
 * Excludes past_due (dunning owns those) and schedules past their cycle cap.
 */
export async function upcomingSubscriptions(
  db: Db,
  fromSec: number,
  toSec: number,
): Promise<SubscriptionRow[]> {
  return db
    .select()
    .from(orgSubscriptions)
    .where(
      and(
        inArray(orgSubscriptions.status, ["active", "scheduled"]),
        sql`${orgSubscriptions.nextCharge} > ${fromSec} AND ${orgSubscriptions.nextCharge} <= ${toSec}`,
        sql`(${orgSubscriptions.totalCycles} IS NULL OR ${orgSubscriptions.cyclesCharged} < ${orgSubscriptions.totalCycles})`,
      ),
    );
}

/* Payment methods (org-scoped, default first then priority) */

export async function listPaymentMethods(db: Db, orgId: string): Promise<PaymentMethodRow[]> {
  return db
    .select()
    .from(paymentMethods)
    .where(eq(paymentMethods.orgId, orgId))
    .orderBy(desc(paymentMethods.isDefault), asc(paymentMethods.priority), asc(paymentMethods.createdAt));
}

export async function getPaymentMethod(db: Db, id: string): Promise<PaymentMethodRow | null> {
  const rows = await db.select().from(paymentMethods).where(eq(paymentMethods.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function countValidMethods(db: Db, orgId: string): Promise<number> {
  const rows = await db
    .select({ id: paymentMethods.id })
    .from(paymentMethods)
    .where(and(eq(paymentMethods.orgId, orgId), eq(paymentMethods.status, "active")));
  return rows.length;
}

export async function insertPaymentMethod(
  db: Db,
  row: Omit<PaymentMethodRow, "createdAt" | "updatedAt">,
): Promise<PaymentMethodRow> {
  const now = nowMs();
  const inserted = await db
    .insert(paymentMethods)
    .values({ ...row, createdAt: now, updatedAt: now })
    .returning();
  return inserted[0]!;
}

export async function updatePaymentMethod(
  db: Db,
  id: string,
  patch: Partial<Pick<PaymentMethodRow, "isDefault" | "priority" | "status" | "brand" | "last4" | "expiryMonth" | "expiryYear">>,
): Promise<void> {
  await db
    .update(paymentMethods)
    .set({ ...patch, updatedAt: nowMs() })
    .where(eq(paymentMethods.id, id));
}

export async function deletePaymentMethod(db: Db, id: string): Promise<void> {
  await db.delete(paymentMethods).where(eq(paymentMethods.id, id));
}

/* Safepay customer per org */

export async function getSafepayCustomerByOrg(
  db: Db,
  orgId: string,
): Promise<{ id: number; customerTokenEncrypted: string } | null> {
  const rows = await db
    .select({ id: safepayCustomers.id, customerTokenEncrypted: safepayCustomers.customerTokenEncrypted })
    .from(safepayCustomers)
    .where(eq(safepayCustomers.orgId, orgId))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertSafepayCustomerByOrg(
  db: Db,
  orgId: string,
  customerTokenEncrypted: string,
): Promise<void> {
  const now = nowMs();
  const existing = await getSafepayCustomerByOrg(db, orgId);
  if (existing) {
    await db
      .update(safepayCustomers)
      .set({ customerTokenEncrypted, updatedAt: now })
      .where(eq(safepayCustomers.id, existing.id));
  } else {
    await db
      .insert(safepayCustomers)
      .values({ orgId, customerTokenEncrypted, createdAt: now, updatedAt: now });
  }
}

/* Invoices + items + numbering */

export async function nextInvoiceNumber(db: Db, nowSec: number): Promise<string> {
  const year = new Date(nowSec * 1000).getUTCFullYear();
  await db
    .insert(invoiceSequences)
    .values({ year, lastNumber: 0 })
    .onConflictDoNothing({ target: invoiceSequences.year });
  await db
    .update(invoiceSequences)
    .set({ lastNumber: sql`${invoiceSequences.lastNumber} + 1` })
    .where(eq(invoiceSequences.year, year));
  const rows = await db
    .select()
    .from(invoiceSequences)
    .where(eq(invoiceSequences.year, year))
    .limit(1);
  return formatInvoiceNumber(year, rows[0]!.lastNumber);
}

export interface InvoiceLineInput {
  description: string;
  amountMinor: number;
  currency?: string;
}

export async function createInvoice(
  db: Db,
  header: {
    id: string;
    orgId: string;
    subscriptionId?: string | null;
    type: string;
    status?: string;
    amountMinor: number;
    currency?: string;
    description?: string | null;
    idempotencyKey?: string | null;
    tracker?: string | null;
    chargeId?: string | null;
    dueAt?: number | null;
    paidAt?: number | null;
    createdBy?: string | null;
  },
  lines: InvoiceLineInput[],
  nowSec: number,
): Promise<InvoiceRow> {
  const now = nowMs();
  const number = await nextInvoiceNumber(db, nowSec);
  const inserted = await db
    .insert(invoices)
    .values({
      ...header,
      number,
      status: header.status ?? "due",
      currency: header.currency ?? "USD",
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  const invoice = inserted[0]!;
  for (const line of lines) {
    await db.insert(invoiceItems).values({
      id: crypto.randomUUID(),
      invoiceId: invoice.id,
      description: line.description,
      amountMinor: line.amountMinor,
      currency: line.currency ?? invoice.currency,
      createdAt: now,
    });
  }
  return invoice;
}

export async function getInvoice(db: Db, id: string): Promise<InvoiceRow | null> {
  const rows = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  return rows[0] ?? null;
}
/** Resolve an invoice by UUID or human number (INV-YYYY-NNNN). Numbers are globally unique. */
export async function getInvoiceByNumberOrId(db: Db, ref: string): Promise<InvoiceRow | null> {
  const byId = await getInvoice(db, ref);
  if (byId) return byId;
  const rows = await db.select().from(invoices).where(eq(invoices.number, ref)).limit(1);
  return rows[0] ?? null;
}

/** Find the invoice carrying a gateway tracker (webhook reconciliation). */
export async function findInvoiceByTracker(db: Db, tracker: string): Promise<InvoiceRow | null> {
  const rows = await db.select().from(invoices).where(eq(invoices.tracker, tracker)).limit(1);
  return rows[0] ?? null;
}

export async function listTransactionsByTracker(db: Db, tracker: string): Promise<TransactionRow[]> {
  return db.select().from(transactions).where(eq(transactions.tracker, tracker));
}

export async function recordWebhookEvent(
  db: Db,
  row: {
    source: string;
    externalId?: string | null;
    eventType: string;
    payloadHash: string;
    payloadJsonRedacted: string;
  },
): Promise<boolean> {
  const now = nowMs();
  const inserted = await db
    .insert(webhookEvents)
    .values({ ...row, processedAt: now, createdAt: now })
    .onConflictDoNothing({ target: [webhookEvents.source, webhookEvents.externalId] })
    .returning({ id: webhookEvents.id });
  return inserted.length > 0;
}

export async function listInvoicesForOrg(db: Db, orgId: string): Promise<InvoiceRow[]> {
  return db
    .select()
    .from(invoices)
    .where(eq(invoices.orgId, orgId))
    .orderBy(desc(invoices.createdAt));
}

export async function updateInvoice(
  db: Db,
  id: string,
  patch: Partial<Pick<InvoiceRow, "status" | "tracker" | "chargeId" | "paidAt" | "reminderCount" | "lastReminderAt" | "description">>,
): Promise<void> {
  await db
    .update(invoices)
    .set({ ...patch, updatedAt: nowMs() })
    .where(eq(invoices.id, id));
}

/** Latest unpaid invoice for a subscription (period reuse: retry the same invoice). */
export async function findOpenInvoiceForSubscription(
  db: Db,
  subscriptionId: string,
): Promise<InvoiceRow | null> {
  const rows = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.subscriptionId, subscriptionId),
        inArray(invoices.status, ["due", "failed"]),
      ),
    )
    .orderBy(desc(invoices.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

/** Failed invoices eligible for dunning/retries (cap applied in service). */
export async function listFailedInvoices(db: Db): Promise<InvoiceRow[]> {
  return db.select().from(invoices).where(eq(invoices.status, "failed"));
}

/* Transactions */

export async function insertTransaction(
  db: Db,
  row: {
    id?: string;
    orgId: string;
    invoiceId?: string | null;
    paymentMethodId?: string | null;
    tracker?: string | null;
    chargeId?: string | null;
    kind: string;
    status: string;
    amountMinor: number;
    currency?: string;
    description?: string | null;
  },
): Promise<TransactionRow> {
  const now = nowMs();
  const inserted = await db
    .insert(transactions)
    .values({
      id: row.id ?? crypto.randomUUID(),
      currency: "USD",
      ...row,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return inserted[0]!;
}

/** Transactions in [fromMs, toMs] — NOTE transaction timestamps are milliseconds. */
export async function listTransactionsInRange(
  db: Db,
  fromMs: number,
  toMs: number,
): Promise<TransactionRow[]> {
  return db
    .select()
    .from(transactions)
    .where(and(gte(transactions.createdAt, fromMs), lte(transactions.createdAt, toMs)))
    .orderBy(asc(transactions.createdAt));
}

/** Most recent transaction for an invoice+method (cooldown checks). */
export async function latestTransactionFor(
  db: Db,
  invoiceId: string,
  chargeKind?: string,
): Promise<TransactionRow | null> {
  const rows = await db
    .select()
    .from(transactions)
    .where(
      chargeKind
        ? and(eq(transactions.invoiceId, invoiceId), eq(transactions.kind, chargeKind))
        : eq(transactions.invoiceId, invoiceId),
    )
    .orderBy(desc(transactions.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

/** All transactions for one invoice (auto-retry budget + gap checks). */
export async function listTransactionsForInvoice(db: Db, invoiceId: string): Promise<TransactionRow[]> {
  return db
    .select()
    .from(transactions)
    .where(eq(transactions.invoiceId, invoiceId))
    .orderBy(asc(transactions.createdAt));
}

/* Payment sessions */

export async function insertPaymentSession(
  db: Db,
  row: {
    tracker: string;
    orgId: string;
    userId?: string | null;
    amountMinor: number;
    currency?: string;
    purpose: string;
  },
): Promise<void> {
  await db.insert(paymentSessions).values({
    currency: "USD",
    status: "pending",
    ...row,
    createdAt: nowMs(),
  });
}

export async function getPaymentSession(db: Db, tracker: string) {
  const rows = await db
    .select()
    .from(paymentSessions)
    .where(eq(paymentSessions.tracker, tracker))
    .limit(1);
  return rows[0] ?? null;
}

export async function markPaymentSession(db: Db, tracker: string, status: string): Promise<void> {
  await db
    .update(paymentSessions)
    .set({ status })
    .where(eq(paymentSessions.tracker, tracker));
}

/* Subscription coupons */

export async function attachSubscriptionCoupon(
  db: Db,
  subscriptionId: string,
  couponId: string,
): Promise<void> {
  const now = nowMs();
  await db.insert(subscriptionCoupons).values({
    id: crypto.randomUUID(),
    subscriptionId,
    couponId,
    status: "active",
    cyclesApplied: 0,
    createdAt: now,
    updatedAt: now,
  });
}

export async function activeSubscriptionCoupon(db: Db, subscriptionId: string) {
  const rows = await db
    .select()
    .from(subscriptionCoupons)
    .where(
      and(
        eq(subscriptionCoupons.subscriptionId, subscriptionId),
        eq(subscriptionCoupons.status, "active"),
      ),
    )
    .orderBy(desc(subscriptionCoupons.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function advanceSubscriptionCoupon(
  db: Db,
  id: string,
  cyclesApplied: number,
  status: string,
): Promise<void> {
  await db
    .update(subscriptionCoupons)
    .set({ cyclesApplied, status, updatedAt: nowMs() })
    .where(eq(subscriptionCoupons.id, id));
}

/* Members helper for dunning recipients */

/**
 * The org's active admins - the audience for every transactional email
 * (briefings, renewals, dunning, invoices, refunds).
 *
 * Suspended admins are excluded: a suspended member cannot use the product,
 * and a manual suspension usually means the person left. An org always keeps
 * at least one active admin (plan-limit downgrades never suspend the last one
 * and manual suspension refuses to), so billing notices always reach someone.
 */
export async function listOrgAdminEmails(db: Db, orgId: string): Promise<string[]> {
  const rows = await db
    .select({ email: users.email })
    .from(members)
    .innerJoin(users, eq(members.userId, users.id))
    .where(
      and(
        eq(members.orgId, orgId),
        eq(members.role, "admin"),
        eq(members.memberStatus, "active"),
      ),
    );
  return rows.map((r) => r.email);
}

/* Superadmin reads */
export async function listOrganizations(
  db: Db,
): Promise<Array<{ id: string; name: string; slug: string | null; createdAt: number | Date }>> {
  const rows = await db
    .select({ id: organizations.id, name: organizations.name, slug: organizations.slug, createdAt: organizations.createdAt })
    .from(organizations)
    .orderBy(desc(organizations.createdAt));
  return rows;
}

/** Organizations a user belongs to, oldest first (for the first-org rule). */
export async function listUserOrgs(
  db: Db,
  userId: string,
): Promise<Array<{ id: string; createdAt: number | Date }>> {
  const rows = await db
    .select({ id: organizations.id, createdAt: organizations.createdAt })
    .from(members)
    .innerJoin(organizations, eq(members.orgId, organizations.id))
    .where(eq(members.userId, userId))
    .orderBy(asc(organizations.createdAt));
  return rows;
}

export async function getOrganization(
  db: Db,
  orgId: string,
): Promise<{ id: string; name: string; slug: string | null } | null> {
  const rows = await db
    .select({ id: organizations.id, name: organizations.name, slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Hard-delete an organization and every org-scoped row (members, invitations,
 * subscriptions + coupons, methods, gateway customers, sessions, invoices +
 * items, transactions). Clears dangling default/active-org pointers.
 * Guards (e.g. no billable subscription) are the caller's job.
 */
export async function deleteOrganization(db: Db, orgId: string): Promise<void> {
  const subIds = (
    await db
      .select({ id: orgSubscriptions.id })
      .from(orgSubscriptions)
      .where(eq(orgSubscriptions.orgId, orgId))
  ).map((r) => r.id);
  if (subIds.length > 0) {
    await db.delete(subscriptionCoupons).where(inArray(subscriptionCoupons.subscriptionId, subIds));
  }
  const invIds = (
    await db.select({ id: invoices.id }).from(invoices).where(eq(invoices.orgId, orgId))
  ).map((r) => r.id);
  if (invIds.length > 0) {
    await db.delete(invoiceItems).where(inArray(invoiceItems.invoiceId, invIds));
  }
  await db.delete(transactions).where(eq(transactions.orgId, orgId));
  await db.delete(invoices).where(eq(invoices.orgId, orgId));
  await db.delete(paymentMethods).where(eq(paymentMethods.orgId, orgId));
  await db.delete(safepayCustomers).where(eq(safepayCustomers.orgId, orgId));
  await db.delete(paymentSessions).where(eq(paymentSessions.orgId, orgId));
  await db.delete(orgSubscriptions).where(eq(orgSubscriptions.orgId, orgId));
  await db.delete(invitations).where(eq(invitations.orgId, orgId));
  await db.delete(members).where(eq(members.orgId, orgId));
  await db.update(users).set({ defaultOrgId: null }).where(eq(users.defaultOrgId, orgId));
  await db.update(sessions).set({ activeOrganizationId: null }).where(eq(sessions.activeOrganizationId, orgId));
  await db.delete(organizations).where(eq(organizations.id, orgId));
}

export async function listOrgMembers(
  db: Db,
  orgId: string,
): Promise<Array<{ id: string; userId: string; email: string; name: string | null; role: string; status: string; suspendedBy: string | null; createdAt: number | Date }>> {
  const rows = await db
    .select({ id: members.id, userId: members.userId, email: users.email, name: users.name, role: members.role, status: members.memberStatus, suspendedBy: members.suspendedBy, createdAt: members.createdAt })
    .from(members)
    .innerJoin(users, eq(members.userId, users.id))
    .where(eq(members.orgId, orgId));
  return rows;
}

/**
 * Set a member's access status (active|suspended). Returns false when unknown.
 * suspendedBy records provenance (plan_limits | admin | null); undefined
 * leaves the existing marker untouched.
 */
export async function setMemberStatus(  db: Db,
  orgId: string,
  memberId: string,
  status: "active" | "suspended",
  suspendedBy?: string | null,
): Promise<boolean> {
  const existing = await db
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.id, memberId), eq(members.orgId, orgId)))
    .limit(1);
  if (existing.length === 0) return false;
  await db
    .update(members)
    .set(suspendedBy === undefined ? { memberStatus: status } : { memberStatus: status, suspendedBy })
    .where(eq(members.id, memberId));
  return true;
}

export async function setMemberRole(
  db: Db,
  orgId: string,
  memberId: string,
  role: string,
): Promise<boolean> {
  const existing = await db
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.id, memberId), eq(members.orgId, orgId)))
    .limit(1);
  if (existing.length === 0) return false;
  await db.update(members).set({ role }).where(eq(members.id, memberId));
  return true;
}

export async function deleteMember(db: Db, orgId: string, memberId: string): Promise<boolean> {
  const existing = await db
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.id, memberId), eq(members.orgId, orgId)))
    .limit(1);
  if (existing.length === 0) return false;
  await db.delete(members).where(eq(members.id, memberId));
  return true;
}

export async function createInvitation(
  db: Db,
  row: { id: string; orgId: string; email: string; role: string; inviterId?: string | null },
): Promise<void> {
  const now = new Date();
  await db.insert(invitations).values({
    id: row.id,
    orgId: row.orgId,
    email: row.email,
    role: row.role,
    status: "pending",
    expiresAt: new Date(Date.now() + 7 * 86400 * 1000),
    inviterId: row.inviterId ?? null,
    createdAt: now,
    updatedAt: now,
  });
}

export async function getUser(
  db: Db,
  userId: string,
): Promise<{ id: string; email: string; isSuperadmin: number | null; defaultOrgId: string | null } | null> {
  const rows = await db
    .select({ id: users.id, email: users.email, isSuperadmin: users.isSuperadmin, defaultOrgId: users.defaultOrgId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return rows[0] ?? null;
}

/** Persist the user's explicit default org (must be a member — validated by callers). */
export async function setDefaultOrg(db: Db, userId: string, orgId: string | null): Promise<void> {
  await db.update(users).set({ defaultOrgId: orgId }).where(eq(users.id, userId));
}

export async function countSubscriptionsForPlan(db: Db, planId: string): Promise<number> {
  const rows = await db
    .select({ id: orgSubscriptions.id })
    .from(orgSubscriptions)
    .where(eq(orgSubscriptions.planId, planId));
  return rows.length;
}

export async function countActivePlans(db: Db): Promise<number> {
  const rows = await db
    .select({ id: plans.id })
    .from(plans)
    .where(eq(plans.active, 1));
  return rows.length;
}

export async function insertPlan(
  db: Db,
  row: Omit<PlanRow, "createdAt" | "updatedAt">,
): Promise<PlanRow> {
  const now = nowMs();
  const inserted = await db
    .insert(plans)
    .values({ ...row, createdAt: now, updatedAt: now })
    .returning();
  return inserted[0]!;
}

export async function updatePlan(
  db: Db,
  id: string,
  patch: Partial<Omit<PlanRow, "id" | "createdAt" | "updatedAt">>,
): Promise<void> {
  await db
    .update(plans)
    .set({ ...patch, updatedAt: nowMs() })
    .where(eq(plans.id, id));
}

export async function deletePlan(db: Db, id: string): Promise<void> {
  await db.delete(couponPlans).where(eq(couponPlans.planId, id));
  await db.delete(plans).where(eq(plans.id, id));
}

export async function insertCoupon(
  db: Db,
  row: Omit<CouponRow, "createdAt" | "updatedAt">,
): Promise<CouponRow> {
  const now = nowMs();
  const inserted = await db
    .insert(coupons)
    .values({ ...row, createdAt: now, updatedAt: now })
    .returning();
  return inserted[0]!;
}

export async function updateCoupon(
  db: Db,
  id: string,
  patch: Partial<Omit<CouponRow, "id" | "code" | "createdAt" | "updatedAt">>,
): Promise<void> {
  await db
    .update(coupons)
    .set({ ...patch, updatedAt: nowMs() })
    .where(eq(coupons.id, id));
}

export async function setCouponPlans(db: Db, couponId: string, planIds: string[]): Promise<void> {
  await db.delete(couponPlans).where(eq(couponPlans.couponId, couponId));
  for (const planId of planIds) {
    await db.insert(couponPlans).values({ couponId, planId });
  }
}

export interface InvoiceItemRow {
  id: string;
  invoiceId: string;
  description: string;
  amountMinor: number;
  currency: string;
}

export async function getInvoiceItems(db: Db, invoiceId: string): Promise<InvoiceItemRow[]> {
  return db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
}

/**
 * Narrow data-access surface for the billing engine. Production uses
 * drizzleStore(db); tests use an in-memory implementation.
 */
export interface BillingStore {
  getPlan(id: string): Promise<PlanRow | null>;
  listActivePlans(): Promise<PlanRow[]>;
  listAllPlans(): Promise<PlanRow[]>;
  listAllCoupons(): Promise<CouponRow[]>;
  listAllInvoicesWithOrgs(): Promise<Array<InvoiceRow & { orgName: string | null }>>;
  getCouponByCode(code: string): Promise<CouponRow | null>;
  getCouponById(id: string): Promise<CouponRow | null>;
  listCouponPlans(couponId: string): Promise<string[]>;
  bumpCouponRedemptions(couponId: string): Promise<void>;
  getOrgSubscription(orgId: string): Promise<SubscriptionRow | null>;
  /** Latest subscription regardless of status (access checks, not billing). */
  getAnySubscription(orgId: string): Promise<SubscriptionRow | null>;
  getSubscription(id: string): Promise<SubscriptionRow | null>;
  listAllSubscriptions(): Promise<SubscriptionRow[]>;
  insertSubscription(row: Omit<SubscriptionRow, "createdAt" | "updatedAt">): Promise<SubscriptionRow>;
  updateSubscription(id: string, patch: Partial<Omit<SubscriptionRow, "id" | "createdAt" | "updatedAt">>): Promise<void>;
  dueSubscriptions(nowSec: number): Promise<SubscriptionRow[]>;
  upcomingSubscriptions(fromSec: number, toSec: number): Promise<SubscriptionRow[]>;
  listPaymentMethods(orgId: string): Promise<PaymentMethodRow[]>;
  getPaymentMethod(id: string): Promise<PaymentMethodRow | null>;
  countValidMethods(orgId: string): Promise<number>;
  insertPaymentMethod(row: Omit<PaymentMethodRow, "createdAt" | "updatedAt">): Promise<PaymentMethodRow>;
  updatePaymentMethod(id: string, patch: Partial<Pick<PaymentMethodRow, "isDefault" | "priority" | "status" | "brand" | "last4" | "expiryMonth" | "expiryYear">>): Promise<void>;
  deletePaymentMethod(id: string): Promise<void>;
  getSafepayCustomerByOrg(orgId: string): Promise<{ id: number; customerTokenEncrypted: string } | null>;
  upsertSafepayCustomerByOrg(orgId: string, customerTokenEncrypted: string): Promise<void>;
  createInvoice(
    header: {
      id: string;
      orgId: string;
      subscriptionId?: string | null;
      type: string;
      status?: string;
      amountMinor: number;
      currency?: string;
      description?: string | null;
      idempotencyKey?: string | null;
      tracker?: string | null;
      chargeId?: string | null;
      dueAt?: number | null;
      paidAt?: number | null;
      createdBy?: string | null;
    },
    lines: InvoiceLineInput[],
    nowSec: number,
  ): Promise<InvoiceRow>;
  getInvoice(id: string): Promise<InvoiceRow | null>;
  getInvoiceByNumberOrId(ref: string): Promise<InvoiceRow | null>;
  findInvoiceByTracker(tracker: string): Promise<InvoiceRow | null>;
  listTransactionsByTracker(tracker: string): Promise<TransactionRow[]>;
  listTransactionsInRange(fromMs: number, toMs: number): Promise<TransactionRow[]>;
  recordWebhookEvent(row: {
    source: string;
    externalId?: string | null;
    eventType: string;
    payloadHash: string;
    payloadJsonRedacted: string;
  }): Promise<boolean>;
  listInvoicesForOrg(orgId: string): Promise<InvoiceRow[]>;
  getInvoiceItems(invoiceId: string): Promise<InvoiceItemRow[]>;
  updateInvoice(id: string, patch: Partial<Pick<InvoiceRow, "status" | "tracker" | "chargeId" | "paidAt" | "reminderCount" | "lastReminderAt" | "description">>): Promise<void>;
  findOpenInvoiceForSubscription(subscriptionId: string): Promise<InvoiceRow | null>;
  listFailedInvoices(): Promise<InvoiceRow[]>;
  insertTransaction(row: {
    id?: string;
    orgId: string;
    invoiceId?: string | null;
    paymentMethodId?: string | null;
    tracker?: string | null;
    chargeId?: string | null;
    kind: string;
    status: string;
    amountMinor: number;
    currency?: string;
    description?: string | null;
  }): Promise<TransactionRow>;
  latestTransactionFor(invoiceId: string, chargeKind?: string): Promise<TransactionRow | null>;
  listTransactionsForInvoice(invoiceId: string): Promise<TransactionRow[]>;
  insertPaymentSession(row: {
    tracker: string;
    orgId: string;
    userId?: string | null;
    amountMinor: number;
    currency?: string;
    purpose: string;
  }): Promise<void>;
  getPaymentSession(tracker: string): Promise<{ tracker: string; orgId: string; userId: string | null; amountMinor: number; currency: string; purpose: string; status: string } | null>;
  markPaymentSession(tracker: string, status: string): Promise<void>;
  attachSubscriptionCoupon(subscriptionId: string, couponId: string): Promise<void>;
  activeSubscriptionCoupon(subscriptionId: string): Promise<{ id: string; couponId: string; cyclesApplied: number } | null>;
  advanceSubscriptionCoupon(id: string, cyclesApplied: number, status: string): Promise<void>;
  listOrgAdminEmails(orgId: string): Promise<string[]>;
  getAllSettings(): Promise<Record<string, string>>;
  listOrganizations(): Promise<Array<{ id: string; name: string; slug: string | null; createdAt: number | Date }>>;
  listUserOrgs(userId: string): Promise<Array<{ id: string; createdAt: number | Date }>>;
  getOrganization(orgId: string): Promise<{ id: string; name: string; slug: string | null } | null>;
  deleteOrganization(orgId: string): Promise<void>;
  listOrgMembers(orgId: string): Promise<Array<{ id: string; userId: string; email: string; name: string | null; role: string; status: string; suspendedBy: string | null; createdAt: number | Date }>>;
  setMemberStatus(orgId: string, memberId: string, status: "active" | "suspended", suspendedBy?: string | null): Promise<boolean>;
  setMemberRole(orgId: string, memberId: string, role: string): Promise<boolean>;
  deleteMember(orgId: string, memberId: string): Promise<boolean>;
  createInvitation(row: {
    id: string;
    orgId: string;
    email: string;
    role: string;
    inviterId?: string | null;
  }): Promise<void>;
  setMemberRole(orgId: string, memberId: string, role: string): Promise<boolean>;
  deleteMember(orgId: string, memberId: string): Promise<boolean>;
  createInvitation(row: {
    id: string;
    orgId: string;
    email: string;
    role: string;
    inviterId?: string | null;
  }): Promise<void>;
  getUser(userId: string): Promise<{ id: string; email: string; isSuperadmin: number | null; defaultOrgId: string | null } | null>;
  setDefaultOrg(userId: string, orgId: string | null): Promise<void>;
  countSubscriptionsForPlan(planId: string): Promise<number>;
  countActivePlans(): Promise<number>;
  insertPlan(row: Omit<PlanRow, "createdAt" | "updatedAt">): Promise<PlanRow>;
  updatePlan(id: string, patch: Partial<Omit<PlanRow, "id" | "createdAt" | "updatedAt">>): Promise<void>;
  deletePlan(id: string): Promise<void>;
  insertCoupon(row: Omit<CouponRow, "createdAt" | "updatedAt">): Promise<CouponRow>;
  updateCoupon(id: string, patch: Partial<Omit<CouponRow, "id" | "code" | "createdAt" | "updatedAt">>): Promise<void>;
  setCouponPlans(couponId: string, planIds: string[]): Promise<void>;
}

export function drizzleStore(db: Db): BillingStore {
  return {
    getPlan: (id) => getPlan(db, id),
    listActivePlans: () => listActivePlans(db),
    listAllPlans: () => listAllPlans(db),
    listAllCoupons: () => listAllCoupons(db),
    listAllInvoicesWithOrgs: () => listAllInvoicesWithOrgs(db),
    getCouponByCode: (code) => getCouponByCode(db, code),
    getCouponById: (id) => getCouponById(db, id),
    listCouponPlans: (couponId) => listCouponPlans(db, couponId),
    bumpCouponRedemptions: (couponId) => bumpCouponRedemptions(db, couponId),
    getOrgSubscription: (orgId) => getOrgSubscription(db, orgId),
    getAnySubscription: (orgId) => getAnySubscription(db, orgId),
    getSubscription: (id) => getSubscription(db, id),
    listAllSubscriptions: () => listAllSubscriptions(db),
    insertSubscription: (row) => insertSubscription(db, row),
    updateSubscription: (id, patch) => updateSubscription(db, id, patch),
    dueSubscriptions: (now) => dueSubscriptions(db, now),
    upcomingSubscriptions: (from, to) => upcomingSubscriptions(db, from, to),
    listPaymentMethods: (orgId) => listPaymentMethods(db, orgId),
    getPaymentMethod: (id) => getPaymentMethod(db, id),
    countValidMethods: (orgId) => countValidMethods(db, orgId),
    insertPaymentMethod: (row) => insertPaymentMethod(db, row),
    updatePaymentMethod: (id, patch) => updatePaymentMethod(db, id, patch),
    deletePaymentMethod: (id) => deletePaymentMethod(db, id),
    getSafepayCustomerByOrg: (orgId) => getSafepayCustomerByOrg(db, orgId),
    upsertSafepayCustomerByOrg: (orgId, token) => upsertSafepayCustomerByOrg(db, orgId, token),
    createInvoice: (header, lines, now) => createInvoice(db, header, lines, now),
    getInvoice: (id) => getInvoice(db, id),
    getInvoiceByNumberOrId: (ref) => getInvoiceByNumberOrId(db, ref),
    findInvoiceByTracker: (tracker) => findInvoiceByTracker(db, tracker),
    listTransactionsByTracker: (tracker) => listTransactionsByTracker(db, tracker),
    listTransactionsInRange: (fromMs, toMs) => listTransactionsInRange(db, fromMs, toMs),
    recordWebhookEvent: (row) => recordWebhookEvent(db, row),
    listInvoicesForOrg: (orgId) => listInvoicesForOrg(db, orgId),
    getInvoiceItems: (invoiceId) => getInvoiceItems(db, invoiceId),
    updateInvoice: (id, patch) => updateInvoice(db, id, patch),
    findOpenInvoiceForSubscription: (subId) => findOpenInvoiceForSubscription(db, subId),
    listFailedInvoices: () => listFailedInvoices(db),
    insertTransaction: (row) => insertTransaction(db, row),
    latestTransactionFor: (invoiceId, kind) => latestTransactionFor(db, invoiceId, kind),
    listTransactionsForInvoice: (invoiceId) => listTransactionsForInvoice(db, invoiceId),
    insertPaymentSession: (row) => insertPaymentSession(db, row),
    getPaymentSession: (tracker) => getPaymentSession(db, tracker),
    markPaymentSession: (tracker, status) => markPaymentSession(db, tracker, status),
    attachSubscriptionCoupon: (subId, couponId) => attachSubscriptionCoupon(db, subId, couponId),
    activeSubscriptionCoupon: async (subId) => {
      const row = await activeSubscriptionCoupon(db, subId);
      return row ? { id: row.id, couponId: row.couponId, cyclesApplied: row.cyclesApplied ?? 0 } : null;
    },
    advanceSubscriptionCoupon: (id, cycles, status) => advanceSubscriptionCoupon(db, id, cycles, status),
    listOrgAdminEmails: (orgId) => listOrgAdminEmails(db, orgId),
    getAllSettings: () => getAllSettings(db),
    listOrganizations: () => listOrganizations(db),
    listUserOrgs: (userId) => listUserOrgs(db, userId),
    getOrganization: (orgId) => getOrganization(db, orgId),
    deleteOrganization: (orgId) => deleteOrganization(db, orgId),
    listOrgMembers: (orgId) => listOrgMembers(db, orgId),
    setMemberStatus: (orgId, memberId, status, suspendedBy) => setMemberStatus(db, orgId, memberId, status, suspendedBy),
    setMemberRole: (orgId, memberId, role) => setMemberRole(db, orgId, memberId, role),
    deleteMember: (orgId, memberId) => deleteMember(db, orgId, memberId),
    createInvitation: (row) => createInvitation(db, row),
    getUser: (userId) => getUser(db, userId),
    setDefaultOrg: (userId, orgId) => setDefaultOrg(db, userId, orgId),
    countSubscriptionsForPlan: (planId) => countSubscriptionsForPlan(db, planId),
    countActivePlans: () => countActivePlans(db),
    insertPlan: (row) => insertPlan(db, row),
    updatePlan: (id, patch) => updatePlan(db, id, patch),
    deletePlan: (id) => deletePlan(db, id),
    insertCoupon: (row) => insertCoupon(db, row),
    updateCoupon: (id, patch) => updateCoupon(db, id, patch),
    setCouponPlans: (couponId, planIds) => setCouponPlans(db, couponId, planIds),
  };
}
