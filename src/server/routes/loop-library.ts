import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../types";
import { contextMiddleware, createContextMiddleware } from "../middleware";
import type { Db } from "../repositories/db";
import type { Auth } from "../auth";
import { writeAppLog } from "../lib/app-logs";
import {
  getLoopLead,
  scheduleMarketingSends,
  unsubscribeLead,
  upsertLoopLead,
} from "../repositories/marketing";
import { deliverPendingStep } from "../marketing/runner";
import { stepsFor, WELCOME_SEQUENCE, WELCOME_SEQUENCE_KEY } from "../marketing/sequences";
import { verifyLeadToken } from "../marketing/tokens";

const TRADES = [
  "Home inspection",
  "HVAC",
  "Plumbing",
  "Electrical",
  "Roofing",
  "General contracting",
] as const;

const CaptureBody = z.object({
  firstName: z.string().trim().min(1).max(120),
  workEmail: z.string().trim().email().max(200),
  businessName: z.string().trim().min(1).max(160),
  trade: z.enum(TRADES),
  software: z.string().trim().max(120).optional().default(""),
  volume: z.string().trim().max(40).optional().default(""),
  // Honeypot: bots fill it, humans never see it.
  website: z.string().max(200).optional().default(""),
});

/** Public SNIPE Loops capture: validates, upserts the lead, schedules the
 * welcome sequence, and sends Day 0 inline (cron retries on failure). */
export function createLoopLibraryRoutes(deps: {
  ctx?: { db?: Db; auth?: Auth };
  settings?: { getSupportEmail(): Promise<string> };
} = {}) {
  const routes = new Hono<{ Bindings: Env; Variables: { db: Db } }>();

  routes.use("*", deps.ctx ? createContextMiddleware(deps.ctx) : contextMiddleware);

  routes.post("/api/loop-library", async (c) => {
    const env = c.env as Env;
    const parsed = CaptureBody.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json({ error: "Please complete the required fields with a valid work email" }, 422);
    if (parsed.data.website) {
      // Honeypot filled: pretend success, store nothing, send nothing.
      return c.json({ ok: true });
    }
    const db = c.get("db") as Db;
    const now = Date.now();
    const email = parsed.data.workEmail.trim().toLowerCase();
    try {
      const lead = await upsertLoopLead(db, {
        email,
        firstName: parsed.data.firstName.trim(),
        businessName: parsed.data.businessName.trim(),
        trade: parsed.data.trade,
        software: parsed.data.software?.trim() || null,
        monthlyVolume: parsed.data.volume?.trim() || null,
        now,
      });
      await scheduleMarketingSends(db, {
        leadId: lead.id,
        email,
        sequence: WELCOME_SEQUENCE_KEY,
        steps: stepsFor(WELCOME_SEQUENCE, now),
        now,
      });
      await deliverPendingStep(db, env, email, WELCOME_SEQUENCE_KEY, "day0").catch(() => false);
      try {
        await writeAppLog(db, {
          level: "info",
          event: "looplibrary.submitted",
          surface: "api",
          message: `SNIPE Loops request from ${lead.businessName}`,
          path: "/api/loop-library",
          method: "POST",
          statusCode: 200,
          userEmail: email,
          detail: { trade: lead.trade },
        });
      } catch {
        // Best-effort log only.
      }
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Could not save your request" }, 400);
    }
  });

  // Gated library access: token from the Day-0 email unlocks the recipes.
  routes.get("/api/loop-library/access", async (c) => {
    const env = c.env as Env;
    const secret = env.MARKETING_TOKEN_SECRET ?? env.BETTER_AUTH_SECRET ?? "";
    const leadId = await verifyLeadToken(secret, c.req.query("token") ?? "");
    if (!leadId) return c.json({ error: "This link is invalid. Request a fresh one from the SNIPE Loops page." }, 401);
    const lead = await getLoopLead(c.get("db") as Db, leadId);
    if (!lead) return c.json({ error: "This link is invalid. Request a fresh one from the SNIPE Loops page." }, 401);
    return c.json({ ok: true, firstName: lead.firstName });
  });

  // One-click unsubscribe confirm (GET renders state via the page; POST performs it).
  routes.post("/api/marketing/unsubscribe", async (c) => {
    const env = c.env as Env;
    const secret = env.MARKETING_TOKEN_SECRET ?? env.BETTER_AUTH_SECRET ?? "";
    const body = (await c.req.json().catch(() => undefined)) as { token?: string } | undefined;
    const leadId = await verifyLeadToken(secret, body?.token ?? "");
    if (!leadId) return c.json({ error: "This link is invalid." }, 400);
    const db = c.get("db") as Db;
    const lead = await unsubscribeLead(db, leadId);
    if (!lead) return c.json({ error: "This link is invalid." }, 400);
    try {
      await writeAppLog(db, {
        level: "info",
        event: "marketing.unsubscribed",
        surface: "api",
        message: `Unsubscribed ${lead.email}`,
        path: "/api/marketing/unsubscribe",
        method: "POST",
        statusCode: 200,
        userEmail: lead.email,
      });
    } catch {
      // Best-effort log only.
    }
    return c.json({ ok: true, email: lead.email });
  });

  return routes;
}
