import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { Context } from "hono";
import type { Env, OrgRole } from "./types";
import type { Db } from "./repositories/db";
import type { Auth } from "./auth";
import { createAuth, superadminSeedEmails } from "./auth";
import { createDb } from "./repositories/db";
import { getMember, isSuperadmin, seedSuperadmins } from "./repositories";
import { roleAtLeast } from "./lib/access";

export interface SessionUser {
  id: string;
  email: string;
  name?: string | null;
  emailVerified: boolean;
}

export interface AuthedVariables {
  db: Db;
  auth: Auth;
  user: SessionUser;
  orgId?: string;
  orgRole?: string;
  superadmin?: boolean;
}

type AppEnv = { Bindings: Env; Variables: AuthedVariables };

/** Narrow data-access surface used by the guards (real or fake in tests). */
export interface MemberStore {
  getMember(
    orgId: string,
    userId: string,
  ): Promise<{ role: string; status?: string | null } | null>;
  isSuperadmin(userId: string): Promise<boolean>;
  seedSuperadmins(emails: string[]): Promise<void>;
}

/** Live MemberStore backed by the request database. */
export function liveStore(db: Db): MemberStore {
  return {
    getMember: async (orgId, userId) => {
      const row = await getMember(db, orgId, userId);
      return row ? { role: row.role, status: row.memberStatus ?? "active" } : null;
    },
    isSuperadmin: (userId) => isSuperadmin(db, userId),
    seedSuperadmins: (emails) => seedSuperadmins(db, emails).then(() => undefined),
  };
}

/** Attach db + auth instances to every request (overridable in tests). */
export function createContextMiddleware(overrides?: { db?: Db; auth?: Auth }) {
  return createMiddleware<AppEnv>(async (c, next) => {
    if (overrides?.db && overrides?.auth) {
      c.set("db", overrides.db);
      c.set("auth", overrides.auth);
    } else {
      const db = createDb(c.env.DB);
      c.set("db", db);
      c.set("auth", createAuth(c.env, db));
    }
    await next();
  });
}

export const contextMiddleware = createContextMiddleware();

export type SessionResolver = (c: Context) => Promise<SessionUser | null>;

async function liveSession(c: Context): Promise<SessionUser | null> {
  const auth = (c as Context<{ Variables: AuthedVariables }>).get("auth") as Auth | undefined;
  if (!auth) return null;
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    emailVerified: session.user.emailVerified,
  };
}

/** Require a valid session (resolver injectable in tests). 401 otherwise. */
export function sessionGuard(resolver?: SessionResolver) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = await (resolver ?? liveSession)(c);
    if (!user) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }
    c.set("user", user);
    await next();
  });
}

export const requireSession = sessionGuard();

/**
 * Require membership in `orgId` (query → body → route param, in that order)
 * with at least `minRole`. 422 when orgId is missing, 403 when membership or
 * role is insufficient. Superadmin bypasses ONLY when `allowSuperadmin` is set
 * (reads + usage-charge creation per the tenancy rule).
 */
export function requireOrgRole(
  minRole: OrgRole,
  opts?: { allowSuperadmin?: boolean; store?: MemberStore },
) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get("user") as SessionUser | undefined;
    if (!user) throw new HTTPException(401, { message: "Unauthorized" });
    const store = opts?.store ?? liveStore(c.get("db") as Db);

    const url = new URL(c.req.url);
    const fromQuery = url.searchParams.get("orgId") ?? undefined;
    const fromParam = (c.req.param("orgId") as string | undefined) || undefined;
    let fromBody: string | undefined;
    if (c.req.method === "POST" || c.req.method === "PATCH" || c.req.method === "PUT") {
      try {
        // Clone so the route handler can still parse the original body.
        const body = (await c.req.raw.clone().json().catch(() => undefined)) as
          | { orgId?: unknown }
          | undefined;
        if (typeof body?.orgId === "string") fromBody = body.orgId;
      } catch {
        // ignore — orgId may come from query/param
      }
    }
    const orgId = fromQuery ?? fromBody ?? fromParam;
    if (!orgId) throw new HTTPException(422, { message: "orgId is required" });

    if (opts?.allowSuperadmin) {
      // c.env is undefined in unit tests (no bindings bound); default to {}.
      await store.seedSuperadmins(superadminSeedEmails((c.env ?? {}) as Env));
      if (await store.isSuperadmin(user.id)) {
        c.set("orgId", orgId);
        c.set("orgRole", "superadmin");
        c.set("superadmin", true);
        await next();
        return;
      }
    }

    const member = await store.getMember(orgId, user.id);
    if (!member || !roleAtLeast(member.role, minRole)) {
      throw new HTTPException(403, { message: "Forbidden" });
    }
    if ((member.status ?? "active") !== "active") {
      throw new HTTPException(403, { message: "Membership suspended" });
    }
    c.set("orgId", orgId);
    c.set("orgRole", member.role);
    c.set("superadmin", false);
    await next();
  });
}

/** Require global superadmin (self-heals the seed flag first). */
export function requireSuperadmin(opts?: { store?: MemberStore }) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get("user") as SessionUser | undefined;
    if (!user) throw new HTTPException(401, { message: "Unauthorized" });
  const store = opts?.store ?? liveStore(c.get("db") as Db);
  await store.seedSuperadmins(superadminSeedEmails((c.env ?? {}) as Env));
    if (!(await store.isSuperadmin(user.id))) {
      throw new HTTPException(403, { message: "Forbidden" });
    }
    c.set("superadmin", true);
    await next();
  });
}
