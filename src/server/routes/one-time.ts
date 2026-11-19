import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../types";
import { contextMiddleware, createContextMiddleware } from "../middleware";
import type { Db } from "../repositories/db";
import type { Auth } from "../auth";
import { safepayGateway, type Gateway } from "../billing/gateway";
import { BillingError } from "../billing/errors";
import { CouponError, validateOneTimeCoupon } from "../billing/coupons";
import {
  autoCouponCodeFor,
  confirmOneTimeOrder,
  createOneTimeSession,
  listProducts,
  ONE_TIME_SLUGS,
} from "../billing/one-time";
import { renderOneTimeInvoicePdf } from "../billing/one-time-invoices";
import { verifyOneTimeInvoiceToken } from "../billing/one-time-invoice-token";
import { renderLoopsPdf } from "../loops/pdf";
import { verifyLoopsDocumentToken } from "../loops/tokens";
import {
  drizzleStore,
  getOneTimeInvoiceById,
  getOneTimeOrder,
  getOneTimeProduct,
  getOneTimeProductBySlug,
} from "../repositories/billing";
import { formatCreditExpiry } from "../../lib/credit-coupon";

const SessionBody = z
  .object({
    slug: z.enum(ONE_TIME_SLUGS),
    email: z.string().trim().email().max(200),
    firstName: z.string().trim().min(1).max(60),
    lastName: z.string().trim().min(1).max(60),
    phone: z.string().trim().min(7).max(20),
    country: z.string().trim().length(2),
    businessName: z.string().trim().min(1).max(160),
    trade: z.string().trim().min(1).max(120),
    website: z.string().trim().max(300).optional(),
    couponCode: z.string().trim().max(64).optional(),
    idempotencyKey: z.string().trim().min(8).max(128).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.slug === "blueprint" && !data.website?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["website"],
        message: "Enter your website",
      });
    }
  });

const CouponPreviewBody = z.object({
  slug: z.enum(ONE_TIME_SLUGS),
  email: z.string().trim().email().max(200),
  code: z.string().trim().min(1).max(64),
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

  // Standing coupon for a product, so the checkout can show the discount
  // before the buyer enters an email. Only unbound, product-scoped coupons.
  routes.get("/api/one-time/auto-coupon", async (c) => {
    const slug = (c.req.query("slug") ?? "").trim();
    const code = autoCouponCodeFor(slug);
    if (!code) return c.json({ error: "No automatic discount for this product." }, 404);
    const db = c.get("db") as Db;
    const product = await getOneTimeProductBySlug(db, slug);
    if (!product || product.active !== 1) {
      return c.json({ error: "Product is not available" }, 404);
    }
    try {
      const valid = await validateOneTimeCoupon(
        drizzleStore(db),
        code,
        product.slug,
        product.amountMinor,
        "",
      );
      return c.json({
        code: valid.coupon.code,
        discountMinor: valid.discountMinor,
        amountMinor: valid.amountMinor,
        currency: product.currency,
      });
    } catch (err) {
      if (err instanceof CouponError) return c.json({ error: err.message }, err.status);
      return c.json({ error: "Could not load the automatic discount" }, 400);
    }
  });

  routes.get("/api/one-time/invoices/:orderId/pdf", async (c) => {
    const env = c.env as Env;
    const token = c.req.query("token") ?? "";
    const verified = await verifyOneTimeInvoiceToken(env, token);
    if (!verified || verified.orderId !== c.req.param("orderId")) {
      return c.json({ error: "This invoice link is invalid or has expired." }, 401);
    }
    const db = c.get("db") as Db;
    const invoice = await getOneTimeInvoiceById(db, verified.invoiceId);
    if (!invoice || invoice.oneTimeOrderId !== verified.orderId) {
      return c.json({ error: "Invoice not found." }, 404);
    }
    const order = await getOneTimeOrder(db, invoice.oneTimeOrderId);
    if (!order) return c.json({ error: "Invoice not found." }, 404);
    const pdf = await renderOneTimeInvoicePdf(db, invoice, order);
    const headers = new Headers({
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${invoice.number}.pdf"`,
      "cache-control": "private, no-store",
    });
    const body = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
    return new Response(body, { status: 200, headers });
  });

  // Render the SNIPE Loops playbook on demand from a signed link. Diagnostic,
  // Blueprint and Loops orders all receive it as a bonus.
  routes.get("/api/one-time/loops/:orderId/document", async (c) => {
    const env = c.env as Env;
    const token = c.req.query("token") ?? "";
    const verified = await verifyLoopsDocumentToken(env, token);
    if (!verified || verified.orderId !== c.req.param("orderId")) {
      return c.json({ error: "This download link is invalid or has expired." }, 401);
    }
    const db = c.get("db") as Db;
    const order = await getOneTimeOrder(db, verified.orderId);
    if (!order) return c.json({ error: "Order not found." }, 404);
    if (order.status !== "paid") {
      return c.json({ error: "This playbook is not available yet." }, 409);
    }
    const product = await getOneTimeProduct(db, order.productId);
    if (!product || !["loops", "diagnostic", "blueprint"].includes(product.slug)) {
      return c.json({ error: "Playbook not found." }, 404);
    }
    const pdf = await renderLoopsPdf({
      businessName: order.businessName,
      trade: order.trade,
      preparedAt: order.paidAt ?? order.createdAt,
      baseUrl: env.APP_BASE_URL,
    });
    const business = (order.businessName ?? "playbook")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);
    const headers = new Headers({
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="SNIPE-Loops-${business || "playbook"}.pdf"`,
      "cache-control": "private, no-store",
    });
    const body = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
    return new Response(body, { status: 200, headers });
  });

  routes.post("/api/one-time/coupon", async (c) => {
    const parsed = CouponPreviewBody.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json({ error: "Provide a valid email and code" }, 422);
    const db = c.get("db") as Db;
    const product = await getOneTimeProductBySlug(db, parsed.data.slug);
    if (!product || product.active !== 1) {
      return c.json({ error: "Product is not available" }, 422);
    }
    try {
      const valid = await validateOneTimeCoupon(
        drizzleStore(db),
        parsed.data.code,
        product.slug,
        product.amountMinor,
        parsed.data.email,
      );
      return c.json({
        code: valid.coupon.code,
        discountMinor: valid.discountMinor,
        amountMinor: valid.amountMinor,
        currency: product.currency,
        expiresOn: formatCreditExpiry(valid.coupon.validUntil),
      });
    } catch (err) {
      if (err instanceof CouponError) return c.json({ error: err.message }, err.status);
      return c.json({ error: "Could not apply this code" }, 400);
    }
  });

  routes.post("/api/one-time/session", async (c) => {
    const env = c.env as Env;
    const parsed = SessionBody.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) {
      const websiteMissing = parsed.error.issues.some((issue) => issue.path[0] === "website");
      return c.json(
        {
          error: websiteMissing
            ? "Please provide your website"
            : "Please provide your name, business name, a valid email, phone, and country",
        },
        422,
      );
    }
    try {
      const result = await createOneTimeSession(c.get("db") as Db, env, gatewayFor(env, deps), {
        slug: parsed.data.slug,
        email: parsed.data.email,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        phone: parsed.data.phone,
        country: parsed.data.country.toUpperCase(),
        businessName: parsed.data.businessName,
        trade: parsed.data.trade,
        website: parsed.data.website ?? null,
        couponCode: parsed.data.couponCode ?? null,
        idempotencyKey: parsed.data.idempotencyKey ?? c.req.header("Idempotency-Key") ?? null,
      });
      return c.json(result);
    } catch (err) {
      console.error("[one-time] session failed:", err instanceof Error ? err.message : err);
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
