import { Hono } from "hono";
import { z } from "zod";
import { HTTPException } from "hono/http-exception";
import { createMiddleware } from "hono/factory";
import type { Env } from "../types";
import {
  contextMiddleware,
  createContextMiddleware,
  requireOrgRole,
  requireSession,
  sessionGuard,
  type MemberStore,
  type SessionResolver,
} from "../middleware";
import type { Auth } from "../auth";
import type { Db } from "../repositories/db";
import { drizzleSidekickStore, type BusinessProfileInput, type SidekickStore } from "../sidekick/store";
import { drizzleStore } from "../repositories/billing";
import { orgAccess, type OrgAccess } from "../billing/access";
import { encryptJson } from "../lib/crypto";
import { hashMcpToken, makeMcpToken } from "../lib/tokens";
import { ActionNameSchema, PROVIDER_DISPLAY_NAMES, ProviderKeySchema, isComingSoonProvider } from "../providers/types";
import { SpectoraAdapter } from "../providers/spectora/adapter";
import { IsnAdapter } from "../providers/isn/adapter";
import { IsnClient } from "../providers/isn/client";
import { buildManagementSnapshot, type ManagementSnapshot } from "../sidekick/management";
import {
  HOURLY_LOCAL_TIME_RE,
  isValidTimeZone,
  nextRunFor,
  parseScheduleRule,
  type ScheduleRule,
} from "../lib/local-time";
import type { ProviderKey } from "../providers/types";
import { EMPLOYEE_CATALOG, isKnownEmployee, isProEmployee } from "../mcp/prompts";

const ConnectionBody = z
  .object({
    orgId: z.string().min(1),
    provider: ProviderKeySchema,
    // Spectora shape.
    apiKey: z.string().trim().max(500).optional(),
    oauthAccessToken: z.string().trim().max(2000).optional(),
    mcpEndpoint: z.string().trim().url().max(500).optional(),
    // ISN shape (see docs/isn-contract.md): companyKey + access/secret keys
    // over HTTP Basic. `host` is compulsory (white-label domains differ).
    companyKey: z.string().trim().max(200).optional(),
    host: z.string().trim().max(255).optional(),
    accessKey: z.string().trim().max(500).optional(),
    secretKey: z.string().trim().max(500).optional(),
    externalAccountId: z.string().trim().max(200).optional(),
  })
  .superRefine((v, ctx) => {
    const mixed = (message: string) => ctx.addIssue({ code: "custom", message });
    if (isComingSoonProvider(v.provider)) {
      mixed(`${PROVIDER_DISPLAY_NAMES[v.provider]} is coming soon — connections are not accepted yet.`);
      return;
    }
    if (v.provider === "spectora") {
      if (v.companyKey || v.host || v.accessKey || v.secretKey) {
        mixed("Spectora connections take apiKey/oauthAccessToken, not ISN fields (companyKey/accessKey/secretKey)");
      }
      if (!v.apiKey && !v.oauthAccessToken) {
        mixed("Provide an API key or OAuth access token");
      }
    } else {
      if (v.apiKey || v.oauthAccessToken || v.mcpEndpoint) {
        mixed("ISN connections take companyKey/accessKey/secretKey, not Spectora fields (apiKey/oauthAccessToken/mcpEndpoint)");
      }
      if (!v.companyKey || !v.host || !v.accessKey || !v.secretKey) {
        mixed("ISN connections require companyKey, host, accessKey, and secretKey");
      }
    }
  });

const TokenBody = z.object({
  orgId: z.string().min(1),
  name: z.string().trim().min(1).max(60),
});

const PolicyBody = z.object({
  orgId: z.string().min(1),
  writePermission: z.enum(["READ", "SUGGEST", "EXECUTE"]),
  allowedActions: z.array(ActionNameSchema).default([]),
});

const EmployeeStateBody = z.object({
  orgId: z.string().min(1),
  active: z.boolean(),
});

/** Pro tier runs the full employee roster (trials + unlimited plans); capped plans get the starter three. */
function isProTier(access: OrgAccess): boolean {
  return access.state === "trial" || (access.state === "active" && access.maxUsers == null);
}

const ScheduleBody = z.object({
  orgId: z.string().min(1),
  type: z.string().trim().min(1).max(40),
  timezone: z.string().trim().min(1).max(80),
  // The Cron heartbeat is hourly, so only whole-hour local times can ever fire.
  localTime: z
    .string()
    .regex(HOURLY_LOCAL_TIME_RE, "localTime must be a whole hour (HH:00, 24h)"),
  // Owner-selected cadence detail. Weekly → weekday (0=Sun..6=Sat); monthly →
  // day of month (1-31). Optional so older clients / defaults keep working.
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  ruleJson: z.string().max(4000).default("{}"),
  deliveryJson: z.string().max(4000).default("{}"),
});

/** Human label for a cadence, used in the one-per-cadence conflict message. */
const SCHEDULE_LABELS: Record<string, string> = {
  morning_briefing: "A daily morning briefing",
  weekly_review: "A weekly review",
  monthly_review: "A monthly review",
};

/** Collapse the tolerated short aliases so duplicates are caught either way. */
function cadenceFamily(type: string): string {
  if (type === "weekly") return "weekly_review";
  if (type === "monthly") return "monthly_review";
  return type;
}

/**
 * The cadence detail a request asked for, narrowed to the fields that make
 * sense for its type (a weekday is meaningless for a monthly review).
 */
function requestedScheduleRule(
  type: string,
  body: { dayOfWeek?: number; dayOfMonth?: number },
): ScheduleRule {
  const rule: ScheduleRule = {};
  if ((type === "weekly_review" || type === "weekly") && body.dayOfWeek !== undefined) {
    rule.dayOfWeek = body.dayOfWeek;
  }
  if ((type === "monthly_review" || type === "monthly") && body.dayOfMonth !== undefined) {
    rule.dayOfMonth = body.dayOfMonth;
  }
  return rule;
}

/** Fold the owner-selected cadence day into the stored `ruleJson`. */
function mergeScheduleRule(ruleJson: string, rule: ScheduleRule): string {
  if (rule.dayOfWeek === undefined && rule.dayOfMonth === undefined) return ruleJson;
  let base: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(ruleJson) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      base = parsed as Record<string, unknown>;
    }
  } catch {
    base = {};
  }
  if (rule.dayOfWeek !== undefined) base.dayOfWeek = rule.dayOfWeek;
  if (rule.dayOfMonth !== undefined) base.dayOfMonth = rule.dayOfMonth;
  return JSON.stringify(base);
}

/**
 * The stored rule for a cadence, keeping only the day that cadence reads.
 *
 * A cadence reads one field (weekly → `dayOfWeek`, monthly → `dayOfMonth`),
 * so switching a schedule from weekly to monthly must not leave the old
 * weekday behind. A day that is not part of the edit is kept.
 */
function ruleJsonForCadence(base: string, type: string, rule: ScheduleRule): string {
  let obj: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(base) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      obj = parsed as Record<string, unknown>;
    }
  } catch {
    obj = {};
  }
  const family = cadenceFamily(type);
  if (family === "weekly_review") {
    delete obj.dayOfMonth;
    if (rule.dayOfWeek !== undefined) obj.dayOfWeek = rule.dayOfWeek;
  } else if (family === "monthly_review") {
    delete obj.dayOfWeek;
    if (rule.dayOfMonth !== undefined) obj.dayOfMonth = rule.dayOfMonth;
  } else {
    delete obj.dayOfWeek;
    delete obj.dayOfMonth;
  }
  return JSON.stringify(obj);
}

const BusinessProfileBody = z.object({
  orgId: z.string().min(1),
  businessName: z.string().max(200).optional(),
  trade: z.string().max(120).optional(),
  serviceArea: z.string().max(300).optional(),
  ownerName: z.string().max(200).optional(),
  teamSize: z.string().max(60).optional(),
  servicesMain: z.string().max(2000).optional(),
  servicesHighValue: z.string().max(2000).optional(),
  servicesRecurring: z.string().max(2000).optional(),
});

const SchedulePatchBody = z.object({
  type: z.string().trim().min(1).max(40).optional(),
  timezone: z.string().trim().min(1).max(80).optional(),
  localTime: z
    .string()
    .regex(HOURLY_LOCAL_TIME_RE, "localTime must be a whole hour (HH:00, 24h)")
    .optional(),
  // Cadence detail, same shape as create. Omitted fields keep the stored value.
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  ruleJson: z.string().max(4000).optional(),
  deliveryJson: z.string().max(4000).optional(),
  enabled: z.boolean().optional(),
});

function sidekickKey(env: Env): string {
  if (!env.MCP_ENCRYPTION_KEY) throw new Error("MCP_ENCRYPTION_KEY is not configured");
  return env.MCP_ENCRYPTION_KEY;
}

export function createSidekickRoutes(deps: {
  session?: SessionResolver;
  store?: MemberStore;
  ctx?: { db?: Db; auth?: Auth };
  sidekick?: SidekickStore;
  snapshot?: (env: Env, orgId: string, provider: ProviderKey) => Promise<ManagementSnapshot>;
  access?: (orgId: string) => Promise<OrgAccess>;
} = {}) {
  const routes = new Hono<{ Bindings: Env; Variables: { db: Db; access?: OrgAccess } }>();
  const guard = deps.session ? sessionGuard(deps.session) : requireSession;
  const mem = (min: "admin" | "user" | "viewer", allowSuperadmin = false) =>
    deps.store ? requireOrgRole(min, { store: deps.store }) : requireOrgRole(min, { allowSuperadmin });
  // Feature gate: trialing/active subscriptions only. Billing stays open so
  // gated orgs can always subscribe.
  const gated = () =>
    createMiddleware(async (c, next) => {
      const orgId = c.get("orgId") as string;
      const access = deps.access
        ? await deps.access(orgId)
        : await orgAccess(drizzleStore(c.get("db") as Db), orgId);
      if (access.state !== "trial" && access.state !== "active") {
        throw new HTTPException(402, { message: "Subscription required — upgrade from billing to restore access" });
      }
      c.set("access", access);
      await next();
    });

  routes.use("*", deps.ctx ? createContextMiddleware(deps.ctx) : contextMiddleware);

  const svc = (db: Db): SidekickStore => deps.sidekick ?? drizzleSidekickStore(db);

  // Provider connections (secret material never leaves the server).
  routes.get("/api/sidekick/connections", guard, mem("viewer", true), gated(), async (c) => {
    const orgId = c.get("orgId") as string;
    return c.json({ connections: await svc(c.get("db") as Db).listConnections(orgId) });
  });

  routes.post("/api/sidekick/connections", guard, mem("admin"), gated(), async (c) => {
    const env = c.env as Env;
    const parsed = ConnectionBody.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) {
      const detail = parsed.error.issues[0]?.message ?? "Invalid connection";
      return c.json({ error: detail }, 422);
    }
    const { orgId, provider, externalAccountId } = parsed.data;
    // One platform per org: reconnecting the same provider replaces
    // credentials; a different provider requires disconnecting first.
    const store = svc(c.get("db") as Db);
    const existing = await store.listConnections(orgId);
    const other = existing.find((conn) => conn.provider !== provider);
    if (other) {
      return c.json(
        { error: `This workspace is already connected to ${other.provider}. Disconnect it first to switch platforms.` },
        409,
      );
    }
    const credentials: Record<string, string> = {};
    let capabilitiesJson: string | null = null;
    if (provider === "spectora") {
      const { apiKey, oauthAccessToken, mcpEndpoint } = parsed.data;
      if (apiKey) credentials.apiKey = apiKey;
      if (oauthAccessToken) credentials.oauthAccessToken = oauthAccessToken;
      if (mcpEndpoint) credentials.mcpEndpoint = mcpEndpoint;
      try {
        const adapter = new SpectoraAdapter(env, { provider, credentials });
        capabilitiesJson = JSON.stringify(await adapter.capabilities());
      } catch {
        capabilitiesJson = null;
      }
    } else if (provider === "isn") {
      // ISN: validate the keys live against GET /me before storing
      // anything. Failures are 422 with sanitized detail (adapters never
      // echo credentials; IsnApiError messages carry no key material).
      const { companyKey, host, accessKey, secretKey } = parsed.data;
      const isnCreds: Record<string, string> = {
        companyKey: companyKey!,
        host: host!,
        accessKey: accessKey!,
        secretKey: secretKey!,
      };
      try {
        await new IsnClient({
          companyKey: companyKey!,
          host: host!,
          accessKey: accessKey!,
          secretKey: secretKey!,
        }).validateCredentials();
        const adapter = new IsnAdapter(env, { provider, credentials: isnCreds });
        capabilitiesJson = JSON.stringify(await adapter.capabilities());
      } catch (err) {
        const detail = err instanceof Error && err.message ? err.message.slice(0, 200) : "credential check failed";
        return c.json({ error: `ISN credential check failed: ${detail}` }, 422);
      }
      Object.assign(credentials, isnCreds);
    } else {
      // Unreachable: coming-soon providers are rejected by validation above.
      return c.json({ error: `${PROVIDER_DISPLAY_NAMES[provider]} is coming soon — connections are not accepted yet.` }, 422);
    }
    try {
      const connection = await store.saveConnection({
        id: crypto.randomUUID(),
        organizationId: orgId,
        provider,
        encryptedCredentials: await encryptJson(sidekickKey(env), credentials),
        status: "connected",
        capabilitiesJson,
        externalAccountId: externalAccountId ?? null,
      });
      return c.json({ connection });
    } catch (err) {
      if (err instanceof Error && err.message.includes("MCP_ENCRYPTION_KEY")) {
        return c.json({ error: "Server is missing MCP_ENCRYPTION_KEY" }, 500);
      }
      throw err;
    }
  });

  routes.delete("/api/sidekick/connections/:id", guard, mem("admin"), gated(), async (c) => {
    const orgId = c.get("orgId") as string;
    const ok = await svc(c.get("db") as Db).deleteConnection(c.req.param("id"), orgId);
    if (!ok) return c.json({ error: "Not found" }, 404);
    return c.json({ ok: true });
  });

  // MCP tokens (only the hash is stored; the token is shown once at creation).
  routes.get("/api/sidekick/mcp-tokens", guard, mem("admin", true), gated(), async (c) => {
    const orgId = c.get("orgId") as string;
    return c.json({ tokens: await svc(c.get("db") as Db).listTokens(orgId) });
  });

  routes.post("/api/sidekick/mcp-tokens", guard, mem("admin"), gated(), async (c) => {
    const env = c.env as Env;
    const parsed = TokenBody.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json({ error: "Invalid token request" }, 422);
    const { token, prefix } = makeMcpToken();
    const id = crypto.randomUUID();
    await svc(c.get("db") as Db).createToken({
      id,
      organizationId: parsed.data.orgId,
      name: parsed.data.name,
      tokenPrefix: prefix,
      tokenHash: await hashMcpToken(token, env.MCP_TOKEN_PEPPER),
    });
    return c.json({ id, token, prefix }, 201);
  });

  routes.post("/api/sidekick/mcp-tokens/:id/revoke", guard, mem("admin"), gated(), async (c) => {
    const orgId = c.get("orgId") as string;
    const ok = await svc(c.get("db") as Db).revokeToken(c.req.param("id"), orgId);
    if (!ok) return c.json({ error: "Not found" }, 404);
    return c.json({ ok: true });
  });

  // OAuth grants: AI apps connected via OAuth sign-in (client names only,
  // never token material). Revoking disconnects the app immediately.
  routes.get("/api/sidekick/oauth-grants", guard, mem("admin", true), gated(), async (c) => {
    const orgId = c.get("orgId") as string;
    const grants = await svc(c.get("db") as Db).listOAuthGrants(orgId, Math.floor(Date.now() / 1000));
    return c.json({ grants });
  });

  routes.post("/api/sidekick/oauth-grants/:clientId/revoke", guard, mem("admin"), gated(), async (c) => {
    const orgId = c.get("orgId") as string;
    const revoked = await svc(c.get("db") as Db).revokeOAuthGrants(
      orgId,
      c.req.param("clientId"),
      Math.floor(Date.now() / 1000),
    );
    if (revoked === 0) return c.json({ error: "Not found" }, 404);
    return c.json({ ok: true, revoked });
  });

  // Write policy (provider capability + org policy gate MCP writes).
  routes.get("/api/sidekick/policy", guard, mem("viewer", true), gated(), async (c) => {
    const orgId = c.get("orgId") as string;
    return c.json({ policy: await svc(c.get("db") as Db).getPolicy(orgId) });
  });

  routes.patch("/api/sidekick/policy", guard, mem("admin"), gated(), async (c) => {
    const parsed = PolicyBody.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json({ error: "Invalid policy" }, 422);
    const policy = await svc(c.get("db") as Db).savePolicy(parsed.data.orgId, {
      writePermission: parsed.data.writePermission,
      allowedActions: parsed.data.allowedActions,
    });
    return c.json({ policy });
  });

  // AI employee activation (per-org, persisted; honored by the MCP roster).
  // Absent rows mean "default": active when the plan entitles the employee.
  routes.get("/api/sidekick/employees", guard, mem("viewer", true), gated(), async (c) => {
    const orgId = c.get("orgId") as string;
    const proTier = isProTier(c.get("access") as OrgAccess);
    const states = await svc(c.get("db") as Db).listEmployeeStates(orgId);
    const byEmployee = new Map(states.map((s) => [s.employee, s.active]));
    return c.json({
      employees: EMPLOYEE_CATALOG.map((e) => {
        const entitled = e.tier === "starter" || proTier;
        return {
          name: e.name,
          title: e.title,
          tier: e.tier,
          entitled,
          active: byEmployee.get(e.name) ?? entitled,
        };
      }),
    });
  });

  routes.patch("/api/sidekick/employees/:name", guard, mem("admin"), gated(), async (c) => {
    const name = c.req.param("name");
    if (!isKnownEmployee(name)) return c.json({ error: "Unknown employee" }, 404);
    const parsed = EmployeeStateBody.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json({ error: "Invalid employee state" }, 422);
    const proTier = isProTier(c.get("access") as OrgAccess);
    if (parsed.data.active && isProEmployee(name) && !proTier) {
      return c.json({ error: "This is a Pro feature — upgrade to activate this AI employee." }, 403);
    }
    const state = await svc(c.get("db") as Db).saveEmployeeState(parsed.data.orgId, name, parsed.data.active);
    return c.json({ employee: state });
  });

  // Briefing schedules.
  routes.get("/api/sidekick/schedules", guard, mem("user", true), gated(), async (c) => {
    const orgId = c.get("orgId") as string;
    return c.json({ schedules: await svc(c.get("db") as Db).listSchedules(orgId) });
  });

  routes.post("/api/sidekick/schedules", guard, mem("user"), gated(), async (c) => {
    const parsed = ScheduleBody.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) {
      const detail = parsed.error.issues[0];
      return c.json({ error: `Invalid schedule (${detail?.message ?? "bad request"})` }, 422);
    }
    const access = c.get("access") as OrgAccess;
    if (!access.allowBriefings) {
      return c.json({ error: "Scheduled briefings require the Pro plan — upgrade to enable them." }, 403);
    }
    if (!isValidTimeZone(parsed.data.timezone)) {
      return c.json({ error: `Unknown timezone "${parsed.data.timezone}"` }, 422);
    }
    const store = svc(c.get("db") as Db);
    // One schedule per cadence: a second morning/weekly/monthly schedule would
    // duplicate the same briefing, so the second create is rejected (409).
    const existing = await store.listSchedules(parsed.data.orgId);
    if (existing.some((s) => cadenceFamily(s.type) === cadenceFamily(parsed.data.type))) {
      return c.json(
        { error: `${SCHEDULE_LABELS[cadenceFamily(parsed.data.type)] ?? "A schedule of that type"} already exists — edit or delete it first.` },
        409,
      );
    }
    const rule = requestedScheduleRule(parsed.data.type, parsed.data);
    let nextRunAt: Date;
    try {
      nextRunAt = nextRunFor(
        parsed.data.type,
        parsed.data.timezone,
        parsed.data.localTime,
        new Date(),
        rule,
      );
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : "Invalid local time" },
        422,
      );
    }
    const schedule = await store.createSchedule({
      id: crypto.randomUUID(),
      organizationId: parsed.data.orgId,
      type: parsed.data.type,
      timezone: parsed.data.timezone,
      localTime: parsed.data.localTime,
      ruleJson: mergeScheduleRule(parsed.data.ruleJson, rule),
      deliveryJson: parsed.data.deliveryJson,
      nextRunAt,
    });
    return c.json({ schedule }, 201);
  });

  routes.patch("/api/sidekick/schedules/:id", guard, mem("user"), gated(), async (c) => {
    const orgId = c.get("orgId") as string;
    const parsed = SchedulePatchBody.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) {
      const detail = parsed.error.issues[0];
      return c.json({ error: `Invalid schedule (${detail?.message ?? "bad request"})` }, 422);
    }
    const store = svc(c.get("db") as Db);
    const scheduleId = c.req.param("id");

    const schedules = await store.listSchedules(orgId);
    const current = schedules.find((s) => s.id === scheduleId);
    if (!current) return c.json({ error: "Not found" }, 404);

    const patch = parsed.data;
    const nextType = patch.type ?? current.type;

    if (patch.enabled) {
      const access = c.get("access") as OrgAccess;
      if (!access.allowBriefings) {
        return c.json({ error: "Scheduled briefings require the Pro plan — upgrade to enable them." }, 403);
      }
    }

    // Changing the cadence must respect the one-schedule-per-cadence rule.
    if (patch.type && cadenceFamily(patch.type) !== cadenceFamily(current.type)) {
      const taken = schedules.some(
        (s) => s.id !== scheduleId && cadenceFamily(s.type) === cadenceFamily(nextType),
      );
      if (taken) {
        return c.json(
          {
            error: `${SCHEDULE_LABELS[cadenceFamily(nextType)] ?? "A schedule of that type"} already exists — delete it first.`,
          },
          409,
        );
      }
    }

    // Fold the requested cadence day into the stored rule, keeping the
    // existing value when the field is not part of the edit.
    const incomingRuleJson = patch.ruleJson ?? current.ruleJson;
    const ruleJson = ruleJsonForCadence(
      incomingRuleJson,
      nextType,
      requestedScheduleRule(nextType, {
        dayOfWeek: patch.dayOfWeek,
        dayOfMonth: patch.dayOfMonth,
      }),
    );

    const timezone = patch.timezone ?? current.timezone;
    const localTime = patch.localTime ?? current.localTime;
    if (patch.timezone && !isValidTimeZone(patch.timezone)) {
      return c.json({ error: `Unknown timezone "${patch.timezone}"` }, 422);
    }

    // The stored fire time is only valid for the old timing, so recompute it
    // whenever the schedule could move.
    const timingChanged =
      patch.localTime !== undefined ||
      patch.timezone !== undefined ||
      patch.type !== undefined ||
      patch.dayOfWeek !== undefined ||
      patch.dayOfMonth !== undefined ||
      patch.ruleJson !== undefined;

    let nextRunAt: Date | undefined;
    if (timingChanged) {
      try {
        nextRunAt = nextRunFor(nextType, timezone, localTime, new Date(), parseScheduleRule(ruleJson));
      } catch (err) {
        return c.json(
          { error: err instanceof Error ? err.message : "Invalid schedule time" },
          422,
        );
      }
    }

    const schedule = await store.updateSchedule(scheduleId, orgId, {
      type: nextType,
      timezone,
      localTime,
      ruleJson,
      deliveryJson: patch.deliveryJson ?? current.deliveryJson,
      enabled: patch.enabled ?? current.enabled,
      ...(nextRunAt ? { nextRunAt } : {}),
    });
    if (!schedule) return c.json({ error: "Not found" }, 404);
    return c.json({ schedule });
  });

  routes.delete("/api/sidekick/schedules/:id", guard, mem("user"), gated(), async (c) => {
    const orgId = c.get("orgId") as string;
    const ok = await svc(c.get("db") as Db).deleteSchedule(c.req.param("id"), orgId);
    if (!ok) return c.json({ error: "Not found" }, 404);
    return c.json({ ok: true });
  });

  // Briefings + audit (reads).
  routes.get("/api/sidekick/briefings", guard, mem("viewer", true), gated(), async (c) => {
    const orgId = c.get("orgId") as string;
    const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 10) || 10, 1), 50);
    const page = Math.max(Number(c.req.query("page") ?? 1) || 1, 1);
    const offset = (page - 1) * limit;
    // One extra row tells us whether another page exists, without a count query.
    const rows = await svc(c.get("db") as Db).listBriefings(orgId, limit + 1, offset);
    const hasMore = rows.length > limit;
    return c.json({ briefings: hasMore ? rows.slice(0, limit) : rows, page, limit, hasMore });
  });

  routes.delete("/api/sidekick/briefings/:id", guard, mem("user"), gated(), async (c) => {
    const orgId = c.get("orgId") as string;
    const ok = await svc(c.get("db") as Db).deleteBriefing(c.req.param("id"), orgId);
    if (!ok) return c.json({ error: "Not found" }, 404);
    return c.json({ ok: true });
  });

  routes.get("/api/sidekick/audit", guard, mem("admin", true), gated(), async (c) => {
    const orgId = c.get("orgId") as string;
    const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 50) || 50, 1), 100);
    return c.json({ events: await svc(c.get("db") as Db).listAudit(orgId, limit) });
  });

  // Business profile stays open for gated orgs (profile + billing are the
  // two surfaces an expired trial can still use).
  routes.get("/api/sidekick/business-profile", guard, mem("viewer", true), async (c) => {
    const orgId = c.get("orgId") as string;
    const profile = await svc(c.get("db") as Db).getBusinessProfile(orgId);
    return c.json({ profile });
  });

  routes.put("/api/sidekick/business-profile", guard, mem("admin"), async (c) => {
    const parsed = BusinessProfileBody.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json({ error: "Invalid business profile" }, 422);
    const { orgId, ...fields } = parsed.data;
    const cleaned = Object.fromEntries(
      Object.entries(fields).map(([k, v]) => [k, v === undefined ? null : String(v).trim() === "" ? null : String(v).trim().slice(0, 2000)]),
    ) as Omit<BusinessProfileInput, "organizationId">;
    const profile = await svc(c.get("db") as Db).saveBusinessProfile(orgId, cleaned);
    return c.json({ profile });
  });

  // Dashboard overview (fast: no provider calls) + live snapshot (provider call).
  routes.get("/api/sidekick/overview", guard, mem("viewer", true), gated(), async (c) => {
    const orgId = c.get("orgId") as string;
    const s = svc(c.get("db") as Db);
    const [connections, tokens, schedules, latestBriefing, policy, oauthConnected] = await Promise.all([
      s.listConnections(orgId),
      s.listTokens(orgId),
      s.listSchedules(orgId),
      s.latestBriefing(orgId),
      s.getPolicy(orgId),
      s.hasActiveOAuthGrant(orgId, Math.floor(Date.now() / 1000)),
    ]);
    return c.json({
      overview: {
        connections,
        activeTokens: tokens.filter((t) => !t.revokedAt),
        oauthConnected,
        enabledSchedules: schedules.filter((x) => x.enabled),
        latestBriefing,
        policy,
      },
    });
  });

  routes.get("/api/sidekick/snapshot", guard, mem("viewer", true), gated(), async (c) => {
    const orgId = c.get("orgId") as string;
    const requested = c.req.query("provider");
    const build = deps.snapshot ?? buildManagementSnapshot;
    try {
      // When no explicit provider is requested, use the org's actual
      // platform connection (one platform per workspace). This keeps the
      // dashboard working for ISN orgs instead of hard-failing on a
      // hard-coded spectora default and making Retry loop forever.
      let provider: ProviderKey;
      if (requested === "isn" || requested === "spectora") {
        provider = requested;
      } else {
        const existing = await svc(c.get("db") as Db).listConnections(orgId);
        const found = ProviderKeySchema.safeParse(existing[0]?.provider);
        if (!found.success) {
          return c.json({ error: "No provider connection configured." }, 409);
        }
        provider = found.data;
      }
      const snapshot = await build(c.env as Env, orgId, provider);
      return c.json({ snapshot });
    } catch (err) {
      if (err instanceof Error && /no .* connection configured/i.test(err.message)) {
        return c.json({ error: err.message }, 409);
      }
      // Preserve the underlying provider reason (truncated, never secret
      // material — adapters never echo credentials) so the dashboard Retry
      // shows something actionable instead of a stuck generic message.
      const detail = err instanceof Error && err.message ? err.message.slice(0, 300) : "provider request failed";
      console.error(`snapshot failed org=${orgId}: ${detail}`);
      return c.json({ error: `Snapshot unavailable: ${detail}` }, 502);
    }
  });

  return routes;
}
