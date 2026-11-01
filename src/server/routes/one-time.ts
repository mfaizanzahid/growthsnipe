import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../types";
import { contextMiddleware, createContextMiddleware } from "../middleware";
import type { Db } from "../repositories/db";
import type { Auth } from "../auth";
import { safepayGateway, type Gateway } from "../billing/gateway";
import { BillingError } from "../billing/errors";
import {
  confirmOneTimeOrder,
  createOneTimeSession,
  listProducts,
  ONE_TIME_SLUGS,
} from "../billing/one-time";
import { getOneTimeProductBySlug } from "../repositories/billing";

const SessionBody = z.object({
  slug: z.enum(ONE_TIME_SLUGS),
  email: z.string().trim().email().max(200),
  name: z.string().trim().max(120).optional(),
  phone: z.string().trim().min(7).max(20),
  country: z.string().trim().length(2),
  businessName: z.string().trim().max(160).optional(),
  trade: z.string().trim().max(120).optional(),
  idempotencyKey: z.string().trim().min(8).max(128).optional(),
});

const ConfirmBody = z.object({
  orderId: z.string().trim().min(1).max(64),
  tracker: z.string().trim().min(1).max(128),
});

function toErrorResponse(err: unknown): { message: string; status: 400 | 402 | 404 | 409 | 422 } {
  if (err instanceof BillingError) {
    const status = err.status as 400 | 402 | 404 | 409 | 422;
    return { message: err.message, status: [400, 402, 404, 409, 422].includes(status) ? status : 400 };
  }
  return { message: "Request failed", status: 400 };
}

function gatewayFor(env: Env, deps: { gateway?: Gateway }): Gateway {
  return deps.gateway ?? safepayGateway(env);
}

/**
 * Public one-time checkout (Diagnostic / Blueprint). Guest-capable: no
 * session required, no org, no saved card. Amounts are always
 * server-computed from the product row.
 */
export function createOneTimeRoutes(deps: {
  gateway?: Gateway;
  ctx?: { db?: Db; auth?: Auth };
} = {}) {
  const routes = new Hono<{ Bindings: Env; Variables: { db: Db } }>();

  routes.use("*", deps.ctx ? createContextMiddleware(deps.ctx) : contextMiddleware);

  routes.get("/api/one-time/products", async (c) => {
    const products = await listProducts(c.get("db") as Db);
    return c.json({
      products: products.map((p) => ({
        slug: p.slug,
        name: p.name,
        amountMinor: p.amountMinor,
        currency: p.currency,
      })),
    });
  });

  routes.post("/api/one-time/session", async (c) => {
    const env = c.env as Env;
    const parsed = SessionBody.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json({ error: "Please provide your name, a valid email, phone, and country" }, 422);
    try {
      const result = await createOneTimeSession(c.get("db") as Db, env, gatewayFor(env, deps), {
        slug: parsed.data.slug,
        email: parsed.data.email,
        name: parsed.data.name ?? null,
        phone: parsed.data.phone,
        country: parsed.data.country.toUpperCase(),
        businessName: parsed.data.businessName ?? null,
        trade: parsed.data.trade ?? null,
        idempotencyKey: parsed.data.idempotencyKey ?? c.req.header("Idempotency-Key") ?? null,
      });
      return c.json(result);
    } catch (err) {
      const e = toErrorResponse(err);
      return c.json({ error: e.message }, e.status);
    }
  });

  routes.post("/api/one-time/confirm", async (c) => {
    const env = c.env as Env;
    const parsed = ConfirmBody.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json({ error: "orderId and tracker are required" }, 422);
    try {
      const result = await confirmOneTimeOrder(c.get("db") as Db, env, gatewayFor(env, deps), parsed.data);
      const product = await getOneTimeProductBySlug(c.get("db") as Db, result.productSlug);
      return c.json({
        orderId: result.orderId,
        product: product ? { slug: product.slug, name: product.name } : null,
        amountMinor: result.amountMinor,
        cached: result.cached,
      });
    } catch (err) {
      const e = toErrorResponse(err);
      return c.json({ error: e.message }, e.status);
    }
  });

  return routes;
}
