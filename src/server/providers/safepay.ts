import { hmacSha512, toHex } from "../lib/crypto";
import type { WalletPaymentMethod } from "../types";

function normalizeCurrency(currency: string): string {
  return currency.toUpperCase();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    const byte = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) return null;
    out[i] = byte;
  }
  return out;
}

/**
 * Generic Safepay HTTP adapter (Worker-safe `fetch`).
 *
 * Verified contracts — see `docs/safepay-api-contract.md`:
 * - auth header `X-SFPY-MERCHANT-SECRET`
 * - customer create requires `country` + `phone_number` → `data.token` (`cus_…`)
 * - session `POST /order/payments/v3/` → `data.tracker.token` (`track_…`)
 * - tracker read `GET /reporter/api/v1/payments/{tracker}`
 * - saved-method charge `POST /order/payments/v3/{tracker}` with
 *   `{ payload: { payment_method: { tokenized_card: { token: "pm_…" } } } }`
 * - wallet list `GET /user/customers/v1/{cus}/wallet/` → `pm_…` + `cybersource` metadata
 * - refund `POST /order/payments/v3/{tracker}/refund`
 * - webhook `X-SFPY-SIGNATURE` = HMAC-SHA512 hex of raw body (dashboard shared secret)
 *
 * Amounts are integer minor units. No silent currency conversion.
 * No HighLevel/provider coupling. No native-subscription calls (manual billing only).
 */
export class SafepayProvider {
  constructor(
    private readonly env: {
      SAFEPAY_SECRET_KEY: string;
      SAFEPAY_PUBLIC_KEY: string;
      SAFEPAY_API_BASE: string;
    },
  ) {}

  private authHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-SFPY-MERCHANT-SECRET": this.env.SAFEPAY_SECRET_KEY,
    };
  }

  private async post<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.env.SAFEPAY_API_BASE}${path}`, {
      method: "POST",
      headers: this.authHeaders(),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await res.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : undefined;
    } catch {
      data = text;
    }
    if (!res.ok) {
      const msg = data as { message?: string; status?: { errors?: unknown[] } };
      throw new Error(
        `Safepay error ${res.status}: ${msg?.message ?? msg?.status?.errors?.[0] ?? res.statusText}`,
      );
    }
    return data as T;
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.env.SAFEPAY_API_BASE}${path}`, {
      method: "GET",
      headers: this.authHeaders(),
    });
    const text = await res.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : undefined;
    } catch {
      data = text;
    }
    if (!res.ok) {
      const msg = data as { message?: string; status?: { errors?: unknown[] } };
      throw new Error(
        `Safepay error ${res.status}: ${msg?.message ?? msg?.status?.errors?.[0] ?? res.statusText}`,
      );
    }
    return data as T;
  }

  /** Create a Safepay customer. Returns `cus_…` token. */
  async createCustomer(input: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phoneNumber?: string;
    country?: string;
  }): Promise<string> {
    const body: Record<string, unknown> = {};
    if (input.firstName) body.first_name = input.firstName;
    if (input.lastName) body.last_name = input.lastName;
    if (input.email) body.email = input.email;
    if (input.phoneNumber) body.phone_number = input.phoneNumber;
    if (input.country) body.country = input.country;
    body.is_guest = false;

    const data = (await this.post("/user/customers/v1/", body)) as {
      data?: { token?: string };
    };
    const token = data?.data?.token;
    if (!token) throw new Error("Safepay did not return a customer token");
    return token;
  }

  /**
   * Initialise a payment session. Returns the tracker token (`track_…`).
   * - `payment` + `raw` → Atoms card capture
   * - `unscheduled_cof` → merchant-initiated charge of a saved `pm_`
   * - `instrument` + `is_account_verification` → zero-amount card save
   */
  async createPaymentSession(input: {
    user: string;
    merchantApiKey: string;
    mode: "payment" | "unscheduled_cof" | "instrument";
    currency: string;
    amountMinor: number;
    entryMode?: "raw" | "tms";
    isAccountVerification?: boolean;
    metadata?: Record<string, unknown>;
  }): Promise<string> {
    const body: Record<string, unknown> = {
      user: input.user,
      merchant_api_key: input.merchantApiKey,
      intent: "CYBERSOURCE",
      mode: input.mode,
      currency: normalizeCurrency(input.currency),
      amount: input.amountMinor,
    };
    if (input.entryMode) body.entry_mode = input.entryMode;
    if (input.isAccountVerification) body.is_account_verification = true;
    if (input.metadata && Object.keys(input.metadata).length > 0) {
      body.metadata = input.metadata;
    }

    const data = (await this.post("/order/payments/v3/", body)) as {
      data?: { tracker?: { token?: string } };
      tracker?: { token?: string };
    };
    const token = data?.data?.tracker?.token ?? data?.tracker?.token;
    if (!token) throw new Error("Safepay did not return a payment tracker token");
    return token;
  }

  /** Mint a client/browser auth token (time-based, for Atoms). No request body. */
  async createClientAuthToken(): Promise<string> {
    const data = (await this.post("/client/passport/v1/token")) as {
      data?: string;
      token?: string;
    };
    const token = data?.data ?? data?.token;
    if (!token) throw new Error("Safepay did not return a client auth token");
    return token;
  }

  /** Charge a saved `pm_` token on an initialised tracker. */
  async chargeSavedMethod(tracker: string, paymentMethodToken: string): Promise<unknown> {
    return this.post(`/order/payments/v3/${tracker}`, {
      payload: {
        payment_method: {
          tokenized_card: { token: paymentMethodToken },
        },
      },
    });
  }

  /**
   * Merchant-initiated charge of a saved card (`unscheduled_cof`).
   * Returns the tracker plus the charge id when present.
   */
  async chargeSavedCard(input: {
    customerToken: string;
    merchantApiKey: string;
    paymentMethodToken: string;
    currency: string;
    amountMinor: number;
  }): Promise<{ tracker: string; chargeId: string }> {
    const tracker = await this.createPaymentSession({
      user: input.customerToken,
      merchantApiKey: input.merchantApiKey,
      mode: "unscheduled_cof",
      currency: input.currency,
      amountMinor: input.amountMinor,
    });
    const result = (await this.chargeSavedMethod(tracker, input.paymentMethodToken)) as {
      charge?: { token?: string };
    };
    return { tracker, chargeId: result?.charge?.token ?? tracker };
  }

  /**
   * List a customer's saved payment methods from their Safepay wallet.
   * Returns `pm_…` tokens with card metadata (`cybersource`).
   */
  async listWallet(tokenRef: string): Promise<WalletPaymentMethod[]> {
    const data = (await this.get(`/user/customers/v1/${tokenRef}/wallet/`)) as {
      data?: {
        wallet?: Array<{
          token?: string;
          is_deleted?: boolean;
          cybersource?: {
            last_four?: string;
            expiry_month?: string | number;
            expiry_year?: string | number;
          };
        }>;
      };
    };
    const wallet = data?.data?.wallet ?? [];
    return wallet
      .filter((w) => w.token && !w.is_deleted)
      .map((w) => ({
        token: w.token as string,
        last4: w.cybersource?.last_four,
        expiryMonth: w.cybersource?.expiry_month
          ? Number(w.cybersource.expiry_month)
          : undefined,
        expiryYear: w.cybersource?.expiry_year
          ? Number(w.cybersource.expiry_year)
          : undefined,
      }));
  }

  /** Resolve a tracker's terminal state with bounded polling. */
  async checkTrackerStatus(tracker: string): Promise<"succeeded" | "failed" | "pending"> {
    const terminal = new Set(["TRACKER_ENDED", "TRACKER_CHARGED"]);
    const failed = new Set(["TRACKER_FAILED", "TRACKER_CANCELED"]);
    for (let i = 0; i < 3; i += 1) {
      if (i > 0) await sleep(500);
      const info = (await this.getTracker(tracker)) as {
        data?: { state?: string };
        state?: string;
      };
      const state = info?.data?.state ?? info?.state;
      if (typeof state === "string" && terminal.has(state)) return "succeeded";
      if (typeof state === "string" && failed.has(state)) return "failed";
    }
    return "pending";
  }

  private async getTracker(tracker: string): Promise<unknown> {
    const res = await fetch(
      `${this.env.SAFEPAY_API_BASE}/reporter/api/v1/payments/${tracker}`,
      { method: "GET", headers: this.authHeaders() },
    );
    const text = await res.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : undefined;
    } catch {
      data = text;
    }
    if (!res.ok) throw new Error(`Safepay tracker lookup failed: ${res.status}`);
    return data;
  }

  async refund(input: {
    gatewayTracker: string;
    amountMinor: number;
    currency: string;
  }): Promise<{ gatewayReference: string; refundId?: string }> {
    const result = (await this.post(`/order/payments/v3/${input.gatewayTracker}/refund`, {
      currency: normalizeCurrency(input.currency),
      amount: input.amountMinor,
    })) as { refund?: { token?: string } };
    return {
      gatewayReference: input.gatewayTracker,
      refundId: result?.refund?.token,
    };
  }
}

/** Verify a Safepay webhook signature (HMAC-SHA512 over raw body, hex). Worker-safe. */
export async function verifySafepaySignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  sharedSecret: string,
): Promise<boolean> {
  if (!signatureHeader) return false;
  const digest = await hmacSha512(sharedSecret, new TextEncoder().encode(rawBody));
  const expected = toHex(digest).toLowerCase();
  const actual = signatureHeader.trim().toLowerCase();
  const a = hexToBytes(expected);
  const b = hexToBytes(actual);
  if (!a || !b || a.byteLength !== b.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < a.byteLength; i += 1) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}
