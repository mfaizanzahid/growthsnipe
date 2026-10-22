import { Hono } from "hono";
import { asc, eq } from "drizzle-orm";
import type { Env } from "../types";
import { contextMiddleware, createContextMiddleware } from "../middleware";
import type { Db } from "../repositories/db";
import type { Auth } from "../auth";
import { plans } from "../../../db/schema";

export interface PlanRow {
  id: string;
  name: string;
  monthlyMinor: number;
  annualMinor: number;
  setupFeeMinor: number;
  trialPeriodDays: number;
  description: string | null;
  currency: string;
  maxUsers: number | null;
  allowBriefings: number;
  /** Comma-separated feature bullets; null when unset. */
  features: string | null;
}

/** Public plan list for signup (active plans only, display order). */
export function createPlansRoutes(
  deps: { list?: () => Promise<PlanRow[]>; ctx?: { db?: Db; auth?: Auth } } = {},
) {
  const routes = new Hono<{ Bindings: Env; Variables: { db: Db } }>();

  routes.use("*", deps.ctx ? createContextMiddleware(deps.ctx) : contextMiddleware);

  routes.get("/api/plans", async (c) => {
    if (deps.list) return c.json({ plans: await deps.list() });
    const db = c.get("db") as Db;
    const rows = await db
      .select({
        id: plans.id,
        name: plans.name,
        monthlyMinor: plans.monthlyMinor,
        annualMinor: plans.annualMinor,
        setupFeeMinor: plans.setupFeeMinor,
        trialPeriodDays: plans.trialPeriodDays,
        description: plans.description,
        currency: plans.currency,
        maxUsers: plans.maxUsers,
        allowBriefings: plans.allowBriefings,
        features: plans.features,
      })
      .from(plans)
      .where(eq(plans.active, 1))
      .orderBy(asc(plans.sortOrder));
    return c.json({ plans: rows });
  });

  return routes;
}
