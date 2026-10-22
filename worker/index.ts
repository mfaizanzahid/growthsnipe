import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/server";
import { createApp } from "../src/server";
import type { Env } from "../src/server/lib/env";
import { authenticateMcpRequest, loadOrgConnection } from "../src/server/mcp/auth";
import { decryptJson } from "../src/server/lib/crypto";
import { formatBusinessProfileText } from "../src/server/sidekick/store";
import { sidekickBusinessProfiles } from "../src/server/db/schema";
import { createProviderAdapter } from "../src/server/providers/registry";
import { buildBusinessSidekickServer } from "../src/server/mcp/server";
import { sidekickEmployeeStates, sidekickPolicies } from "../src/server/db/schema";
import { runDueSchedules } from "../src/server/scheduler/scheduler";
import { createDb } from "../src/server/repositories/db";
import { drizzleStore } from "../src/server/repositories/billing";
import { getSetting, setSetting } from "../src/server/repositories";
import type { Db } from "../src/server/repositories/db";
import { orgAccess } from "../src/server/billing/access";
import { STARTER_EMPLOYEE_PROMPTS, resolveEmployeeRoster } from "../src/server/mcp/prompts";
import type { ProviderKey } from "../src/server/providers/types";
import { dbIdempotency } from "../src/server/lib/idempotency";
import { safepayGateway } from "../src/server/billing/gateway";
import { processDueSubscriptions } from "../src/server/billing/renewals";
import { processTrials } from "../src/server/billing/trials";
import { enforcePlanLimits } from "../src/server/billing/access-limits";
import { drizzleSidekickStore } from "../src/server/sidekick/store";
import {
  clientIp,
  purgeAppLogs,
  requestGeo,
  requestId,
  retentionDays,
  writeAppLog,
} from "../src/server/lib/app-logs";
import { planCron } from "../src/server/lib/cron-plan";

const billingApp = createApp();
const mcpApp = new Hono<{ Bindings: Env }>();

/**
 * The daily Cron trigger. Must match the "0 3 * * *" entry in
 * wrangler.jsonc triggers.crons (top level and env.production).
 */
const DAILY_CRON = "0 3 * * *";

/** app_settings key holding the UTC day the billing cron last ran. */
const BILLING_RUN_DAY_KEY = "billing_cron_last_run_day";

function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Whether the daily billing run already happened on this UTC day. */
async function lastBillingDay(db: Db): Promise<string | null> {
  try {
    return await getSetting(db, BILLING_RUN_DAY_KEY);
  } catch {
    // A failed read must not silently skip billing - treat it as "never ran".
    return null;
  }
}

/** Record that billing ran, so the hourly tick does not repeat it. */
async function markBillingDay(db: Db, now: number): Promise<void> {
  try {
    await setSetting(db, BILLING_RUN_DAY_KEY, utcDay(now));
  } catch (err) {
    console.error("[cron] could not record the billing run day", err);
  }
}

mcpApp.all("/mcp", async (c) => {
  const authResult = await authenticateMcpRequest(c.req.raw, c.env);
  if (authResult instanceof Response) {
    // 401 = bad/missing token, 402 = workspace is gated. Both are worth a
    // row: a 401 spike means a broken client, a 402 spike means a churn
    // signal.
    if (authResult.status === 401 || authResult.status === 402) {
      await writeAppLog(createDb(c.env.DB), {
        level: "warn",
        event: "mcp.auth_failed",
        surface: "mcp",
        message:
          authResult.status === 401
            ? "MCP request rejected: invalid or missing bearer token"
            : "MCP request rejected: workspace is not in an active subscription state",
        path: c.req.path,
        method: c.req.method,
        statusCode: authResult.status,
        ip: clientIp(c.req.raw.headers),
        userAgent: c.req.header("user-agent") ?? null,
        requestId: requestId(c.req.raw.headers),
        ...requestGeo(c.req.raw),
      });
    }
    return authResult;
  }
  const principal = authResult;
  const connection = await loadOrgConnection(c.env, principal.organizationId);
  if (!connection) return c.json({ error: "No provider connection is configured for this workspace." }, 409);
  if (!c.env.MCP_ENCRYPTION_KEY) return c.json({ error: "Server is missing MCP_ENCRYPTION_KEY" }, 500);
  const adapter = createProviderAdapter(c.env, {
    provider: connection.provider as ProviderKey,
    credentials: await decryptJson<Record<string, string>>(c.env.MCP_ENCRYPTION_KEY, connection.encryptedCredentials),
  });
  // Organization write policy gates MCP writes (default READ = data tools only).
  const db = drizzle(c.env.DB);
  const policyRows = await db
    .select()
    .from(sidekickPolicies)
    .where(eq(sidekickPolicies.organizationId, principal.organizationId))
    .limit(1);
  const policyRow = policyRows[0];
  // Personalize served instructions with the org's business profile.
  const profileRows = await db
    .select()
    .from(sidekickBusinessProfiles)
    .where(eq(sidekickBusinessProfiles.organizationId, principal.organizationId))
    .limit(1);
  // Plan-tier employee roster: trials and unlimited plans get every advisor;
  // capped (Starter) plans get the starter three — Pro prompts stay hidden
  // from prompts/list and are refused when called directly.
  const store = drizzleStore(createDb(c.env.DB));
  const access = await orgAccess(store, principal.organizationId);
  const proTier = access.state === "trial" || (access.state === "active" && access.maxUsers == null);
  // Deactivated employees leave the roster: hidden from prompts/list and
  // refused when called directly. Stored active=true never widens the base.
  const employeeStates = await db
    .select()
    .from(sidekickEmployeeStates)
    .where(eq(sidekickEmployeeStates.organizationId, principal.organizationId));
  const employees = resolveEmployeeRoster(
    proTier ? undefined : [...STARTER_EMPLOYEE_PROMPTS],
    employeeStates.map((s) => ({ employee: s.employee, active: s.active ?? true })),
  );
  const server = buildBusinessSidekickServer(c.env, adapter, {
    permission: (policyRow?.writePermission as "READ" | "SUGGEST" | "EXECUTE" | undefined) ?? "READ",
    allowedActions: policyRow?.allowedActionsJson ? JSON.parse(policyRow.allowedActionsJson) : [],
    employees,
    profileText: formatBusinessProfileText(profileRows[0] ?? null),
    auditContext: {
      organizationId: principal.organizationId,
      principalType: principal.kind,
      principalId: principal.tokenId,
      provider: connection.provider,
    },
  });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  const parsedBody = await c.req.raw.clone().json().catch(() => undefined);
  return transport.handleRequest(c.req.raw, { parsedBody });
});

const app = new Hono<{ Bindings: Env }>();
app.route("/", mcpApp);
app.all("/api/*", (c) => billingApp.fetch(c.req.raw, c.env, c.executionCtx));
app.all("/auth/*", (c) => billingApp.fetch(c.req.raw, c.env, c.executionCtx));
app.all("/webhooks/*", (c) => billingApp.fetch(c.req.raw, c.env, c.executionCtx));
  app.get("/health", (c) => c.json({ ok: true, service: "growthsnipe" }));
app.all("*", (c) => billingApp.fetch(c.req.raw, c.env, c.executionCtx));

export default {
  fetch: app.fetch,
    /**
     * Combined Cron:
     * - Daily billing renewals (Safepay unscheduled_cof, manual schedule only).
     * - Daily trial ownership (reminders at -5/-3/0/+3/+5, expiry flip).
     * - 5-min Sidekick briefing tick (due D1 schedules → briefing jobs).
     * - Daily platform-log retention purge.
     *
     * The two triggers are distinguished by controller.cron, so billing runs
     * once a day and the hourly tick only advances briefings. Billing
     * operations are day-granular (reminder offsets, dunning windows, 24h
     * auto-retry gaps), so running them every tick was wasted work.
     *
     * Advances nextCharge only after successful charge; briefing jobs are idempotent.
     */
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    const db = createDb(env.DB);
    const store = drizzleStore(db);
    const now = controller.scheduledTime;

    const plan = planCron({
      cron: controller.cron,
      dailyCron: DAILY_CRON,
      lastBillingDay: (await lastBillingDay(db)) ?? "",
      today: utcDay(now),
    });

    const jobs: Promise<unknown>[] = [];

    if (plan.runBilling) {
      // The day is only marked once billing has actually completed, so a
      // crash mid-run leaves the day unmarked and the next tick retries.
      jobs.push(
        (async () => {
          await Promise.all([
            processDueSubscriptions(env, store, dbIdempotency(db), safepayGateway(env)).then(
              async (r) => {
                console.log(`[cron] renewals: ${JSON.stringify(r)}`);
                await writeAppLog(db, {
                  level: "info",
                  event: "cron.renewals",
                  surface: "cron",
                  message: `Renewal run: ${r.charged} charged, ${r.failed} failed, ${r.checked} checked`,
                  detail: r,
                });
              },
              async (err) => {
                console.error("[cron] renewals failed", err);
                await writeAppLog(db, {
                  level: "error",
                  event: "cron.renewals_failed",
                  surface: "cron",
                  message: err instanceof Error ? err.message : "Renewal run failed",
                  detail: err,
                });
              },
            ),
            processTrials(
              env,
              store,
              async (orgId) =>
                (await store.listOrgMembers(orgId))
                  .filter((m) => m.role === "admin" && m.status === "active")
                  .map((m) => m.email),
              undefined,
              // A prepaid trial switches to its paid plan when the trial ends:
              // enforce that plan's limits now (downgrade semantics - no
              // reactivation), the trial tier applies up to this point.
              async (orgId, planId) => {
                const sidekick = drizzleSidekickStore(createDb(env.DB));
                await enforcePlanLimits(
                  {
                    getPlan: (id) => store.getPlan(id),
                    listMembers: (oid) => store.listOrgMembers(oid),
                    setMemberStatus: (oid, mid, status, suspendedBy) =>
                      store.setMemberStatus(oid, mid, status, suspendedBy),
                    listSchedules: (oid) => sidekick.listSchedules(oid),
                    updateSchedule: (id, oid, patch) => sidekick.updateSchedule(id, oid, patch),
                  },
                  orgId,
                  planId,
                  { reactivate: false },
                );
              },
            ).then(
              async (r) => {
                console.log(`[cron] trials: ${JSON.stringify(r)}`);
                await writeAppLog(db, {
                  level: "info",
                  event: "cron.trials",
                  surface: "cron",
                  message: `Trial run: ${JSON.stringify(r)}`,
                  detail: r,
                });
              },
              async (err) => {
                console.error("[cron] trials failed", err);
                await writeAppLog(db, {
                  level: "error",
                  event: "cron.trials_failed",
                  surface: "cron",
                  message: err instanceof Error ? err.message : "Trial run failed",
                  detail: err,
                });
              },
            ),
          ]);
          await markBillingDay(db, now);
        })(),
      );
    }

    // Briefings advance on the hourly tick. The daily trigger skips them
    // so a briefing is never scheduled twice in the same minute.
    if (plan.runBriefings) {
      jobs.push(
        runDueSchedules(env, now).then(
          async (r) => {
            console.log(`[cron] sidekick: ${JSON.stringify(r)}`);
            await writeAppLog(db, {
              level: "info",
              event: "cron.briefings",
              surface: "cron",
              message: `Briefing tick: ${JSON.stringify(r)}`,
              detail: r,
            });
          },
          async (err) => {
            console.error("[cron] sidekick failed", err);
            await writeAppLog(db, {
              level: "error",
              event: "cron.briefings_failed",
              surface: "cron",
              message: err instanceof Error ? err.message : "Briefing tick failed",
              detail: err,
            });
          },
        ),
      );
    }

    // Retention sweep: platform logs older than the window are deleted once a
    // day, on the daily trigger only.
    if (plan.runRetentionPurge) {
      const retention = retentionDays(env);
      jobs.push(
        purgeAppLogs(db, retention).then(
          async (removed) => {
            await writeAppLog(db, {
              level: "info",
              event: "cron.retention_purged",
              surface: "cron",
              message: `Purged ${removed} log rows older than ${retention} days`,
              detail: { removed, retentionDays: retention },
            });
          },
          async (err) => {
            console.error("[cron] retention purge failed", err);
            await writeAppLog(db, {
              level: "error",
              event: "cron.retention_purge_failed",
              surface: "cron",
              message: err instanceof Error ? err.message : "Retention purge failed",
              detail: err,
            });
          },
        ),
      );
    }

    ctx.waitUntil(Promise.all(jobs));
  },
};
