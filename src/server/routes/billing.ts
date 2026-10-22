import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../types";
import {
  contextMiddleware,
  createContextMiddleware,
  requireOrgRole,
  requireSession,
  sessionGuard,
  type MemberStore,
  type SessionResolver,
  type SessionUser,
} from "../middleware";
import type { Db } from "../repositories/db";
import type { Auth } from "../auth";
import {
  drizzleStore,
  type BillingStore,
  type PaymentMethodRow,
} from "../repositories/billing";
import { dbIdempotency, DuplicateIdempotencyError, type IdempotencyBackend } from "../lib/idempotency";
import { safepayGateway, type Gateway } from "../billing/gateway";
import { ensureCustomer, decryptCustomerToken } from "../billing/customers";
import { removeMethod, setPrimary, syncWalletMethods, MethodError } from "../billing/methods";
import { confirmSignup } from "../billing/signup";
import { startTrial, subscribe } from "../billing/trials";
import { isPurchasablePlan } from "../billing/access";
import { enforcePlanLimits } from "../billing/access-limits";
import { drizzleSidekickStore } from "../sidekick/store";
import { payInvoice } from "../billing/payments";
import { cancelSubscription, changePlan } from "../billing/changes";
import { validateCoupon, CouponError } from "../billing/coupons";
import { computeSignupAmounts } from "../lib/billing-math";
import { listOrgsForUser } from "../repositories";
import { PORTAL_NAME } from "../lib/brand";
import { deriveCountryFromPhone } from "../lib/country";
import { renderInvoicePdf } from "../lib/invoice-pdf";
import { BillingError } from "../billing/errors";

export interface BillingDeps {
  gateway?: Gateway;
  session?: SessionResolver;
  store?: MemberStore;
  billing?: BillingStore;
  idem?: IdempotencyBackend;
  ctx?: { db?: Db; auth?: Auth };
  userOrgs?: (userId: string) => Promise<Array<{ id: string }>>;
}

function billingStoreFor(c: { get(k: "db"): Db }, deps: BillingDeps): BillingStore {
  return deps.billing ?? drizzleStore(c.get("db"));
}

function idemFor(c: { get(k: "db"): Db }, deps: BillingDeps): IdempotencyBackend {
  return deps.idem ?? dbIdempotency(c.get("db"));
}

function gatewayFor(env: Env, deps: BillingDeps): Gateway {
  return deps.gateway ?? safepayGateway(env);
}
function toErrorResponse(err: unknown): { status: number; message: string } {
  if (err instanceof BillingError) return { status: err.status, message: err.message };
  if (err instanceof MethodError) return { status: err.status, message: err.message };
  if (err instanceof CouponError) return { status: err.status, message: err.message };
  if (err instanceof DuplicateIdempotencyError) return { status: 429, message: "Duplicate request — already processing" };
  // Never leak gateway/DB internals to clients.
  return { status: 500, message: "Request failed" };
}

function publicMethod(m: PaymentMethodRow) {
  return {
    id: m.id,
    brand: m.brand,
    last4: m.last4,
    expiryMonth: m.expiryMonth,
    expiryYear: m.expiryYear,
    isDefault: m.isDefault === 1,
    priority: m.priority,
    status: m.status,
  };
}

const SessionSchema = z.object({  orgId: z.string().min(1).optional(),
  purpose: z.enum(["signup", "setup"]),
  planId: z.string().optional(),
  interval: z.enum(["month", "year"]).optional(),
  couponCode: z.string().optional(),
  phone: z.string().optional(),
  country: z.string().optional(),
});

/**
 * Split a display name for Safepay customer creation (both first and last
 * name are required; a single-word name is used for both).
 */
function splitName(name: string | null | undefined): { firstName?: string; lastName?: string } {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

const SignupSchema = z.object({  orgId: z.string().min(1).optional(),
  planId: z.string().min(1),
  interval: z.enum(["month", "year"]),
  couponCode: z.string().optional(),
  tracker: z.string().optional(),
});

export function createBillingRoutes(deps: BillingDeps = {}) {
  const routes = new Hono<{ Bindings: Env; Variables: { db: Db } }>();
  const guard = deps.session ? sessionGuard(deps.session) : requireSession;
  // Superadmins may act on any tenant's billing (support/ops); membership
  // still required for everyone else. See docs/agent-rules/05-tenancy.md.
  const bypass = { allowSuperadmin: true };
  // Billing & payments is admin-only: every route below requires the org
  // admin role (superadmins bypass via allowSuperadmin for support/ops).
  const admin = () => requireOrgRole("admin", { ...bypass, ...(deps.store ? { store: deps.store } : {}) });

  routes.use("*", deps.ctx ? createContextMiddleware(deps.ctx) : contextMiddleware);

  /**
   * Create a Safepay payment session for the Atoms checkout.
   * The server computes the amount (plan + coupon) — the client never sets it.
   */
  routes.post("/api/billing/session", guard, admin(), async (c) => {
    const user = c.get("user") as SessionUser;
    const orgId = c.get("orgId") as string;
    const store = billingStoreFor(c, deps);
    const parsed = SessionSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json({ error: "Invalid session request" }, 422);
    const { purpose, planId, interval, couponCode, phone, country } = parsed.data;

    try {
      let amountMinor = 0;
      if (purpose === "signup") {
        if (!planId || !interval) return c.json({ error: "planId and interval are required" }, 422);
        const plan = await store.getPlan(planId);
        if (!plan || plan.active !== 1) return c.json({ error: "Plan is not available" }, 422);
        if (!isPurchasablePlan(plan)) {
          return c.json({ error: "This plan is contact-only. Contact us for pricing" }, 422);
        }
        let terms = null;
        if (couponCode) {
          try {
            terms = (await validateCoupon(store, couponCode, plan.id)).terms;
          } catch (err) {
            const e = toErrorResponse(err);
            return c.json({ error: e.message }, e.status as 422);
          }
        }
        amountMinor = computeSignupAmounts({
          setupMinor: plan.setupFeeMinor,
          recurringMinor: interval === "month" ? plan.monthlyMinor : plan.annualMinor,
          coupon: terms,
        }).totalMinor;
        if (amountMinor <= 0) return c.json({ error: "Nothing to charge" }, 422);
      }

      const existing = await store.getSafepayCustomerByOrg(orgId);
      let customerToken: string;
      if (existing) {
        customerToken = (await decryptCustomerToken(c.env, store, orgId))!;
      } else {
        if (!phone) return c.json({ error: "Phone number is required for first payment" }, 422);
        const resolvedCountry =
          country ?? deriveCountryFromPhone(phone, c.env.SAFEPAY_DEFAULT_COUNTRY);
        if (!resolvedCountry) {
          return c.json({ error: "Country is required (or use an international +phone format)" }, 422);
        }
        customerToken = (
          await ensureCustomer(c.env, store, gatewayFor(c.env, deps), orgId, {
            email: user.email,
            ...splitName(user.name),
            phoneNumber: phone,
            country: resolvedCountry,
          })
        ).token;
      }

      const gateway = gatewayFor(c.env, deps);
      // Independent calls: run in parallel to cut the wait before first paint.
      const [tracker, clientToken] = await Promise.all([
        gateway.createPaymentSession({
          user: customerToken,
          merchantApiKey: c.env.SAFEPAY_PUBLIC_KEY,
          mode: purpose === "setup" ? "instrument" : "payment",
          currency: "USD",
          amountMinor,
          entryMode: "raw",
          ...(purpose === "setup" ? { isAccountVerification: true } : {}),
        }),
        gateway.createClientAuthToken(),
      ]);
      await store.insertPaymentSession({
        tracker,
        orgId,
        userId: user.id,
        amountMinor,
        currency: "USD",
        purpose,
      });
      return c.json({
        tracker,
        clientToken,
        environment: c.env.SAFEPAY_ENV,
        amountMinor,
      });
    } catch (err) {
      const e = toErrorResponse(err);
      return c.json({ error: e.message }, e.status as 400);
    }
  });

  /** Confirm a signup after the browser payment completes. */
  routes.post("/api/billing/signup", guard, admin(), async (c) => {    const user = c.get("user") as SessionUser;
    const orgId = c.get("orgId") as string;
    const store = billingStoreFor(c, deps);
    const parsed = SignupSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json({ error: "planId and interval are required" }, 422);
    try {
      const admins = await store.listOrgAdminEmails(orgId);
      const { cached, result } = await confirmSignup(
        c.env,
        store,
        idemFor(c, deps),
        gatewayFor(c.env, deps),
        {
          orgId,
          userId: user.id,
          planId: parsed.data.planId,
          interval: parsed.data.interval,
          couponCode: parsed.data.couponCode,
          tracker: parsed.data.tracker,
          idempotencyKey: c.req.header("Idempotency-Key"),
          recipientEmails: [...new Set([...admins, user.email])],
        },
      );
      return c.json({ ...result, cached }, cached ? 200 : 201);
    } catch (err) {
      const e = toErrorResponse(err);
      return c.json({ error: e.message }, e.status as 400);
    }
  });

  /** Start the 30-day Pro trial (first organization only, no card). */
  routes.post("/api/billing/trial/start", guard, admin(), async (c) => {
    const user = c.get("user") as SessionUser;
    const orgId = c.get("orgId") as string;
    const store = billingStoreFor(c, deps);
    try {
      const listForUser = deps.userOrgs ?? ((userId: string) => listOrgsForUser(c.get("db") as Db, userId));
      const orgs = await listForUser(user.id);
      const others = orgs.filter((o) => o.id !== orgId);
      if (others.length > 0) {
        return c.json({ error: "Trials are only available for your first workspace — subscribe this one directly." }, 409);
      }
      const result = await startTrial(store, { orgId, userId: user.id });
      return c.json(result, 201);
    } catch (err) {
      const e = toErrorResponse(err);
      return c.json({ error: e.message }, e.status as 400);
    }
  });

  /** Subscribe now: convert a trial (or start paid for orgs that never trialed). */
  routes.post("/api/billing/subscribe", guard, admin(), async (c) => {
    const user = c.get("user") as SessionUser;
    const orgId = c.get("orgId") as string;
    const store = billingStoreFor(c, deps);
    const parsed = SignupSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json({ error: "planId and interval are required" }, 422);
    try {
      const admins = await store.listOrgAdminEmails(orgId);
      const { cached, result } = await subscribe(
        c.env,
        store,
        idemFor(c, deps),
        gatewayFor(c.env, deps),
        {
          orgId,
          userId: user.id,
          planId: parsed.data.planId,
          interval: parsed.data.interval,
          couponCode: parsed.data.couponCode,
          tracker: parsed.data.tracker,
          idempotencyKey: c.req.header("Idempotency-Key"),
          recipientEmails: [...new Set([...admins, user.email])],
        },
      );
      // A fresh subscription converges membership to the plan: Starter pauses
      // anything beyond its limits, while roomy plans restore suspended seats.
      // A prepaid trial keeps the trial tier until the trial ends, so its plan
      // limits are enforced when the trial flips over instead.
      if (!cached && result && !result.prepaid) {
        const sidekick = drizzleSidekickStore(c.get("db") as Db);
        await enforcePlanLimits(
          {
            getPlan: (id) => store.getPlan(id),
            listMembers: (oid) => store.listOrgMembers(oid),
            setMemberStatus: (oid, mid, status, suspendedBy) => store.setMemberStatus(oid, mid, status, suspendedBy),
            listSchedules: (oid) => sidekick.listSchedules(oid),
            updateSchedule: (id, oid, patch) => sidekick.updateSchedule(id, oid, patch),
          },
          orgId,
          parsed.data.planId,
          { reactivate: true },
        );
      }
      return c.json({ ...result, cached }, cached ? 200 : 201);
    } catch (err) {
      const e = toErrorResponse(err);
      return c.json({ error: e.message }, e.status as 400);
    }
  });

  /** Confirm a card save (setup session): reconcile the wallet, return methods. */
  routes.post("/api/billing/methods/confirm", guard, admin(), async (c) => {
    const user = c.get("user") as SessionUser;
    const orgId = c.get("orgId") as string;
    const store = billingStoreFor(c, deps);
    const body = (await c.req.json().catch(() => undefined)) as { tracker?: string } | undefined;
    if (!body?.tracker) return c.json({ error: "tracker is required" }, 422);
    try {
      const session = await store.getPaymentSession(body.tracker);
      if (!session || session.orgId !== orgId || session.purpose !== "setup") {
        return c.json({ error: "Setup session is invalid" }, 422);
      }
      await store.markPaymentSession(body.tracker, "succeeded");
      const { methods } = await syncWalletMethods(c.env, store, gatewayFor(c.env, deps), orgId, user.id);
      return c.json({ methods: methods.map(publicMethod) });
    } catch (err) {
      const e = toErrorResponse(err);
      return c.json({ error: e.message }, e.status as 400);
    }
  });

  routes.get("/api/billing/methods", guard, admin(), async (c) => {
    const orgId = c.get("orgId") as string;
    const methods = await billingStoreFor(c, deps).listPaymentMethods(orgId);
    return c.json({ methods: methods.map(publicMethod) });
  });

  routes.patch("/api/billing/methods/:id", guard, admin(), async (c) => {
    const orgId = c.get("orgId") as string;
    const body = (await c.req.json().catch(() => undefined)) as { isDefault?: boolean } | undefined;
    if (body?.isDefault !== true) return c.json({ error: "Nothing to update" }, 422);
    try {
      await setPrimary(billingStoreFor(c, deps), orgId, c.req.param("id"));
      const methods = await billingStoreFor(c, deps).listPaymentMethods(orgId);
      return c.json({ methods: methods.map(publicMethod) });
    } catch (err) {
      const e = toErrorResponse(err);
      return c.json({ error: e.message }, e.status as 400);
    }
  });

  routes.delete("/api/billing/methods/:id", guard, admin(), async (c) => {
    const orgId = c.get("orgId") as string;
    try {
      await removeMethod(billingStoreFor(c, deps), orgId, c.req.param("id"));
      return c.json({ ok: true });
    } catch (err) {
      const e = toErrorResponse(err);
      return c.json({ error: e.message }, e.status as 400);
    }
  });

  routes.get("/api/billing/invoices", guard, admin(), async (c) => {
    const orgId = c.get("orgId") as string;
    return c.json({ invoices: await billingStoreFor(c, deps).listInvoicesForOrg(orgId) });
  });

  routes.get("/api/billing/invoices/:id", guard, admin(), async (c) => {
    const orgId = c.get("orgId") as string;
    const store = billingStoreFor(c, deps);
    const invoice = await store.getInvoice(c.req.param("id"));
    if (!invoice || invoice.orgId !== orgId) return c.json({ error: "Invoice not found" }, 404);
    return c.json({ invoice, items: await store.getInvoiceItems(invoice.id) });
  });

  routes.get("/api/billing/invoices/:id/pdf", guard, admin(), async (c) => {
    const orgId = c.get("orgId") as string;
    const store = billingStoreFor(c, deps);
    const invoice = await store.getInvoice(c.req.param("id"));
    if (!invoice || invoice.orgId !== orgId) return c.json({ error: "Invoice not found" }, 404);
    const settings = await store.getAllSettings();
    const items = await store.getInvoiceItems(invoice.id);
    const org = await store.getOrganization(orgId);
    const pdf = await renderInvoicePdf({
      portalName: PORTAL_NAME,
      supportEmail: settings.support_email ?? "",
      number: invoice.number ?? invoice.id,
      status: invoice.status,
      orgName: org?.name ?? orgId,
      description: invoice.description,
      currency: invoice.currency,
      lines: items.map((i) => ({ description: i.description, amountMinor: i.amountMinor })),
      totalMinor: invoice.amountMinor,
      createdAt: invoice.createdAt,
      paidAt: invoice.paidAt,
    });
    return new Response(pdf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${invoice.number ?? invoice.id}.pdf"`,
      },
    });
  });

  /** Pay a due/failed invoice (customer pay + admin single-method retry). */
  routes.post("/api/billing/invoices/:id/pay", guard, admin(), async (c) => {
    const user = c.get("user") as SessionUser;
    const orgId = c.get("orgId") as string;
    const store = billingStoreFor(c, deps);
    const body = (await c.req.json().catch(() => ({}))) as { paymentMethodId?: string };
    try {
      const admins = await store.listOrgAdminEmails(orgId);
      const { cached, result } = await payInvoice(
        c.env,
        store,
        idemFor(c, deps),
        gatewayFor(c.env, deps),
        {
          orgId,
          invoiceId: c.req.param("id"),
          paymentMethodId: body.paymentMethodId,
          idempotencyKey: c.req.header("Idempotency-Key"),
          recipientEmails: [...new Set([...admins, user.email])],
          actorEmail: c.get("superadmin") ? user.email : undefined,
        },
      );
      return c.json({ ...result, cached });
    } catch (err) {
      const e = toErrorResponse(err);
      return c.json({ error: e.message }, e.status as 400);
    }
  });

  routes.get("/api/billing/subscription", guard, admin(), async (c) => {
    const orgId = c.get("orgId") as string;
    const store = billingStoreFor(c, deps);
    const sub = await store.getOrgSubscription(orgId);
    if (!sub) return c.json({ subscription: null });
    const plan = await store.getPlan(sub.planId);
    // A prepaid trial starts its paid plan when the trial ends.
    const planStartsAt = sub.trialPrepaid ? sub.trialEndsAt : null;
    return c.json({ subscription: sub, plan, planStartsAt });
  });

  routes.post("/api/billing/subscription/change", guard, admin(), async (c) => {
    const user = c.get("user") as SessionUser;
    const orgId = c.get("orgId") as string;
    const store = billingStoreFor(c, deps);
    const body = (await c.req.json().catch(() => undefined)) as {
      planId?: string;
      interval?: string;
    } | undefined;
    if (!body?.planId || (body.interval !== "month" && body.interval !== "year")) {
      return c.json({ error: "planId and interval (month|year) are required" }, 422);
    }
    try {
      const admins = await store.listOrgAdminEmails(orgId);
      const result = await changePlan(c.env, store, gatewayFor(c.env, deps), {
        orgId,
        userId: user.id,
        newPlanId: body.planId,
        newInterval: body.interval,
        recipientEmails: [...new Set([...admins, user.email])],
        actorEmail: c.get("superadmin") ? user.email : undefined,
      });
      // Downgrades suspend over-cap members at once; upgrades restore
      // suspended seats oldest-first (unlimited plans restore everyone).
      if (result.kind === "downgrade" || result.kind === "upgrade") {
        const sidekick = drizzleSidekickStore(c.get("db") as Db);
        await enforcePlanLimits(
          {
            getPlan: (id) => store.getPlan(id),
            listMembers: (oid) => store.listOrgMembers(oid),
            setMemberStatus: (oid, mid, status, suspendedBy) => store.setMemberStatus(oid, mid, status, suspendedBy),
            listSchedules: (oid) => sidekick.listSchedules(oid),
            updateSchedule: (id, oid, patch) => sidekick.updateSchedule(id, oid, patch),
          },
          orgId,
          body.planId,
          { reactivate: result.kind === "upgrade" },
        );
      }
      return c.json(result);
    } catch (err) {
      const e = toErrorResponse(err);
      return c.json({ error: e.message }, e.status as 400);
    }
  });

  routes.post("/api/billing/subscription/cancel", guard, admin(), async (c) => {
    const user = c.get("user") as SessionUser;
    const orgId = c.get("orgId") as string;
    const store = billingStoreFor(c, deps);
    try {
      const admins = await store.listOrgAdminEmails(orgId);
      const result = await cancelSubscription(c.env, store, orgId, user.id, [
        ...new Set([...admins, user.email]),
      ]);
      return c.json(result);
    } catch (err) {
      const e = toErrorResponse(err);
      return c.json({ error: e.message }, e.status as 400);
    }
  });

  return routes;
}
