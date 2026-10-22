import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../types";
import {
  contextMiddleware,
  createContextMiddleware,
  liveStore,
  requireOrgRole,
  requireSession,
  sessionGuard,
  type SessionResolver,
  type MemberStore,
  type SessionUser,
} from "../middleware";
import type { Auth } from "../auth";
import { superadminSeedEmails } from "../auth";
import type { Db } from "../repositories/db";
import { drizzleStore, type BillingStore } from "../repositories/billing";
import { listOrgsForUser, getSetting, type OrgMembership } from "../repositories";
import { orgAccess } from "../billing/access";
import { PORTAL_NAME } from "../lib/brand";

export interface OrgService {
  listForUser(userId: string): Promise<OrgMembership[]>;
  create(
    userId: string,
    input: { name: string; slug?: string },
  ): Promise<{ id: string; name: string; slug: string | null }>;
}

function slugify(name: string): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "org";
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}-${suffix}`;
}

const CreateOrgSchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
});

export function createOrgRoutes(deps: {
  orgs?: OrgService;
  session?: SessionResolver;
  store?: MemberStore;
  ctx?: { db?: Db; auth?: Auth };
  billing?: BillingStore;
} = {}) {  const routes = new Hono<{ Bindings: Env; Variables: { db: Db } }>();
  const guard = deps.session ? sessionGuard(deps.session) : requireSession;

  routes.use("*", deps.ctx ? createContextMiddleware(deps.ctx) : contextMiddleware);

  // List orgs the caller belongs to (top-left dropdown source).
  routes.get("/api/orgs", guard, async (c) => {
    const user = c.get("user") as SessionUser;
    const db = c.get("db") as Db;
    const service: OrgService =
      deps.orgs ?? {
        listForUser: (userId) => listOrgsForUser(db, userId),
        create: () => {
          throw new Error("not implemented");
        },
      };
    return c.json({ orgs: await service.listForUser(user.id) });
  });

  // Create an org; caller becomes admin (plugin creatorRole).
  routes.post("/api/orgs", guard, async (c) => {
    const user = c.get("user") as SessionUser;
    const parsed = CreateOrgSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) {
      return c.json({ error: "Name is required (1-100 chars)" }, 422);
    }
    const auth = c.get("auth");
    const db = c.get("db") as Db;
    const service: OrgService =
      deps.orgs ?? {
        listForUser: (userId) => listOrgsForUser(db, userId),
        create: async (userId, input) => {
          const slug = input.slug ?? slugify(input.name);
          const org = await auth.api.createOrganization({
            body: { name: input.name, slug, userId },
          });
          if (!org) throw new Error("Organization creation failed");
          return { id: org.id, name: org.name, slug: org.slug ?? slug };
        },
      };
    try {
      const org = await service.create(user.id, parsed.data);
      return c.json({ org }, 201);
    } catch {
      // Curated message: plugin/DB internals must not leak to clients.
      return c.json({ error: "Organization creation failed" }, 400);
    }
  });

  // Membership check probe (used by role-gating tests and the client).
  // Also reports the workspace access state so any member (not only admins) can
  // see why a gated screen is paused — billing itself stays admin-only.
  routes.get(
    "/api/orgs/:orgId/membership",
    guard,
    requireOrgRole("viewer", deps.store ? { store: deps.store } : undefined),
    async (c) => {
      const orgId = c.get("orgId") as string;
      let access: {
        state: string;
        status: string | null;
        trialEndsAt: number | null;
        proTier: boolean;
      } | null = null;
      try {
        const db = c.get("db") as Db | undefined;
        const billing = deps.billing ?? (db ? drizzleStore(db) : undefined);
        if (billing) {
          const sub = await billing.getAnySubscription(orgId);
          const state = await orgAccess(billing, orgId);
          access = {
            state: state.state,
            status: sub?.status ?? null,
            trialEndsAt: sub?.trialEndsAt ?? null,
            proTier: state.state === "trial" || (state.state === "active" && state.maxUsers == null),
          };
        }
      } catch {
        // Never let an access lookup break membership/role resolution.
        access = null;
      }
      return c.json({
        orgId: c.get("orgId"),
        role: c.get("orgRole"),
        superadmin: c.get("superadmin") ?? false,
        access,
      });
    },
  );

  // Public portal branding (hardcoded name + support address for the footer).
  // Mirrors contact.ts resolution, but never leaks admin emails: fallback "".
  routes.get("/api/portal", async (c) => {
    let supportEmail = "";
    try {
      const db = c.get("db") as Db | undefined;
      if (db) supportEmail = (await getSetting(db, "support_email")) ?? "";
    } catch {
      supportEmail = "";
    }
    return c.json({ portal_name: PORTAL_NAME, support_email: supportEmail });
  });

  routes.get("/api/me", guard, async (c) => {
    const user = c.get("user") as SessionUser;
    const store = deps.store ?? liveStore(c.get("db") as Db);
    // Self-heal the seed flag like requireSuperadmin does — otherwise a fresh
    // superadmin reads false here and the client misroutes them.
    await store.seedSuperadmins(superadminSeedEmails((c.env ?? {}) as Env));
    const billing = deps.billing ?? drizzleStore(c.get("db") as Db);
    const profile = await billing.getUser(user.id);
    return c.json({
      user: { id: user.id, email: user.email, name: user.name ?? null },
      superadmin: await store.isSuperadmin(user.id),
      defaultOrgId: profile?.defaultOrgId ?? null,
    });
  });

  // Persist the user's explicit default org (must be a member of it).
  routes.patch("/api/me/default-org", guard, async (c) => {
    const user = c.get("user") as SessionUser;
    const billing = deps.billing ?? drizzleStore(c.get("db") as Db);
    const body = (await c.req.json().catch(() => undefined)) as { orgId?: string | null } | undefined;
    const orgId = body?.orgId ?? null;
    if (orgId !== null) {
      const store = deps.store ?? liveStore(c.get("db") as Db);
      const member = await store.getMember(orgId, user.id);
      if (!member) return c.json({ error: "Not a member of this organization" }, 403);
    }
    await billing.setDefaultOrg(user.id, orgId);
    return c.json({ defaultOrgId: orgId });
  });

  return routes;
}