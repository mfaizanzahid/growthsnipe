import { Hono } from "hono";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "./types";
import { createAuth } from "./auth";
import { createDb } from "./repositories/db";
import { healthRoutes } from "./routes/health";
import { createOrgRoutes } from "./routes/orgs";
import { createSuperadminRoutes } from "./routes/superadmin";
import { createPlansRoutes } from "./routes/plans";
import { createContactRoutes } from "./routes/contact";
import { createPendingEmailRoutes } from "./routes/pending-email";
import { createBillingRoutes } from "./routes/billing";
import { createSidekickRoutes } from "./routes/sidekick";
import { createOAuthRoutes } from "./routes/oauth";
import { createWebhookRoutes } from "./routes/webhooks";
import type { AuthedVariables } from "./middleware";
import {
  clientIp,
  requestGeo,
  requestId,
  writeAppLog,
  type LogLevel,
  type LogSurface,
} from "./lib/app-logs";

type AppEnv = { Bindings: Env; Variables: AuthedVariables & { loggedError?: boolean } };

/** Auth endpoint -> (event, level) mapping. Paths are Better Auth routes. */
const AUTH_EVENTS: Record<string, { event: string; level: LogLevel }> = {
  "/sign-up/email": { event: "auth.signup", level: "info" },
  "/sign-in/email": { event: "auth.login", level: "info" },
  "/sign-in/social": { event: "auth.login", level: "info" },
  "/sign-in/magic-link": { event: "auth.magic_link_requested", level: "info" },
  "/magic-link/verify": { event: "auth.magic_link_consumed", level: "info" },
  "/request-password-reset": { event: "auth.password_reset_requested", level: "info" },
  "/reset-password": { event: "auth.password_reset_completed", level: "info" },
  "/verify-email": { event: "auth.email_verified", level: "info" },
  "/sign-out": { event: "auth.signout", level: "info" },
};

/** Auth failures get their own event so a spike is visible in one filter. */
const AUTH_FAILURES: Record<string, string> = {
  "/sign-up/email": "auth.signup_failed",
  "/sign-in/email": "auth.login_failed",
  "/sign-in/social": "auth.login_failed",
  "/sign-in/magic-link": "auth.magic_link_failed",
  "/magic-link/verify": "auth.magic_link_failed",
  "/request-password-reset": "auth.password_reset_failed",
  "/reset-password": "auth.password_reset_failed",
  "/verify-email": "auth.email_verification_failed",
};

function authSurface(path: string): string {
  return path.replace(/^.*\/api\/auth/, "");
}

/** Best-effort actor identity for a request, without trusting client input. */
function actor(c: Context<AppEnv>) {
  const user = c.get("user") as AuthedVariables["user"] | undefined;
  return {
    userId: user?.id ?? null,
    userEmail: user?.email ?? null,
    orgId: c.get("orgId") ?? null,
  };
}

function requestMeta(c: Context<AppEnv>) {
  return {
    path: c.req.path,
    method: c.req.method,
    ip: clientIp(c.req.raw.headers),
    userAgent: c.req.header("user-agent") ?? null,
    requestId: requestId(c.req.raw.headers),
    // Cloudflare resolves the city/country from the client IP, so the
    // superadmin log table can show where a request came from.
    ...requestGeo(c.req.raw),
  };
}

export function createApp() {
  const app = new Hono<AppEnv>();

  // Errors: any response >= 500 is logged after the handler runs, and
  // app.onError below catches thrown exceptions (which Hono would otherwise
  // turn into a bare 500 with no recorded detail).
  app.use("*", async (c, next) => {
    await next();
    if (c.res.status < 500 || c.get("loggedError")) return;
    if (!c.env.DB) return;
    await writeAppLog(createDb(c.env.DB), {
      level: "error",
      event: "http.5xx",
      surface: "api",
      message: `${c.req.method} ${c.req.path} returned ${c.res.status}`,
      statusCode: c.res.status,
      ...requestMeta(c),
      ...actor(c),
    });
  });

  // Superadmin writes are audited in the platform log with actor identity.
  app.use("/api/superadmin/*", async (c, next) => {
    await next();
    if (c.req.method === "GET" || !c.env.DB) return;
    const user = c.get("user") as AuthedVariables["user"] | undefined;
    await writeAppLog(createDb(c.env.DB), {
      level: c.res.status >= 400 ? "warn" : "info",
      event: "superadmin.write",
      surface: "superadmin",
      message: `${c.req.method} ${c.req.path}`,
      statusCode: c.res.status,
      userId: user?.id ?? null,
      userEmail: user?.email ?? null,
      ...requestMeta(c),
    });
  });

  // Better Auth handler (email+password, Google, magic link, organization).
  // Must be registered before any catch-all; matches basePath /api/auth.
  app.all("/api/auth/*", async (c) => {
    const auth = createAuth(c.env, createDb(c.env.DB));
    const response = await auth.handler(c.req.raw);
    await logAuthEvent(c, response.status);
    return response;
  });

  app.route("/", healthRoutes);
  app.route("/", createOrgRoutes());
  app.route("/", createSuperadminRoutes());
  app.route("/", createPlansRoutes());
  app.route("/", createContactRoutes());
  app.route("/", createPendingEmailRoutes());
  app.route("/", createBillingRoutes());
  app.route("/", createSidekickRoutes());
  app.route("/", createOAuthRoutes());
  app.route("/", createWebhookRoutes());

  app.onError(async (err, c) => {
    c.set("loggedError", true);
    const status = err instanceof HTTPException ? err.status : 500;
    // HTTPException carries deliberate client errors (401/403/404). They are
    // not incidents - only 5xx is worth recording.
    if (status >= 500 && c.env.DB) {
      await writeAppLog(createDb(c.env.DB), {
        level: "error",
        event: "http.unhandled_error",
        surface: errorSurface(c.req.path),
        message: err instanceof Error ? err.message : "Unhandled error",
        statusCode: status,
        ...requestMeta(c),
        ...actor(c),
        detail: err instanceof Error ? { name: err.name, stack: err.stack } : { error: String(err) },
      });
    }
    if (err instanceof HTTPException) return err.getResponse();
    return c.json({ error: "Internal server error" }, 500);
  });

  app.notFound((c) => c.json({ error: "Not found" }, 404));

  return app;
}

function errorSurface(path: string): LogSurface {
  if (path.startsWith("/api/auth")) return "auth";
  if (path.startsWith("/webhooks")) return "webhook";
  if (path.startsWith("/api/superadmin")) return "superadmin";
  return "api";
}

/**
 * Record one auth event. The email is taken from the request body when the
 * endpoint accepts one, so a failed login is still attributable to a person.
 * Passwords are never read.
 */
async function logAuthEvent(c: Context<AppEnv>, status: number): Promise<void> {
  const suffix = authSurface(c.req.path);
  const mapped = AUTH_EVENTS[suffix];
  if (!mapped || !c.env.DB) return;
  const failed = status >= 400;
  const event = failed ? (AUTH_FAILURES[suffix] ?? mapped.event) : mapped.event;
  await writeAppLog(createDb(c.env.DB), {
    level: failed ? "warn" : mapped.level,
    event,
    surface: "auth",
    message: `${c.req.method} ${c.req.path} -> ${status}`,
    statusCode: status,
    userEmail: await emailFromBody(c),
    ...requestMeta(c),
  });
}

/** Read just the email from a JSON body. Passwords and tokens are ignored. */
async function emailFromBody(c: Context<AppEnv>): Promise<string | null> {
  if (c.req.method !== "POST") return null;
  try {
    const body = (await c.req.raw.clone().json().catch(() => undefined)) as
      | { email?: unknown }
      | undefined;
    return typeof body?.email === "string" ? body.email : null;
  } catch {
    return null;
  }
}
