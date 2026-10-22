export interface Env {
  DB: D1Database;
  TOKEN_ENCRYPTION_KEY: string;
  SAFEPAY_PUBLIC_KEY: string;
  SAFEPAY_SECRET_KEY: string;
  SAFEPAY_WEBHOOK_SECRET: string;
  SAFEPAY_ENV: "sandbox" | "live";
  SAFEPAY_API_BASE: string;
  SAFEPAY_DEFAULT_COUNTRY?: string;
  BETTER_AUTH_SECRET: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  RESEND_API_KEY: string;
  RESEND_FROM_EMAIL?: string;
  BREVO_API_KEY?: string;
  BREVO_SENDER_EMAIL?: string;
  BREVO_SENDER_NAME?: string;
  BREVO_NEW_SIGNUP_LIST_ID?: string;
  APP_BASE_URL: string;
  SUPERADMIN_EMAILS?: string;
  // Tradesmatic MCP (V1 market test, optional so billing-only envs keep working)
  MCP_BASE_URL?: string;
  MCP_TOKEN_PEPPER?: string;
  MCP_ENCRYPTION_KEY?: string;
  AI_PROVIDER?: string;
  AI_MODEL?: string;
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  BRIEFING_FROM_EMAIL?: string;
  DEFAULT_TIMEZONE?: string;
  /** Days to keep platform application logs (default 90). */
  LOG_RETENTION_DAYS?: string;
}

export type OrgRole = "admin" | "user" | "viewer";

export type SubscriptionInterval = "month" | "year";

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "scheduled"
  | "past_due"
  | "unpaid"
  | "canceled"
  | "expired";

export type InvoiceType = "setup" | "subscription" | "usage" | "one_time";

export type InvoiceStatus = "draft" | "due" | "paid" | "failed" | "void" | "refunded";

export type PaymentMethodStatus = "active" | "failed";

/** Dunning schedule (days since failure): notice + every-2-days + final. */
export const DUNNING_SCHEDULE_DAYS = [0, 2, 4, 6, 7] as const;

/** A saved card as returned by the Safepay customer wallet (R035). */
export interface WalletPaymentMethod {
  /** Safepay wallet payment-method token (`pm_<uuid>`), used as `tokenized_card.token`. */
  token: string;
  last4?: string;
  expiryMonth?: number;
  expiryYear?: number;
}
