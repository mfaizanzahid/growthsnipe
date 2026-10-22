import type { Env } from "../types";
import { decryptSecret, encryptSecret } from "../lib/crypto";
import type { BillingStore } from "../repositories/billing";
import type { Gateway } from "./gateway";

/** Resolve the org's Safepay customer, creating one when missing. */
export async function ensureCustomer(
  env: Env,
  store: BillingStore,
  gateway: Gateway,
  orgId: string,
  contact: { firstName?: string; lastName?: string; email?: string; phoneNumber?: string; country?: string },
): Promise<{ token: string; created: boolean }> {
  const existing = await store.getSafepayCustomerByOrg(orgId);
  if (existing) {
    const token = await decryptSecret(existing.customerTokenEncrypted, env.TOKEN_ENCRYPTION_KEY);
    return { token, created: false };
  }
  const token = await gateway.createCustomer({
    firstName: contact.firstName,
    lastName: contact.lastName,
    email: contact.email,
    phoneNumber: contact.phoneNumber,
    country: contact.country ?? env.SAFEPAY_DEFAULT_COUNTRY,
  });
  await store.upsertSafepayCustomerByOrg(
    orgId,
    await encryptSecret(token, env.TOKEN_ENCRYPTION_KEY),
  );
  return { token, created: true };
}

export async function decryptCustomerToken(
  env: Env,
  store: BillingStore,
  orgId: string,
): Promise<string | null> {
  const existing = await store.getSafepayCustomerByOrg(orgId);
  if (!existing) return null;
  return decryptSecret(existing.customerTokenEncrypted, env.TOKEN_ENCRYPTION_KEY);
}
