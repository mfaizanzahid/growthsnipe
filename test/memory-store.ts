import type {
  BillingStore,
  CouponRow,
  InvoiceLineInput,
  InvoiceRow,
  PaymentMethodRow,
  PlanRow,
  SubscriptionRow,
  TransactionRow,
} from "../src/server/repositories/billing";
import type { IdempotencyBackend } from "../src/server/lib/idempotency";
import { formatInvoiceNumber } from "../src/server/lib/billing-math";

let clockMs: number | null = null;
const nowMs = () => clockMs ?? Date.now();

/** Pin the store clock (ms) for deterministic time-dependent tests. */
export function setStoreClock(ms: number | null): void {
  clockMs = ms;
}

/** In-memory BillingStore for engine tests (mirrors drizzle semantics). */
export function memoryStore(): BillingStore & IdempotencyBackend & {
  seed: {
    plan(p: Partial<PlanRow> & { id: string }): PlanRow;
    coupon(c: Partial<CouponRow> & { id: string; code: string }): CouponRow;
    couponPlan(couponId: string, planId: string): void;
    subscription(s: Partial<SubscriptionRow> & { id: string; orgId: string }): SubscriptionRow;
    method(m: Partial<PaymentMethodRow> & { id: string; orgId: string }): PaymentMethodRow;
    customer(orgId: string, token: string): void;
    session(t: { tracker: string; orgId: string; amountMinor: number; currency?: string; purpose?: string; status?: string }): void;
    org(o: { id: string; name: string; slug?: string | null }): void;
    member(orgId: string, userId: string, role: string, createdAt?: number): void;
    user(u: { id: string; email: string; name?: string }): void;
  };
} {
  const plans = new Map<string, PlanRow>();
  const coupons = new Map<string, CouponRow>();
  const couponPlans = new Map<string, Set<string>>();
  const subs = new Map<string, SubscriptionRow>();
  const methods = new Map<string, PaymentMethodRow>();
  const customers = new Map<string, string>();
  const invoices = new Map<string, InvoiceRow>();
  const items = new Map<string, Array<{ description: string; amountMinor: number }>>();
  const txns = new Map<string, TransactionRow>();
  const orgs = new Map<string, { id: string; name: string; slug: string | null; createdAt: number }>();
  const orgMembers = new Map<string, Array<{ id: string; userId: string; role: string; status: string; suspendedBy: string | null; createdAt: number }>>();
  const users = new Map<string, { id: string; email: string; name: string | null; isSuperadmin: number | null; defaultOrgId: string | null }>();
  const sessions = new Map<string, { tracker: string; orgId: string; userId: string | null; amountMinor: number; currency: string; purpose: string; status: string }>();
  const subCoupons = new Map<string, { id: string; couponId: string; subscriptionId: string; status: string; cyclesApplied: number }>();
  const idem = new Map<string, { status: string; responseJson: string | null }>();
  const seenEvents = new Set<string>();
  const pendingInvites = new Map<string, { id: string; orgId: string; email: string; role: string; status: string }>();
  const settings = new Map<string, string>([
    ["portal_name", "Test Portal"],
    ["support_email", "help@test.com"],
  ]);
  const seq = new Map<number, number>();

  const store: BillingStore & IdempotencyBackend & {
    seed: {
      plan(p: Partial<PlanRow> & { id: string }): PlanRow;
      coupon(c: Partial<CouponRow> & { id: string; code: string }): CouponRow;
      couponPlan(couponId: string, planId: string): void;
      subscription(s: Partial<SubscriptionRow> & { id: string; orgId: string }): SubscriptionRow;
      method(m: Partial<PaymentMethodRow> & { id: string; orgId: string }): PaymentMethodRow;
      customer(orgId: string, token: string): void;
      session(t: { tracker: string; orgId: string; amountMinor: number; currency?: string; purpose?: string; status?: string }): void;
      org(o: { id: string; name: string; slug?: string | null }): void;
      member(orgId: string, userId: string, role: string, createdAt?: number): void;
      user(u: { id: string; email: string; name?: string }): void;
    };
  } = {
    getPlan: async (id) => plans.get(id) ?? null,
    listActivePlans: async () =>
      [...plans.values()].filter((p) => p.active === 1).sort((a, b) => a.sortOrder - b.sortOrder),
    listAllPlans: async () => [...plans.values()].sort((a, b) => a.sortOrder - b.sortOrder),
    listAllCoupons: async () => [...coupons.values()],
    listAllInvoicesWithOrgs: async () =>
      [...invoices.values()]
        .sort((a, b) => +b.createdAt - +a.createdAt)
        .map((i) => ({ ...i, orgName: orgs.get(i.orgId)?.name ?? null })),
    getCouponByCode: async (code) => {
      const n = code.trim().toUpperCase();
      return [...coupons.values()].find((c) => c.code === n) ?? null;
    },
    getCouponById: async (id) => coupons.get(id) ?? null,
    listCouponPlans: async (couponId) => [...(couponPlans.get(couponId) ?? [])],
    bumpCouponRedemptions: async (couponId) => {
      const c = coupons.get(couponId);
      if (c) coupons.set(couponId, { ...c, redeemedCount: (c.redeemedCount ?? 0) + 1 });
    },
    getOrgSubscription: async (orgId) => {
      const billable = ["active", "trialing", "scheduled", "past_due"];
      const rows = [...subs.values()]
        .filter((s) => s.orgId === orgId && billable.includes(s.status))
        .sort((a, b) => +b.createdAt - +a.createdAt);
      return rows[0] ?? null;
    },
    getAnySubscription: async (orgId) => {
      const rows = [...subs.values()]
        .filter((s) => s.orgId === orgId)
        .sort((a, b) => +b.createdAt - +a.createdAt);
      return rows[0] ?? null;
    },
    getSubscription: async (id) => subs.get(id) ?? null,
    listAllSubscriptions: async () =>
      [...subs.values()].sort((a, b) => +b.createdAt - +a.createdAt),
    insertSubscription: async (row) => {
      const full: SubscriptionRow = { ...row, createdAt: nowMs(), updatedAt: nowMs() };
      subs.set(full.id, full);
      return full;
    },
    updateSubscription: async (id, patch) => {
      const s = subs.get(id);
      if (s) subs.set(id, { ...s, ...patch, updatedAt: nowMs() });
    },
    dueSubscriptions: async (now) =>
      [...subs.values()].filter(
        (s) =>
          ["active", "past_due"].includes(s.status) &&
          s.nextCharge <= now &&
          (s.totalCycles === null || (s.cyclesCharged ?? 0) < s.totalCycles),
      ),
    upcomingSubscriptions: async (from, to) =>
      [...subs.values()].filter(
        (s) =>
          ["active", "trialing", "scheduled"].includes(s.status) &&
          s.nextCharge > from &&
          s.nextCharge <= to &&
          (s.totalCycles === null || (s.cyclesCharged ?? 0) < s.totalCycles),
      ),
    listPaymentMethods: async (orgId) =>
      [...methods.values()]
        .filter((m) => m.orgId === orgId)
        .sort(
          (a, b) =>
            b.isDefault - a.isDefault || a.priority - b.priority || +a.createdAt - +b.createdAt,
        ),
    getPaymentMethod: async (id) => methods.get(id) ?? null,
    countValidMethods: async (orgId) =>
      [...methods.values()].filter((m) => m.orgId === orgId && m.status === "active").length,
    insertPaymentMethod: async (row) => {
      const full: PaymentMethodRow = { ...row, createdAt: nowMs(), updatedAt: nowMs() };
      methods.set(full.id, full);
      return full;
    },
    updatePaymentMethod: async (id, patch) => {
      const m = methods.get(id);
      if (m) methods.set(id, { ...m, ...patch, updatedAt: nowMs() });
    },
    deletePaymentMethod: async (id) => {
      methods.delete(id);
    },
    getSafepayCustomerByOrg: async (orgId) => {
      const token = customers.get(orgId);
      return token ? { id: 1, customerTokenEncrypted: token } : null;
    },
    upsertSafepayCustomerByOrg: async (orgId, token) => {
      customers.set(orgId, token);
    },
    createInvoice: async (header, lines: InvoiceLineInput[], now) => {
      const year = new Date(now * 1000).getUTCFullYear();
      const next = (seq.get(year) ?? 0) + 1;
      seq.set(year, next);
      const full: InvoiceRow = {
        id: header.id,
        orgId: header.orgId,
        subscriptionId: header.subscriptionId ?? null,
        number: formatInvoiceNumber(year, next),
        type: header.type,
        status: header.status ?? "due",
        amountMinor: header.amountMinor,
        currency: header.currency ?? "USD",
        description: header.description ?? null,
        idempotencyKey: header.idempotencyKey ?? null,
        tracker: header.tracker ?? null,
        chargeId: header.chargeId ?? null,
        reminderCount: 0,
        lastReminderAt: null,
        dueAt: header.dueAt ?? null,
        paidAt: header.paidAt ?? null,
        createdBy: header.createdBy ?? null,
        createdAt: nowMs(),
        updatedAt: nowMs(),
      };
      invoices.set(full.id, full);
      items.set(
        full.id,
        lines.map((l) => ({ description: l.description, amountMinor: l.amountMinor })),
      );
      return full;
    },
    getInvoice: async (id) => invoices.get(id) ?? null,
    getInvoiceByNumberOrId: async (ref) =>
      invoices.get(ref) ?? [...invoices.values()].find((i) => i.number === ref) ?? null,
    findInvoiceByTracker: async (tracker) =>
      [...invoices.values()].find((i) => i.tracker === tracker) ?? null,
    listTransactionsByTracker: async (tracker) =>
      [...txns.values()].filter((t) => t.tracker === tracker),
    recordWebhookEvent: async (row) => {
      const key = `${row.source}:${row.externalId ?? ""}`;
      if (seenEvents.has(key)) return false;
      seenEvents.add(key);
      return true;
    },
    listInvoicesForOrg: async (orgId) =>
      [...invoices.values()].filter((i) => i.orgId === orgId).sort((a, b) => +b.createdAt - +a.createdAt),
    getInvoiceItems: async (invoiceId) =>
      (items.get(invoiceId) ?? []).map((l, i) => ({
        id: `${invoiceId}:${i}`,
        invoiceId,
        description: l.description,
        amountMinor: l.amountMinor,
        currency: "USD",
      })),
    updateInvoice: async (id, patch) => {
      const inv = invoices.get(id);
      if (inv) invoices.set(id, { ...inv, ...patch, updatedAt: nowMs() });
    },
    findOpenInvoiceForSubscription: async (subId) => {
      const rows = [...invoices.values()]
        .filter((i) => i.subscriptionId === subId && (i.status === "due" || i.status === "failed"))
        .sort((a, b) => +b.createdAt - +a.createdAt);
      return rows[0] ?? null;
    },
    listFailedInvoices: async () => [...invoices.values()].filter((i) => i.status === "failed"),
    insertTransaction: async (row) => {
      const full: TransactionRow = {
        id: row.id ?? `txn_${Math.random().toString(36).slice(2)}`,
        orgId: row.orgId,
        invoiceId: row.invoiceId ?? null,
        paymentMethodId: row.paymentMethodId ?? null,
        tracker: row.tracker ?? null,
        chargeId: row.chargeId ?? null,
        kind: row.kind,
        status: row.status,
        amountMinor: row.amountMinor,
        currency: row.currency ?? "USD",
        description: row.description ?? null,
        createdAt: nowMs(),
        updatedAt: nowMs(),
      };
      txns.set(full.id, full);
      return full;
    },
    latestTransactionFor: async (invoiceId, kind) => {
      const rows = [...txns.values()]
        .filter((t) => t.invoiceId === invoiceId && (!kind || t.kind === kind))
        .sort((a, b) => +b.createdAt - +a.createdAt);
      return rows[0] ?? null;
    },
    listTransactionsForInvoice: async (invoiceId) =>
      [...txns.values()]
        .filter((t) => t.invoiceId === invoiceId)
        .sort((a, b) => +a.createdAt - +b.createdAt),
    listTransactionsInRange: async (fromMs, toMs) =>
      [...txns.values()]
        .filter((t) => +t.createdAt >= fromMs && +t.createdAt <= toMs)
        .sort((a, b) => +a.createdAt - +b.createdAt),
    insertPaymentSession: async (row) => {
      sessions.set(row.tracker, {
        tracker: row.tracker,
        orgId: row.orgId,
        userId: row.userId ?? null,
        amountMinor: row.amountMinor,
        currency: row.currency ?? "USD",
        purpose: row.purpose,
        status: "pending",
      });
    },
    getPaymentSession: async (tracker) => sessions.get(tracker) ?? null,
    markPaymentSession: async (tracker, status) => {
      const s = sessions.get(tracker);
      if (s) sessions.set(tracker, { ...s, status });
    },
    attachSubscriptionCoupon: async (subId, couponId) => {
      const id = `sc_${Math.random().toString(36).slice(2)}`;
      subCoupons.set(id, { id, couponId, subscriptionId: subId, status: "active", cyclesApplied: 0 });
    },
    activeSubscriptionCoupon: async (subId) => {
      const rows = [...subCoupons.values()]
        .filter((s) => s.subscriptionId === subId && s.status === "active");
      const top = rows[rows.length - 1];
      return top ? { id: top.id, couponId: top.couponId, cyclesApplied: top.cyclesApplied } : null;
    },
    advanceSubscriptionCoupon: async (id, cycles, status) => {
      const s = subCoupons.get(id);
      if (s) subCoupons.set(id, { ...s, cyclesApplied: cycles, status });
    },
    listOrgAdminEmails: async () => ["admin@test.com"],
    getAllSettings: async () => Object.fromEntries(settings),
    listOrganizations: async () =>
      [...orgs.values()].sort((a, b) => b.createdAt - a.createdAt),
    listUserOrgs: async (userId) => {
      const ids = new Set<string>();
      for (const [orgId, list] of orgMembers) {
        if (list.some((m) => m.userId === userId)) ids.add(orgId);
      }
      return [...ids]
        .map((id) => orgs.get(id))
        .filter((o): o is { id: string; name: string; slug: string | null; createdAt: number } => !!o)
        .sort((a, b) => a.createdAt - b.createdAt)
        .map(({ id, createdAt }) => ({ id, createdAt }));
    },
    getOrganization: async (orgId) => {
      const o = orgs.get(orgId);
      return o ? { id: o.id, name: o.name, slug: o.slug } : null;
    },
    deleteOrganization: async (orgId) => {
      for (const [id, s] of [...subs]) if (s.orgId === orgId) subs.delete(id);
      // Drop coupons attached to this org's (now removed) subscriptions.
      const liveSubIds = new Set([...subs.values()].map((s) => s.id));
      for (const [id, s] of [...subCoupons]) if (!liveSubIds.has(s.subscriptionId)) subCoupons.delete(id);
      for (const [id, i] of [...invoices]) {
        if (i.orgId === orgId) {
          items.delete(id);
          invoices.delete(id);
        }
      }
      for (const [id, t] of [...txns]) if (t.orgId === orgId) txns.delete(id);
      for (const [id, m] of [...methods]) if (m.orgId === orgId) methods.delete(id);
      customers.delete(orgId);
      for (const [tracker, s] of [...sessions]) if (s.orgId === orgId) sessions.delete(tracker);
      for (const [id, p] of [...pendingInvites]) if (p.orgId === orgId) pendingInvites.delete(id);
      orgMembers.delete(orgId);
      for (const u of users.values()) if (u.defaultOrgId === orgId) u.defaultOrgId = null;
      orgs.delete(orgId);
    },
    listOrgMembers: async (orgId) =>
      (orgMembers.get(orgId) ?? []).map((m) => ({
        id: m.id,
        userId: m.userId,
        email: users.get(m.userId)?.email ?? "",
        name: users.get(m.userId)?.name ?? null,
        role: m.role,
        status: m.status,
        suspendedBy: m.suspendedBy,
        createdAt: m.createdAt,
      })),
    setMemberStatus: async (orgId, memberId, status, suspendedBy) => {
      const list = orgMembers.get(orgId) ?? [];
      const m = list.find((x) => x.id === memberId);
      if (!m) return false;
      m.status = status;
      if (suspendedBy !== undefined) m.suspendedBy = suspendedBy;
      return true;
    },
    setMemberRole: async (orgId, memberId, role) => {
      const list = orgMembers.get(orgId) ?? [];
      const m = list.find((x) => x.id === memberId);
      if (!m) return false;
      m.role = role;
      return true;
    },
    deleteMember: async (orgId, memberId) => {
      const list = orgMembers.get(orgId) ?? [];
      const idx = list.findIndex((x) => x.id === memberId);
      if (idx < 0) return false;
      list.splice(idx, 1);
      return true;
    },
    createInvitation: async (row) => {
      pendingInvites.set(row.id, {
        id: row.id,
        orgId: row.orgId,
        email: row.email,
        role: row.role,
        status: "pending",
      });
    },
    getUser: async (userId) => users.get(userId) ?? null,
    setDefaultOrg: async (userId, orgId) => {
      const u = users.get(userId);
      if (u) users.set(userId, { ...u, defaultOrgId: orgId });
    },
    countSubscriptionsForPlan: async (planId) =>
      [...subs.values()].filter((s) => s.planId === planId).length,
    countActivePlans: async () =>
      [...plans.values()].filter((p) => p.active === 1 && (p.contactOnly ?? 0) === 0).length,
    insertPlan: async (row) => {
      const full: PlanRow = { ...row, createdAt: nowMs(), updatedAt: nowMs() };
      plans.set(full.id, full);
      return full;
    },
    updatePlan: async (id, patch) => {
      const p = plans.get(id);
      if (p) plans.set(id, { ...p, ...patch });
    },
    deletePlan: async (id) => {
      plans.delete(id);
      for (const [couponId, set] of couponPlans) {
        set.delete(id);
        if (set.size === 0) couponPlans.delete(couponId);
      }
    },
    insertCoupon: async (row) => {
      const full: CouponRow = { ...row, createdAt: nowMs(), updatedAt: nowMs() };
      coupons.set(full.id, full);
      return full;
    },
    updateCoupon: async (id, patch) => {
      const c = coupons.get(id);
      if (c) coupons.set(id, { ...c, ...patch });
    },
    setCouponPlans: async (couponId, planIds) => {
      couponPlans.set(couponId, new Set(planIds));
    },
    get: async (key) => {
      const row = idem.get(key);
      return row ? { status: row.status, responseJson: row.responseJson } : null;
    },
    claim: async (key, operation, _hash) => {
      void operation;
      void _hash;
      if (idem.has(key)) return false;
      idem.set(key, { status: "processing", responseJson: null });
      return true;
    },
    settle: async (key, status, responseJson) => {
      idem.set(key, { status, responseJson: responseJson ?? null });
    },
    release: async (key) => {
      idem.delete(key);
    },
    seed: {
      plan: (p) => {
        const full: PlanRow = {
          monthlyMinor: 19900,
          annualMinor: 199000,
          setupFeeMinor: 0,
          trialPeriodDays: 0,
          description: null,
          sortOrder: 0,
          currency: "USD",
          active: 1,
            maxUsers: null,
            allowBriefings: 1,
            contactOnly: 0,
            features: null,
          createdAt: nowMs(),
          updatedAt: nowMs(),
          name: "Plan",
          ...p,
        };
        plans.set(full.id, full);
        return full;
      },
      coupon: (c) => {
        const full: CouponRow = {
          kind: "percent",
          percentOff: null,
          amountOffMinor: null,
          currency: "USD",
          duration: "once",
          durationCycles: null,
          appliesToSetup: 0,
          maxRedemptions: null,
          redeemedCount: 0,
          validFrom: null,
          validUntil: null,
          active: 1,
          createdBy: null,
          createdAt: nowMs(),
          updatedAt: nowMs(),
          ...c,
        };
        coupons.set(full.id, full);
        return full;
      },
      couponPlan: (couponId, planId) => {
        const set = couponPlans.get(couponId) ?? new Set<string>();
        set.add(planId);
        couponPlans.set(couponId, set);
      },
      subscription: (s) => {
        const full: SubscriptionRow = {
          planId: "launch",
          interval: "month",
          intervalCount: 1,
          status: "active",
          startDate: 1_000_000,
          nextCharge: 1_000_000,
          totalCycles: null,
          cyclesCharged: 1,
          recurringAmountMinor: 19900,
          currency: "USD",
          defaultPaymentMethodId: null,
          pastDueSince: null,
          trialEndsAt: null,
          trialReminders: "[]",
          trialPrepaid: 0,
          renewalReminderFor: null,
          canceledAt: null,
          createdBy: null,
          createdAt: nowMs(),
          updatedAt: nowMs(),
          ...s,
        };
        subs.set(full.id, full);
        return full;
      },
      method: (m) => {
        const full: PaymentMethodRow = {
          userId: null,
          safepayPaymentMethodTokenEncrypted: "enc",
          brand: "visa",
          last4: "4242",
          expiryMonth: 12,
          expiryYear: 2030,
          isDefault: 0,
          priority: 0,
          status: "active",
          createdAt: nowMs(),
          updatedAt: nowMs(),
          ...m,
        };
        methods.set(full.id, full);
        return full;
      },
      customer: (orgId, token) => {
        customers.set(orgId, token);
      },
      session: (t) => {
        sessions.set(t.tracker, {
          tracker: t.tracker,
          orgId: t.orgId,
          userId: null,
          amountMinor: t.amountMinor,
          currency: t.currency ?? "USD",
          purpose: t.purpose ?? "signup",
          status: t.status ?? "pending",
        });
      },
      org: (o) => {
        orgs.set(o.id, { id: o.id, name: o.name, slug: o.slug ?? null, createdAt: nowMs() });
      },
      member: (orgId, userId, role, createdAt = nowMs()) => {
        const list = orgMembers.get(orgId) ?? [];
        list.push({ id: `mem_${userId}_${orgId}`, userId, role, status: "active", suspendedBy: null, createdAt });
        orgMembers.set(orgId, list);
      },
      user: (u) => {
        users.set(u.id, { id: u.id, email: u.email, name: u.name ?? null, isSuperadmin: 0, defaultOrgId: null });
      },
    },
  };
  return store;
}
