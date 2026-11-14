import type { Db } from "../repositories/db";
import type { Env } from "../types";
import { getSetting } from "../repositories/index";
import {
  createOneTimeInvoice,
  getOneTimeInvoiceByOrderId,
  updateOneTimeInvoice,
  type OneTimeInvoiceLine,
  type OneTimeInvoiceRow,
  type OneTimeOrderRow,
  type OneTimeProductRow,
} from "../repositories/billing";
import { sendEmail } from "../lib/email";
import { layout, oneTimeInvoiceContent, type EmailCreditCoupon } from "../email/templates";
import { PORTAL_NAME } from "../lib/brand";
import { renderInvoicePdf } from "../lib/invoice-pdf";
import { signOneTimeInvoiceToken } from "./one-time-invoice-token";

function baseUrl(env: Pick<Env, "APP_BASE_URL">): string {
  return (env.APP_BASE_URL ?? "").replace(/\/+$/, "");
}

export async function oneTimeInvoiceUrl(
  env: Pick<Env, "APP_BASE_URL" | "BETTER_AUTH_SECRET">,
  orderId: string,
  invoiceId: string,
  now = Date.now(),
): Promise<string> {
  const token = await signOneTimeInvoiceToken(env, { orderId, invoiceId, now });
  return `${baseUrl(env)}/api/one-time/invoices/${encodeURIComponent(orderId)}/pdf?token=${encodeURIComponent(token)}`;
}

/** Build the guest invoice row for a paid order, once. */
export async function ensureOneTimeInvoice(
  db: Db,
  order: OneTimeOrderRow,
  product: OneTimeProductRow,
  now = Date.now(),
): Promise<OneTimeInvoiceRow> {
  const existing = await getOneTimeInvoiceByOrderId(db, order.id);
  if (existing) return existing;

  const discount = Math.max(0, order.discountMinor ?? 0);
  const grossMinor = order.amountMinor + discount;
  const lines: OneTimeInvoiceLine[] = [
    { description: product.name, amountMinor: grossMinor },
  ];
  if (discount > 0) {
    lines.push({
      description: order.couponCode ? `Discount (${order.couponCode})` : "Discount",
      amountMinor: -discount,
    });
  }

  return createOneTimeInvoice(db, {
    id: crypto.randomUUID(),
    orderId: order.id,
    amountMinor: order.amountMinor,
    currency: order.currency,
    description: `${product.name} purchase`,
    customerEmail: order.email,
    customerName: order.name,
    businessName: order.businessName,
    items: lines,
    tracker: order.tracker,
    chargeId: order.chargeId,
    paidAt: order.paidAt ?? now,
    now,
  });
}

export function parseOneTimeInvoiceLines(invoice: OneTimeInvoiceRow): OneTimeInvoiceLine[] {
  try {
    const parsed = JSON.parse(invoice.itemsJson) as OneTimeInvoiceLine[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function renderOneTimeInvoicePdf(
  db: Db,
  invoice: OneTimeInvoiceRow,
  order: OneTimeOrderRow,
): Promise<Uint8Array> {
  const support = (await getSetting(db, "support_email").catch(() => null)) ?? "";
  return renderInvoicePdf({
    portalName: PORTAL_NAME,
    supportEmail: support,
    number: invoice.number,
    status: invoice.status,
    orgName: order.businessName ?? order.name ?? order.email,
    description: invoice.description,
    currency: invoice.currency,
    lines: parseOneTimeInvoiceLines(invoice),
    totalMinor: invoice.amountMinor,
    createdAt: invoice.createdAt,
    paidAt: invoice.paidAt,
  });
}

/**
 * Send the invoice email with a signed PDF link. The first send is automatic;
 * superadmin resend passes `force`.
 */
export async function sendOneTimeInvoiceEmail(
  db: Db,
  env: Env,
  order: OneTimeOrderRow,
  invoice: OneTimeInvoiceRow,
  product: OneTimeProductRow,
  credit: EmailCreditCoupon | null,
  force = false,
  now = Date.now(),
): Promise<void> {
  if (invoice.emailSentAt && !force) return;
  const invoiceUrl = await oneTimeInvoiceUrl(env, order.id, invoice.id, now);
  const support = (await getSetting(db, "support_email").catch(() => null)) ?? "";
  const content = oneTimeInvoiceContent({
    productName: product.name,
    invoiceNumber: invoice.number,
    amountMinor: invoice.amountMinor,
    currency: invoice.currency,
    discountMinor: order.discountMinor,
    couponCode: order.couponCode,
    invoiceUrl,
    credit,
  });
  await sendEmail(
    env,
    {
      to: order.email,
      subject: `[${PORTAL_NAME}] ${content.subject}`,
      html: layout(
        PORTAL_NAME,
        support,
        invoiceUrl,
        content.subject,
        content.html,
        "Download your invoice",
      ),
    },
    env.RESEND_FROM_EMAIL,
  );
  await updateOneTimeInvoice(db, invoice.id, {
    emailSentAt: now,
    emailResendCount: force ? (invoice.emailResendCount ?? 0) + 1 : invoice.emailResendCount,
    updatedAt: now,
  });
}
