import { Hono } from "hono";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Env } from "../types";
import { contextMiddleware, createContextMiddleware, requireSession, requireSuperadmin, sessionGuard } from "../middleware";
import type { SessionResolver, MemberStore } from "../middleware";
import type { Auth } from "../auth";
import {
  createFreshInvite,
  drizzleStore,
  emailHasWorkspace,
  getFreshInviteById,
  getValidFreshInvite,
  listFreshInvites,
  listOneTimeOrders,
  revokeFreshInvite,
  type BillingStore,
} from "../repositories/billing";
import {
  getLoopLead,
  listLoopLeads,
  listMarketingSendsForLead,
  resetMarketingSend,
  scheduleMarketingSends
} from "../repositories/marketing";
import {
  BP_CREDIT_SEQUENCE,
  BP_CREDIT_SEQUENCE_KEY,
  DIAG_CREDIT_SEQUENCE,
  DIAG_CREDIT_SEQUENCE_KEY,
  stepsFor,
} from "../marketing/sequences";
import { dbIdempotency, type IdempotencyBackend } from "../lib/idempotency";
import { safepayGateway, type Gateway } from "../billing/gateway";
import { processDueSubscriptions } from "../billing/renewals";
import { runBriefings } from "../scheduler/scheduler";
import {
  attachCoupon,
  createCoupon,
  createPlan,
  createUsageCharge,
  deleteClient,
  deletePlan,
  getClientDetail,
  inviteOrgMember,
  listClients,
  refundInvoice,
  removeOrgMember,
  setMemberAccess,
  updateCoupon,
  updateOrgMemberRole,
  updatePlan,
  type CouponInput,
  type PlanInput,
} from "../billing/admin";
import { BillingError } from "../billing/errors";
import { getAnalytics } from "../billing/analytics";
import type { SessionUser } from "../middleware";
import type { Db } from "../repositories/db";
import { getAllSettings, setSetting } from "../repositories";
import { diagnosticRuns, oneTimeOrders } from "../../../db/schema";
import { getRunById } from "../diagnostic/store";
import { parseFacts, renderRunReport, resendDiagnosticReportEmail } from "../diagnostic/report";
import {
  LOG_LEVELS,
  LOG_SURFACES,
  deleteAppLogs,
  queryAppLogs,
  writeAppLog,
  type LogLevel,
  type LogSurface,
} from "../lib/app-logs";

const SETTABLE_KEYS = ["support_email"] as const;

function reportFilename(businessName: string | null): string {
  const base = (businessName ?? "business")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `SNIPE-Diagnostic-${base || "business"}.pdf`;
}

const LogsQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  level: z.enum(LOG_LEVELS as [LogLevel, ...LogLevel[]]).optional(),
  surface: z.enum(LOG_SURFACES as [LogSurface, ...LogSurface[]]).optional(),
  from: z.string().max(40).optional(),
  to: z.string().max(40).optional(),
  page: z.coerce.number().int().min(1).max(100000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

/** Body for a bulk delete of log rows. */
const DeleteLogsBody = z.object({
  ids: z.array(z.string().min(1).max(64)).min(1).max(500),
});

/**
 * Parse a date filter. A bare YYYY-MM-DD bound is treated as UTC; the `to`
 * bound is inclusive of the whole day.
 */
function parseBound(value: string | undefined, endOfDay: boolean): number | null | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value.length === 10 ? `${value}T00:00:00.000Z` : value);
  if (Number.isNaN(parsed)) return null;
  return endOfDay && value.length === 10 ? parsed + 86_399_999 : parsed;
}

const SettingsSchema = z
  .object({
    support_email: z.string().trim().email().max(160).optional(),
  })
  .refine((v) => v.support_email !== undefined, {
    message: "Nothing to update",
  });

export interface SettingsService {
  getAll(): Promise<Record<string, string>>;
  set(key: string, value: string): Promise<void>;
}

export function createSuperadminRoutes(deps: {
  settings?: SettingsService;
  session?: SessionResolver;
  store?: MemberStore;
  ctx?: { db?: Db; auth?: Auth };
  billing?: BillingStore;
  gateway?: Gateway;
  idem?: IdempotencyBackend;
} = {}) {
  const routes = new Hono<{ Bindings: Env }>();
  const guard = deps.session ? sessionGuard(deps.session) : requireSession;
  const gate = requireSuperadmin(deps.store ? { store: deps.store } : undefined);

  routes.use("*", deps.ctx ? createContextMiddleware(deps.ctx) : contextMiddleware);

  // Platform-wide application log: errors and major domain events across
  // every account. Newest first, searchable, paginated.
  routes.get("/api/superadmin/logs", guard, gate, async (c) => {
    const parsed = LogsQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      const detail = parsed.error.issues[0];
      return c.json({ error: `Invalid log query (${detail?.message ?? "bad request"})` }, 422);
    }
    const from = parseBound(parsed.data.from, false);
    const to = parseBound(parsed.data.to, true);
    if (from === null || to === null) {
      return c.json({ error: "Invalid date filter: use YYYY-MM-DD or ISO 8601" }, 422);
    }
    const db = c.get("db") as Db;
    const page = await queryAppLogs(db, {
      q: parsed.data.q,
      level: parsed.data.level,
      surface: parsed.data.surface,
      from,
      to,
      page: parsed.data.page,
      limit: parsed.data.limit,
    });
    return c.json(page);
  });

  // Bulk delete of log rows (the superadmin console's select-and-delete).
  routes.delete("/api/superadmin/logs", guard, gate, async (c) => {
    const parsed = DeleteLogsBody.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) {
      const detail = parsed.error.issues[0];
      return c.json({ error: `Invalid request (${detail?.message ?? "bad request"})` }, 422);
    }
    const db = c.get("db") as Db;
    const deleted = await deleteAppLogs(db, parsed.data.ids);
    return c.json({ deleted });
  });

  routes.get("/api/superadmin/settings", guard, gate, async (c) => {
    const db = c.get("db") as Db;
    const service: SettingsService =
      deps.settings ?? {
        getAll: () => getAllSettings(db),
        set: (key, value) => setSetting(db, key, value),
      };
    const all = await service.getAll();
    const out: Record<string, string> = {};
    for (const key of SETTABLE_KEYS) out[key] = all[key] ?? "";
    return c.json({ settings: out });
  });

  routes.patch("/api/superadmin/settings", guard, gate, async (c) => {
    const parsed = SettingsSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) {
      const detail = parsed.error.issues[0];
      return c.json({ error: `Invalid settings (${detail?.message ?? "bad request"})` }, 422);
    }
    const db = c.get("db") as Db;
    const service: SettingsService =
      deps.settings ?? {
        getAll: () => getAllSettings(db),
        set: (key, value) => setSetting(db, key, value),
      };
    for (const [key, value] of Object.entries(parsed.data)) {
      if (value !== undefined) await service.set(key, value);
    }
    return c.json({ settings: await service.getAll() });
  });

  /**
   * System-wide analytics for the superadmin dashboard.
   * Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD (UTC, defaults to last 30 days, max 366).
   */
  routes.get("/api/superadmin/analytics", guard, gate, async (c) => {
    const store = billingStoreFor(c);
    const nowSec = Math.floor(Date.now() / 1000);
    const parseDay = (v: string | undefined, fallback: number): number => {
      if (!v) return fallback;
      const ms = Date.parse(`${v}T00:00:00Z`);
      return Number.isNaN(ms) ? fallback : Math.floor(ms / 1000);
    };
    let from = parseDay(c.req.query("from"), nowSec - 29 * 86_400);
    const to = parseDay(c.req.query("to"), nowSec) + 86_399;
    if (to - from > 366 * 86_400) from = to - 366 * 86_400;
    if (from > to) return c.json({ error: "Invalid range (from is after to)" }, 400);
    return c.json(await getAnalytics(store, from, to));
  });

  /**
   * Manually trigger the renewal engine (same routine the daily Cron runs).
   * Superadmin-only ops action; all charges remain idempotent per period.
   */
  routes.post("/api/superadmin/billing/run-renewals", guard, gate, async (c) => {
    const db = c.get("db") as Db;
    const store = deps.billing ?? drizzleStore(db);
    const summary = await processDueSubscriptions(c.env, store, deps.idem ?? dbIdempotency(db), deps.gateway ?? safepayGateway(c.env));
    return c.json(summary);
  });

  /**
   * Superadmin-only manual trigger for the briefing scheduler. The 5-min Cron is
   * the only automatic path; this exists for support ("send it now") and for
   * verifying a workspace end-to-end without waiting for a due time. Gated
   * workspaces are still skipped, exactly as the Cron skips them.
   */
  routes.post("/api/superadmin/briefings/run", guard, gate, async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { orgId?: string };
    const orgId = typeof body.orgId === "string" && body.orgId ? body.orgId : undefined;
    const actor = (c.get("user") as { id?: string } | undefined)?.id ?? "superadmin";
    const result = await runBriefings(c.env, c.get("db"), Date.now(), {
      orgId,
      force: true,
      rerun: true,
      actor,
    });
    return c.json(result);
  });

  function billingStoreFor(c: { get(k: "db"): Db }): BillingStore {
    return deps.billing ?? drizzleStore(c.get("db"));
  }

  function errResponse(err: unknown) {
    if (err instanceof BillingError) return { status: err.status, message: err.message };
    // Never leak gateway/DB internals to clients.
    return { status: 500, message: "Request failed" };
  }

  /**
   * Record an org-scoped domain event with the superadmin actor. The generic
   * `superadmin.write` middleware already records the HTTP call; this adds
   * the semantic event (member invited, role changed, ...) that the console
   * filters on.
   */
  async function logOrgEvent(
    c: {
      get(k: "db"): Db;
      get(k: "user"): SessionUser | undefined;
      req: { path: string; method: string; raw: Request };
      env: Env;
    },
    input: { event: string; message: string; orgId: string; level?: LogLevel; detail?: unknown },
  ): Promise<void> {
    // No D1 binding (unit tests): nothing to log to.
    if (!c.env.DB) return;
    const user = c.get("user") as SessionUser | undefined;
    await writeAppLog(c.get("db"), {
      level: input.level ?? "info",
      event: input.event,
      surface: "org",
      message: input.message,
      orgId: input.orgId,
      userId: user?.id ?? null,
      userEmail: user?.email ?? null,
      path: c.req.path,
      method: c.req.method,
      statusCode: 200,
      detail: input.detail,
    });
  }

  async function recipients(c: { get(k: "db"): Db }, orgId: string, self: string): Promise<string[]> {
    const store = billingStoreFor(c);
    const admins = await store.listOrgAdminEmails(orgId);
    return [...new Set([...admins, self])];
  }

  // Clients.
  routes.get("/api/superadmin/clients", guard, gate, async (c) => {
    return c.json({ clients: await listClients(billingStoreFor(c)) });
  });
  routes.get("/api/superadmin/clients/:orgId", guard, gate, async (c) => {
    try {
      return c.json(await getClientDetail(billingStoreFor(c), c.req.param("orgId")));
    } catch (err) {
      const e = errResponse(err);
      return c.json({ error: e.message }, e.status as 404);
    }
  });

  // Delete a client workspace and all its data. 409 while billable.
  routes.delete("/api/superadmin/clients/:orgId", guard, gate, async (c) => {
    try {
      return c.json(await deleteClient(billingStoreFor(c), c.req.param("orgId")));
    } catch (err) {
      const e = errResponse(err);
      return c.json({ error: e.message }, e.status as 400);
    }
  });

  // Suspend or reactivate a member (never the last active admin).
  routes.patch("/api/superadmin/clients/:orgId/members/:memberId", guard, gate, async (c) => {
    const body = (await c.req.json().catch(() => undefined)) as { status?: string } | undefined;
    if (body?.status !== "active" && body?.status !== "suspended") {
      return c.json({ error: "status must be active or suspended" }, 422);
    }
    try {
      await setMemberAccess(billingStoreFor(c), c.req.param("orgId"), c.req.param("memberId"), body.status);
      await logOrgEvent(c, {
        event: body.status === "suspended" ? "org.member_suspended" : "org.member_reactivated",
        message: `Member ${c.req.param("memberId")} set to ${body.status}`,
        orgId: c.req.param("orgId"),
        detail: { memberId: c.req.param("memberId"), status: body.status },
      });
      return c.json({ ok: true, status: body.status });
    } catch (err) {
      const e = errResponse(err);
      return c.json({ error: e.message }, e.status as 400);
    }
  });

  // Invite a member (superadmin-operated; invitee accepts via the normal flow).
  routes.post("/api/superadmin/clients/:orgId/members/invite", guard, gate, async (c) => {
    const user = c.get("user") as SessionUser;
    const body = (await c.req.json().catch(() => undefined)) as { email?: string; role?: string } | undefined;
    if (!body?.email || !body?.role) {
      return c.json({ error: "email and role are required" }, 422);
    }
    try {
      const result = await inviteOrgMember(c.env, billingStoreFor(c), {
        orgId: c.req.param("orgId"),
        email: body.email,
        role: body.role,
        inviterUserId: user.id,
      });
      await logOrgEvent(c, {
        event: "org.member_invited",
        message: `Invited ${body.email} as ${body.role}`,
        orgId: c.req.param("orgId"),
        detail: { email: body.email, role: body.role, invitationId: result.invitationId },
      });
      return c.json(result, 201);
    } catch (err) {
      const e = errResponse(err);
      return c.json({ error: e.message }, e.status as 400);
    }
  });

  // Send a long-live (7-day) magic link to a member or invitee
  // (invite-only sign-in; the link doubles as the invite route for new users).
  routes.post("/api/superadmin/clients/:orgId/members/magic-link", guard, gate, async (c) => {
    const body = (await c.req.json().catch(() => undefined)) as { email?: string } | undefined;
    if (!body?.email) return c.json({ error: "email is required" }, 422);
    try {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "Auth is unavailable" }, 500);
      await auth.api.signInMagicLink({
        body: {
          email: body.email,
          callbackURL: "/dashboard",
          newUserCallbackURL: "/onboarding",
        },
        headers: c.req.raw.headers,
      });
      await logOrgEvent(c, {
        event: "org.magic_link_sent",
        message: `Sent sign-in link to ${body.email}`,
        orgId: c.req.param("orgId"),
        detail: { email: body.email },
      });
      return c.json({ ok: true }, 200);
    } catch (err) {
      const e = errResponse(err);
      return c.json({ error: e.message }, e.status as 400);
    }
  });

  // Send a long-live (7-day) magic link to any address (fresh users included).
  async function sendInviteLink(auth: Auth | undefined, headers: Headers, email: string): Promise<void> {
    if (!auth) throw new Error("Auth is unavailable");
    await auth.api.signInMagicLink({
      body: {
        email,
        callbackURL: "/dashboard",
        newUserCallbackURL: "/onboarding",
      },
      headers,
    });
  }

  // Fresh-user invites for invite-only signup: pre-approve an email with no
  // workspace yet. The invitee signs in with the auto-sent magic link, names
  // their own workspace in onboarding (becoming its admin), and the invite is
  // consumed on first org creation. No subscription is created here.
  routes.post("/api/superadmin/invites", guard, gate, async (c) => {
    const user = c.get("user") as SessionUser;
    const body = (await c.req.json().catch(() => undefined)) as { email?: string } | undefined;
    const email = (body?.email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return c.json({ error: "email must be a valid address" }, 422);
    const store = c.get("db") as Db;
    try {
      if (await getValidFreshInvite(store, email)) {
        return c.json({ error: "This email is already invited — resend the link from the list below." }, 409);
      }
      if (await emailHasWorkspace(store, email)) {
        return c.json({ error: "This email already belongs to a workspace — invite them from that client instead." }, 409);
      }
      const invite = await createFreshInvite(store, {
        id: crypto.randomUUID(),
        email,
        inviterId: user.id,
      });
      await sendInviteLink(c.get("auth") as Auth | undefined, c.req.raw.headers, email);
      if (c.env.DB) {
        await writeAppLog(c.get("db"), {
          level: "info",
          event: "user.fresh_invited",
          surface: "superadmin",
          message: `Fresh invite sent to ${email}`,
          userId: user.id ?? null,
          userEmail: user.email ?? null,
          path: c.req.path,
          method: c.req.method,
          statusCode: 200,
          detail: { email, inviteId: invite.id },
        });
      }
      return c.json({ ok: true, invite }, 201);
    } catch (err) {
      const e = errResponse(err);
      return c.json({ error: e.message }, e.status as 400);
    }
  });

  // Pending fresh invites, newest first.
  routes.get("/api/superadmin/invites", guard, gate, async (c) => {
    return c.json({ invites: await listFreshInvites(c.get("db") as Db) });
  });

  // Re-send the magic link for a pending fresh invite.
  routes.post("/api/superadmin/invites/:id/resend", guard, gate, async (c) => {
    const user = c.get("user") as SessionUser;
    const store = c.get("db") as Db;
    const invite = await getFreshInviteById(store, c.req.param("id"));
    if (!invite || invite.consumedAt || invite.expiresAt.getTime() <= Date.now()) {
      return c.json({ error: "Invite not found or no longer valid" }, 404);
    }
    try {
      await sendInviteLink(c.get("auth") as Auth | undefined, c.req.raw.headers, invite.email);
      if (c.env.DB) {
        await writeAppLog(c.get("db"), {
          level: "info",
          event: "user.fresh_invite_resent",
          surface: "superadmin",
          message: `Fresh invite re-sent to ${invite.email}`,
          userId: user.id ?? null,
          userEmail: user.email ?? null,
          path: c.req.path,
          method: c.req.method,
          statusCode: 200,
          detail: { email: invite.email, inviteId: invite.id },
        });
      }
      return c.json({ ok: true });
    } catch (err) {
      const e = errResponse(err);
      return c.json({ error: e.message }, e.status as 400);
    }
  });

  // Revoke a fresh invite (it stops working for login and org creation).
  routes.delete("/api/superadmin/invites/:id", guard, gate, async (c) => {
    const user = c.get("user") as SessionUser;
    const revoked = await revokeFreshInvite(c.get("db") as Db, c.req.param("id"));
    if (!revoked) return c.json({ error: "Invite not found" }, 404);
    if (c.env.DB) {
      await writeAppLog(c.get("db"), {
        level: "info",
        event: "user.fresh_invite_revoked",
        surface: "superadmin",
        message: `Fresh invite ${c.req.param("id")} revoked`,
        userId: user.id ?? null,
        userEmail: user.email ?? null,
        path: c.req.path,
        method: c.req.method,
        statusCode: 200,
        detail: { inviteId: c.req.param("id") },
      });
    }
    return c.json({ ok: true });
  });

  // Change a member's role (never demote the last active admin).
  routes.patch("/api/superadmin/clients/:orgId/members/:memberId/role", guard, gate, async (c) => {
    const body = (await c.req.json().catch(() => undefined)) as { role?: string } | undefined;
    if (!body?.role) return c.json({ error: "role is required" }, 422);
    try {
      await updateOrgMemberRole(billingStoreFor(c), c.req.param("orgId"), c.req.param("memberId"), body.role);
      await logOrgEvent(c, {
        event: "org.member_role_changed",
        message: `Member ${c.req.param("memberId")} role set to ${body.role}`,
        orgId: c.req.param("orgId"),
        detail: { memberId: c.req.param("memberId"), role: body.role },
      });
      return c.json({ ok: true, role: body.role });
    } catch (err) {
      const e = errResponse(err);
      return c.json({ error: e.message }, e.status as 400);
    }
  });

  // Remove a member (never the last active admin).
  routes.delete("/api/superadmin/clients/:orgId/members/:memberId", guard, gate, async (c) => {
    try {
      await removeOrgMember(billingStoreFor(c), c.req.param("orgId"), c.req.param("memberId"));
      await logOrgEvent(c, {
        event: "org.member_removed",
        message: `Member ${c.req.param("memberId")} removed`,
        orgId: c.req.param("orgId"),
        detail: { memberId: c.req.param("memberId") },
      });
      return c.json({ ok: true });
    } catch (err) {
      const e = errResponse(err);
      return c.json({ error: e.message }, e.status as 400);
    }
  });

  // All invoices newest-first (superadmin console table).
  routes.get("/api/superadmin/invoices", guard, gate, async (c) => {
    return c.json({ invoices: await billingStoreFor(c).listAllInvoicesWithOrgs() });
  });

  // Loop Library leads + per-lead send ledger.
  routes.get("/api/superadmin/loop-leads", guard, gate, async (c) => {
    const db = c.get("db") as Db;
    return c.json({ leads: await listLoopLeads(db) });
  });

  routes.get("/api/superadmin/loop-leads/:id", guard, gate, async (c) => {
    const db = c.get("db") as Db;
    const lead = await getLoopLead(db, c.req.param("id"));
    if (!lead) return c.json({ error: "Lead not found" }, 404);
    return c.json({ lead, sends: await listMarketingSendsForLead(db, lead.id) });
  });

  // Re-send one sequence step now (resets it to pending, due immediately).
  routes.post("/api/superadmin/loop-leads/resend", guard, gate, async (c) => {
    const user = c.get("user") as SessionUser;
    const body = (await c.req.json().catch(() => undefined)) as { sendId?: string } | undefined;
    if (!body?.sendId) return c.json({ error: "sendId is required" }, 422);
    const db = c.get("db") as Db;
    if (!(await resetMarketingSend(db, body.sendId))) return c.json({ error: "Send not found" }, 404);
    if (c.env.DB) {
      await writeAppLog(c.get("db"), {
        level: "info",
        event: "marketing.resent",
        surface: "superadmin",
        message: "Marketing step re-queued",
        userId: user.id ?? null,
        userEmail: user.email ?? null,
        path: c.req.path,
        method: c.req.method,
        statusCode: 200,
        detail: { sendId: body.sendId },
      });
    }
    return c.json({ ok: true });
  });

  // Manual buyer-reminder trigger: schedules the Diagnostic or Blueprint
  // credit-check-in sequence anchored at the review/presentation date.
  routes.post("/api/superadmin/buyer-reminders", guard, gate, async (c) => {
    const user = c.get("user") as SessionUser;
    const body = (await c.req.json().catch(() => undefined)) as { email?: string; kind?: string; anchorDate?: string } | undefined;
    const email = (body?.email ?? "").trim().toLowerCase();
    const anchorMs = body?.anchorDate ? Date.parse(body.anchorDate) : NaN;
    const validKind = body?.kind === "diagnostic" || body?.kind === "blueprint";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !validKind || !Number.isFinite(anchorMs)) {
      return c.json({ error: "email, kind (diagnostic|blueprint), and anchorDate (ISO) are required" }, 422);
    }
    const db = c.get("db") as Db;
    const sequence = body!.kind === "diagnostic" ? DIAG_CREDIT_SEQUENCE : BP_CREDIT_SEQUENCE;
    const key = body!.kind === "diagnostic" ? DIAG_CREDIT_SEQUENCE_KEY : BP_CREDIT_SEQUENCE_KEY;
    await scheduleMarketingSends(db, { leadId: null, email, sequence: key, steps: stepsFor(sequence, anchorMs), now: Date.now() });
    if (c.env.DB) {
      await writeAppLog(c.get("db"), {
        level: "info",
        event: "marketing.buyer_triggered",
        surface: "superadmin",
        message: `Buyer reminders scheduled for ${email}`,
        userId: user.id ?? null,
        userEmail: user.email ?? null,
        path: c.req.path,
        method: c.req.method,
        statusCode: 201,
        detail: { email, kind: body!.kind, anchorDate: body!.anchorDate },
      });
    }
    return c.json({ ok: true }, 201);
  });

  // One-time orders newest-first (guest checkout has no org).
  routes.get("/api/superadmin/one-time-orders", guard, gate, async (c) => {
    const limitRaw = Number(c.req.query("limit") ?? 100);
    const limit = Number.isFinite(limitRaw) ? Math.min(500, Math.max(1, Math.floor(limitRaw))) : 100;
    return c.json({ orders: await listOneTimeOrders(c.get("db") as Db, limit) });
  });

  // Usage charges (create invoice + charge now).
  routes.post("/api/superadmin/usage-charges", guard, gate, async (c) => {
    const user = c.get("user") as SessionUser;
    const db = c.get("db") as Db;
    const store = billingStoreFor(c);
    const body = (await c.req.json().catch(() => undefined)) as {
      orgId?: string;
      amountMinor?: number;
      currency?: string;
      description?: string;
    } | undefined;
    if (!body?.orgId || body.amountMinor === undefined || !body.description) {
      return c.json({ error: "orgId, amountMinor, and description are required" }, 422);
    }
    try {
      const { cached, result } = await createUsageCharge(
        c.env,
        store,
        deps.idem ?? dbIdempotency(db),
        deps.gateway ?? safepayGateway(c.env),
        {
          orgId: body.orgId,
          amountMinor: body.amountMinor,
          currency: body.currency,
          description: body.description,
          createdBy: user.id,
          idempotencyKey: c.req.header("Idempotency-Key"),
          recipientEmails: await recipients(c, body.orgId, user.email),
          actorEmail: user.email,
        },
      );
      return c.json({ ...result, cached }, cached ? 200 : 201);
    } catch (err) {
      const e = errResponse(err);
      return c.json({ error: e.message }, e.status as 400);
    }
  });

  // Refunds (full or partial, no credits).
  routes.post("/api/superadmin/refunds", guard, gate, async (c) => {
    const user = c.get("user") as SessionUser;
    const store = billingStoreFor(c);
    const body = (await c.req.json().catch(() => undefined)) as {
      invoiceId?: string;
      amountMinor?: number;
    } | undefined;
    if (!body?.invoiceId) return c.json({ error: "invoiceId is required" }, 422);
    try {
      const invoice = await store.getInvoiceByNumberOrId(body.invoiceId);
      const emails = invoice ? await recipients(c, invoice.orgId, user.email) : [user.email];
      const result = await refundInvoice(c.env, store, deps.gateway ?? safepayGateway(c.env), {
        invoiceId: body.invoiceId,
        amountMinor: body.amountMinor,
        recipientEmails: emails,
        actorEmail: user.email,
      });
      return c.json(result);
    } catch (err) {
      const e = errResponse(err);
      return c.json({ error: e.message }, e.status as 400);
    }
  });

  // Plans (superadmin-managed, max 4 active).
  routes.get("/api/superadmin/plans", guard, gate, async (c) => {
    return c.json({ plans: await billingStoreFor(c).listAllPlans() });
  });

  routes.post("/api/superadmin/plans", guard, gate, async (c) => {
    const body = (await c.req.json().catch(() => undefined)) as PlanInput | undefined;
    if (!body) return c.json({ error: "Invalid plan" }, 422);
    try {
      const plan = await createPlan(billingStoreFor(c), body);
      return c.json({ plan }, 201);
    } catch (err) {
      const e = errResponse(err);
      return c.json({ error: e.message }, e.status as 400);
    }
  });

  routes.patch("/api/superadmin/plans/:id", guard, gate, async (c) => {
    const body = (await c.req.json().catch(() => undefined)) as Partial<PlanInput & { active: number }> | undefined;
    if (!body) return c.json({ error: "Invalid plan" }, 422);
    try {
      const plan = await updatePlan(billingStoreFor(c), c.req.param("id"), body);
      return c.json({ plan });
    } catch (err) {
      const e = errResponse(err);
      return c.json({ error: e.message }, e.status as 400);
    }
  });

  routes.delete("/api/superadmin/plans/:id", guard, gate, async (c) => {
    try {
      await deletePlan(billingStoreFor(c), c.req.param("id"));
      return c.json({ ok: true });
    } catch (err) {
      const e = errResponse(err);
      return c.json({ error: e.message }, e.status as 400);
    }
  });

  // Coupons.
  routes.get("/api/superadmin/coupons", guard, gate, async (c) => {
    return c.json({ coupons: await billingStoreFor(c).listAllCoupons() });
  });

  routes.post("/api/superadmin/coupons", guard, gate, async (c) => {
    const user = c.get("user") as SessionUser;
    const body = (await c.req.json().catch(() => undefined)) as (CouponInput & { planIds?: string[] }) | undefined;
    if (!body) return c.json({ error: "Invalid coupon" }, 422);
    try {
      const coupon = await createCoupon(billingStoreFor(c), body, user.id);
      return c.json({ coupon }, 201);
    } catch (err) {
      const e = errResponse(err);
      return c.json({ error: e.message }, e.status as 400);
    }
  });

  routes.patch("/api/superadmin/coupons/:id", guard, gate, async (c) => {
    const body = (await c.req.json().catch(() => undefined)) as {
      active?: number;
      maxRedemptions?: number | null;
      validFrom?: number | null;
      validUntil?: number | null;
      durationCycles?: number | null;
      planIds?: string[];
    } | undefined;
    if (!body) return c.json({ error: "Invalid coupon" }, 422);
    try {
      const store = billingStoreFor(c);
      const { planIds, ...patch } = body;
      const coupon = await updateCoupon(store, c.req.param("id"), patch);
      if (planIds !== undefined) {
        for (const planId of planIds) {
          if (!(await store.getPlan(planId))) {
            return c.json({ error: `Unknown plan: ${planId}` }, 422);
          }
        }
        await store.setCouponPlans(coupon.id, planIds);
      }
      return c.json({ coupon: await store.getCouponById(coupon.id) });
    } catch (err) {
      const e = errResponse(err);
      return c.json({ error: e.message }, e.status as 400);
    }
  });

  routes.post("/api/superadmin/coupons/attach", guard, gate, async (c) => {
    const store = billingStoreFor(c);
    const body = (await c.req.json().catch(() => undefined)) as {
      subscriptionId?: string;
      code?: string;
    } | undefined;
    if (!body?.subscriptionId || !body?.code) {
      return c.json({ error: "subscriptionId and code are required" }, 422);
    }
    try {
      const sub = await store.getSubscription(body.subscriptionId);
      if (!sub) return c.json({ error: "Subscription not found" }, 404);
      await attachCoupon(store, body.subscriptionId, body.code, sub.planId);
      return c.json({ ok: true });
    } catch (err) {
      const e = errResponse(err);
      return c.json({ error: e.message }, e.status as 400);
    }
  });

  // Diagnostic reports: generated PDFs and resendable report links.
  routes.get("/api/superadmin/diagnostic-reports", guard, gate, async (c) => {
    const db = c.get("db") as Db;
    const limitRaw = Number.parseInt(c.req.query("limit") ?? "200", 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(500, Math.max(1, limitRaw)) : 200;
    const rows = await db
      .select({
        id: diagnosticRuns.id,
        orderId: diagnosticRuns.oneTimeOrderId,
        email: diagnosticRuns.email,
        provider: diagnosticRuns.provider,
        purpose: diagnosticRuns.purpose,
        status: diagnosticRuns.status,
        stage: diagnosticRuns.stage,
        progress: diagnosticRuns.progress,
        readyAt: diagnosticRuns.readyAt,
        reportEmailSentAt: diagnosticRuns.reportEmailSentAt,
        reportEmailResentAt: diagnosticRuns.reportEmailResentAt,
        reportEmailResendCount: diagnosticRuns.reportEmailResendCount,
        createdAt: diagnosticRuns.createdAt,
        orderBusinessName: oneTimeOrders.businessName,
        orderName: oneTimeOrders.name,
        baseline: sql<number>`exists (select 1 from one_time_orders bo where bo.baseline_run_id = ${diagnosticRuns.id})`,
        factsBusinessName: sql<string | null>`json_extract(${diagnosticRuns.factsJson}, '$.meta.businessName')`,
      })
      .from(diagnosticRuns)
      .leftJoin(oneTimeOrders, eq(diagnosticRuns.oneTimeOrderId, oneTimeOrders.id))
      .orderBy(desc(diagnosticRuns.createdAt))
      .limit(limit);
    return c.json({
      reports: rows.map(({ orderBusinessName, orderName, factsBusinessName, baseline, ...row }) => ({
        ...row,
        baseline: Boolean(baseline),
        businessName: orderBusinessName ?? factsBusinessName ?? orderName ?? null,
      })),
    });
  });

  routes.get("/api/superadmin/diagnostic-reports/:id/report", guard, gate, async (c) => {
    const db = c.get("db") as Db;
    const run = await getRunById(db, c.req.param("id"));
    if (!run) return c.json({ error: "Report not found" }, 404);
    if (run.status !== "ready" && run.status !== "ready_email_failed") {
      return c.json({ error: "Report is not ready" }, 409);
    }
    const pdf = await renderRunReport(db, run);
    if (!pdf) return c.json({ error: "The report could not be rendered." }, 500);
    const businessName = parseFacts(run)?.meta.businessName ?? null;
    const headers = new Headers({
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${reportFilename(businessName)}"`,
      "cache-control": "private, no-store",
    });
    const body = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
    return new Response(body, { status: 200, headers });
  });

  routes.post("/api/superadmin/diagnostic-reports/:id/resend", guard, gate, async (c) => {
    const user = c.get("user") as SessionUser | undefined;
    const db = c.get("db") as Db;
    const run = await getRunById(db, c.req.param("id"));
    if (!run) return c.json({ error: "Report not found" }, 404);
    try {
      await resendDiagnosticReportEmail(
        db,
        c.env as Env,
        run.id,
        user?.email ?? user?.id ?? "superadmin",
      );
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : "Could not resend report" },
        422,
      );
    }
    if (c.env.DB) {
      await writeAppLog(db, {
        level: "info",
        event: "diagnostic.report_resent",
        surface: "superadmin",
        message: `Report link resent for ${run.email}`,
        userId: user?.id ?? null,
        userEmail: user?.email ?? null,
        path: c.req.path,
        method: c.req.method,
      });
    }
    return c.json({ ok: true });
  });

  return routes;
}
