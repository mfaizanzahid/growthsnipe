import type { Env } from "../types";
import { decryptSecret, encryptSecret } from "../lib/crypto";
import type { BillingStore, PaymentMethodRow } from "../repositories/billing";
import { decryptCustomerToken } from "./customers";
import type { Gateway } from "./gateway";

export class MethodError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 | 422 = 400,
  ) {
    super(message);
    this.name = "MethodError";
  }
}

/** Sync the Safepay wallet into payment_methods. Returns saved + total. */
export async function syncWalletMethods(
  env: Env,
  store: BillingStore,
  gateway: Gateway,
  orgId: string,
  userId?: string,
): Promise<{ saved: number; methods: PaymentMethodRow[] }> {
  const customerToken = await decryptCustomerToken(env, store, orgId);
  if (!customerToken) throw new MethodError("No Safepay customer for this organization", 422);
  const wallet = await gateway.listWallet(customerToken);
  const existing = await store.listPaymentMethods(orgId);
  const known = new Set<string>();
  for (const row of existing) {
    try {
      known.add(await decryptSecret(row.safepayPaymentMethodTokenEncrypted, env.TOKEN_ENCRYPTION_KEY));
    } catch {
      // unreadable token: treat as unknown so it gets re-synced
    }
  }
  let saved = 0;
  const hasDefault = existing.some((r) => r.isDefault === 1 && r.status === "active");
  const maxPriority = existing.reduce((m, r) => Math.max(m, r.priority), -1);
  for (const [i, w] of wallet.entries()) {
    if (known.has(w.token)) continue;
    const first = existing.length === 0 && saved === 0;
    await store.insertPaymentMethod({
      id: crypto.randomUUID(),
      orgId,
      userId: userId ?? null,
      safepayPaymentMethodTokenEncrypted: await encryptSecret(w.token, env.TOKEN_ENCRYPTION_KEY),
      brand: null,
      last4: w.last4 ?? null,
      expiryMonth: w.expiryMonth ?? null,
      expiryYear: w.expiryYear ?? null,
      isDefault: first || !hasDefault ? 1 : 0,
      priority: maxPriority + 1 + i,
      status: "active",
    });
    saved += 1;
  }
  return { saved, methods: await store.listPaymentMethods(orgId) };
}

/** Decrypt a stored method's gateway token (throws MethodError when missing). */
export async function resolveMethodToken(
  env: Env,
  method: PaymentMethodRow,
): Promise<string> {
  try {
    return await decryptSecret(method.safepayPaymentMethodTokenEncrypted, env.TOKEN_ENCRYPTION_KEY);
  } catch {
    throw new MethodError("Stored payment method is unreadable", 422);
  }
}

/** Promote a method to primary (default). Demotes the previous default. */
export async function setPrimary(store: BillingStore, orgId: string, methodId: string): Promise<void> {
  const method = await store.getPaymentMethod(methodId);
  if (!method || method.orgId !== orgId) throw new MethodError("Payment method not found", 404);
  if (method.status !== "active") throw new MethodError("Only a valid method can be primary", 422);
  const methods = await store.listPaymentMethods(orgId);
  for (const m of methods) {
    if (m.id === methodId) {
      await store.updatePaymentMethod(m.id, { isDefault: 1, priority: -1 });
    } else if (m.isDefault === 1) {
      await store.updatePaymentMethod(m.id, { isDefault: 0 });
    }
  }
  // Renumber backup priorities densely (0..n) so cascade order is explicit.
  const rest = (await store.listPaymentMethods(orgId)).filter((m) => m.id !== methodId);
  for (const [i, m] of rest.entries()) {
    await store.updatePaymentMethod(m.id, { priority: i });
  }
}

/**
 * Remove a method. The primary cannot be removed without promoting another
 * first. Removing a VALID method is allowed only while more than one valid
 * method exists (so an org always keeps a working card); already-failed
 * methods can be removed freely.
 */
export async function removeMethod(store: BillingStore, orgId: string, methodId: string): Promise<void> {
  const method = await store.getPaymentMethod(methodId);
  if (!method || method.orgId !== orgId) throw new MethodError("Payment method not found", 404);
  if (method.isDefault === 1) {
    throw new MethodError("Promote another method to primary before removing this one", 409);
  }
  if (method.status === "active") {
    const validTotal = await store.countValidMethods(orgId);
    if (validTotal <= 1) {
      throw new MethodError("Cannot remove the last valid payment method", 409);
    }
  }
  await store.deletePaymentMethod(methodId);
}

/** Ordered cascade for collection: primary first, then backups by priority. */
export async function collectionOrder(store: BillingStore, orgId: string): Promise<PaymentMethodRow[]> {
  const methods = await store.listPaymentMethods(orgId);
  return methods.filter((m) => m.status === "active");
}

/**
 * Ordered cascade for overdue-invoice auto-retries: same order as
 * collectionOrder but includes cards marked failed. A decline is often
 * transient (or the account was just funded), so every saved card gets its
 * own retry budget (see methodRetryBlocked in renewals.ts).
 */
export async function retryOrder(store: BillingStore, orgId: string): Promise<PaymentMethodRow[]> {
  return store.listPaymentMethods(orgId);
}
