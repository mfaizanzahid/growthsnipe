import { Hono } from "hono";
import type { Env } from "../types";
import type { Db } from "../repositories/db";
import type { Auth } from "../auth";
import { drizzleStore, type BillingStore } from "../repositories/billing";
import { handleSafepayWebhook } from "../billing/webhooks";
import { createDb } from "../repositories/db";
import { clientIp, requestId, writeAppLog } from "../lib/app-logs";

/**
 * Safepay webhook receiver. Authentication is the HMAC-SHA512 signature
 * itself — no session required. Always 200s after verification so Safepay
 * stops retrying handled events; 401 only for bad signatures.
 */
export function createWebhookRoutes(deps: {
  billing?: BillingStore;
  ctx?: { db?: Db; auth?: Auth };
} = {}) {
  const routes = new Hono<{ Bindings: Env }>();

  routes.post("/webhooks/safepay", async (c) => {
    const rawBody = await c.req.text();
    const signature = c.req.header("X-SFPY-SIGNATURE") ?? null;
    const db = deps.ctx?.db;
    if (!db && !deps.billing) {
      return c.json({ error: "Not configured" }, 500);
    }
    const store = deps.billing ?? drizzleStore(db as Db);
    const outcome = await handleSafepayWebhook(c.env, store, rawBody, signature);
    if (outcome.httpStatus === 401) {
      if (c.env.DB) {
        await writeAppLog(createDb(c.env.DB), {
          level: "warn",
          event: "billing.webhook_rejected",
          surface: "webhook",
          message: "Safepay webhook rejected: invalid signature",
          path: c.req.path,
          method: c.req.method,
          statusCode: 401,
          ip: clientIp(c.req.raw.headers),
          userAgent: c.req.header("user-agent") ?? null,
          requestId: requestId(c.req.raw.headers),
        });
      }
      return c.json({ error: "Invalid signature" }, 401);
    }
    return c.json({ received: true, ack: outcome.ack });
  });

  return routes;
}
