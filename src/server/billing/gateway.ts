import type { Env, WalletPaymentMethod } from "../types";
import { SafepayProvider } from "../providers/safepay";

/**
 * Narrow gateway surface used by the billing engine. The production
 * implementation wraps SafepayProvider; tests inject fakes.
 */
export interface Gateway {
  createCustomer(input: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phoneNumber?: string;
    country?: string;
  }): Promise<string>;
  createPaymentSession(input: {
    user: string;
    merchantApiKey: string;
    mode: "payment" | "unscheduled_cof" | "instrument";
    currency: string;
    amountMinor: number;
    entryMode?: "raw" | "tms";
    isAccountVerification?: boolean;
  }): Promise<string>;
  createClientAuthToken(): Promise<string>;
  chargeSavedCard(input: {
    customerToken: string;
    merchantApiKey: string;
    paymentMethodToken: string;
    currency: string;
    amountMinor: number;
  }): Promise<{ tracker: string; chargeId: string }>;
  listWallet(customerToken: string): Promise<WalletPaymentMethod[]>;
  checkTrackerStatus(tracker: string): Promise<"succeeded" | "failed" | "pending">;
  refund(input: {
    gatewayTracker: string;
    amountMinor: number;
    currency: string;
  }): Promise<{ gatewayReference: string; refundId?: string }>;
}

export function safepayGateway(env: Env): Gateway {
  const provider = new SafepayProvider({
    SAFEPAY_SECRET_KEY: env.SAFEPAY_SECRET_KEY,
    SAFEPAY_PUBLIC_KEY: env.SAFEPAY_PUBLIC_KEY,
    SAFEPAY_API_BASE: env.SAFEPAY_API_BASE,
  });
  return {
    createCustomer: (input) => provider.createCustomer(input),
    createPaymentSession: (input) => provider.createPaymentSession(input),
    createClientAuthToken: () => provider.createClientAuthToken(),
    chargeSavedCard: (input) => provider.chargeSavedCard(input),
    listWallet: (token) => provider.listWallet(token),
    checkTrackerStatus: (tracker) => provider.checkTrackerStatus(tracker),
    refund: (input) => provider.refund(input),
  };
}
