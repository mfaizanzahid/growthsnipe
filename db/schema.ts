import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/* Better Auth core (D1-backed). Extended with isSuperadmin for the global role.
 *
 * Date columns use drizzle timestamp/boolean modes because Better Auth sends
 * JS Date objects and booleans (D1 rejects them as raw values). Storage stays
 * INTEGER (ms epoch / 0-1); no DDL change required. */

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  isSuperadmin: integer("is_superadmin").notNull().default(0),
  /** Explicit default org for active-org auto-select (null = first created org). */
  defaultOrgId: text("default_org_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  /** Better Auth organization plugin: active organization pointer. */
  activeOrganizationId: text("active_organization_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  providerId: text("provider_id").notNull(),
  accountId: text("account_id").notNull(),
  /** Better Auth 1.7 account identity namespace (required field). */
  issuer: text("issuer"),
  /** OAuth token metadata (written on social sign-in only). */
  scope: text("scope"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  expiresAt: integer("expires_at", { mode: "timestamp" }),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const verifications = sqliteTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

/* Multi-tenant orgs */

export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").unique(),
  /** Better Auth organization plugin fields. */
  logo: text("logo"),
  metadata: text("metadata"),
  createdBy: text("created_by"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

export const members = sqliteTable(
  "members",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    userId: text("user_id").notNull(),
    /** Free-form role: admin | user | viewer. Enforced server-side. */
    role: text("role").notNull().default("user"),
    /** Access status: active | suspended. Suspended members are denied by guards. */
    memberStatus: text("member_status").notNull().default("active"),
    /** Who suspended the member: plan_limits (auto, restorable on upgrade) | admin (manual, never auto-restored) | null. */
    suspendedBy: text("suspended_by"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }),
  },
  (table) => ({
    orgUserIdx: uniqueIndex("members_org_user_idx").on(table.orgId, table.userId),
  }),
);

export const invitations = sqliteTable("invitations", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull().default("user"),
  status: text("status").notNull().default("pending"),
  /** Better Auth organization plugin fields. */
  expiresAt: integer("expires_at", { mode: "timestamp" }),
  inviterId: text("inviter_id"),
  invitedBy: text("invited_by"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

/* Catalog plans (superadmin-managed, max 4 active). Amounts in integer minor units, USD. */

export const plans = sqliteTable("plans", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  monthlyMinor: integer("monthly_minor").notNull(),
  annualMinor: integer("annual_minor").notNull(),
  setupFeeMinor: integer("setup_fee_minor").notNull(),
  trialPeriodDays: integer("trial_period_days").notNull().default(0),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  currency: text("currency").notNull().default("USD"),
  active: integer("active").notNull().default(1),
  /** Plan limits: max users (NULL = unlimited), scheduled briefings allowed. */
    maxUsers: integer("max_users"),
    allowBriefings: integer("allow_briefings").notNull().default(1),
    /** Contact-only plans are displayed but cannot be purchased (no self-serve checkout). */
    contactOnly: integer("contact_only").notNull().default(0),
    /** Comma-separated feature bullets (single source of truth for pricing + billing). */
    features: text("features"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/* Portal settings (superadmin-managed): portal_name, support_email. */

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/* Discount coupons (superadmin-managed, Stripe-style). */

export const coupons = sqliteTable("coupons", {
  id: text("id").primaryKey(),
  /** Uppercase unique code the client types at signup, e.g. LAUNCH20. */
  code: text("code").notNull().unique(),
  /** percent | fixed. */
  kind: text("kind").notNull(),
  /** Percent off 1-100 (kind=percent). */
  percentOff: integer("percent_off"),
  /** Fixed amount off in minor units (kind=fixed). */
  amountOffMinor: integer("amount_off_minor"),
  currency: text("currency").notNull().default("USD"),
  /** once | repeating | forever. */
  duration: text("duration").notNull().default("once"),
  /** Billing cycles the discount repeats (duration=repeating). */
  durationCycles: integer("duration_cycles"),
  /** Whether the discount also reduces the one-time setup fee. Default 0. */
  appliesToSetup: integer("applies_to_setup").notNull().default(0),
  maxRedemptions: integer("max_redemptions"),
  redeemedCount: integer("redeemed_count").notNull().default(0),
  validFrom: integer("valid_from"),
  validUntil: integer("valid_until"),
  active: integer("active").notNull().default(1),
  createdBy: text("created_by"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/**
 * Coupon → plan applicability. No rows = coupon applies to ALL active plans.
 * Otherwise the coupon is valid only for the listed plan ids.
 */
export const couponPlans = sqliteTable(
  "coupon_plans",
  {
    couponId: text("coupon_id").notNull(),
    planId: text("plan_id").notNull(),
  },
  (table) => ({
    couponPlanIdx: uniqueIndex("coupon_plans_idx").on(table.couponId, table.planId),
  }),
);

/** Coupons attached to a subscription, with remaining-cycle tracking. */
export const subscriptionCoupons = sqliteTable("subscription_coupons", {
  id: text("id").primaryKey(),
  subscriptionId: text("subscription_id").notNull(),
  couponId: text("coupon_id").notNull(),
  status: text("status").notNull().default("active"),
  cyclesApplied: integer("cycles_applied").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/* Manual subscription schedule owned by the Worker Cron. No sub_/plan_ refs. */

export const orgSubscriptions = sqliteTable("org_subscriptions", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  planId: text("plan_id").notNull(),
  interval: text("interval").notNull().default("month"),
  intervalCount: integer("interval_count").notNull().default(1),
  status: text("status").notNull().default("active"),
  startDate: integer("start_date").notNull(),
  nextCharge: integer("next_charge").notNull(),
  totalCycles: integer("total_cycles"),
  cyclesCharged: integer("cycles_charged").notNull().default(0),
  recurringAmountMinor: integer("recurring_amount_minor").notNull(),
  currency: text("currency").notNull().default("USD"),
  defaultPaymentMethodId: text("default_payment_method_id"),
  pastDueSince: integer("past_due_since"),
  /** Pro-trial window end (UTC seconds) + reminder offsets already sent, JSON array. */
  trialEndsAt: integer("trial_ends_at"),
  trialReminders: text("trial_reminders").notNull().default("[]"),
  /**
   * 1 = this trial was prepaid: the customer subscribed during the trial, the
   * first period is already paid, and the row activates on trial_ends_at.
   */
  trialPrepaid: integer("trial_prepaid").notNull().default(0),
  /** nextCharge value a pre-renewal reminder was last sent for (dedupe). */
  renewalReminderFor: integer("renewal_reminder_for"),
  canceledAt: integer("canceled_at"),
  createdBy: text("created_by"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/* Safepay customer per org (cus_), gateway token encrypted at rest. */

export const safepayCustomers = sqliteTable(
  "safepay_customers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orgId: text("org_id").notNull().unique(),
    customerTokenEncrypted: text("customer_token_encrypted").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
);

/* Saved cards per org (pm_), gateway token encrypted at rest. */

export const paymentMethods = sqliteTable("payment_methods", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  userId: text("user_id"),
  safepayPaymentMethodTokenEncrypted: text("safepay_payment_method_token_encrypted").notNull(),
  brand: text("brand"),
  last4: text("last4"),
  expiryMonth: integer("expiry_month"),
  expiryYear: integer("expiry_year"),
  isDefault: integer("is_default").notNull().default(0),
  /** Backup order for fallback cascade: primary first, then lowest priority first. */
  priority: integer("priority").notNull().default(0),
  /** active | failed (failed = last charge attempt declined; UI-visible). */
  status: text("status").notNull().default("active"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/* Invoices + items + gateway transactions */

export const invoices = sqliteTable("invoices", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  subscriptionId: text("subscription_id"),
  /** Human-visible sequential number, e.g. INV-2026-0001. Unique. */
  number: text("number").unique(),
  type: text("type").notNull(),
  status: text("status").notNull().default("due"),
  amountMinor: integer("amount_minor").notNull(),
  currency: text("currency").notNull().default("USD"),
  description: text("description"),
  idempotencyKey: text("idempotency_key").unique(),
  tracker: text("tracker"),
  chargeId: text("charge_id"),
  /** Dunning state: reminders sent (day 0/2/4/6/7 schedule) + last sent at. */
  reminderCount: integer("reminder_count").notNull().default(0),
  lastReminderAt: integer("last_reminder_at"),
  dueAt: integer("due_at"),
  paidAt: integer("paid_at"),
  createdBy: text("created_by"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const invoiceItems = sqliteTable("invoice_items", {
  id: text("id").primaryKey(),
  invoiceId: text("invoice_id").notNull(),
  description: text("description").notNull(),
  amountMinor: integer("amount_minor").notNull(),
  currency: text("currency").notNull().default("USD"),
  createdAt: integer("created_at").notNull(),
});

export const transactions = sqliteTable("transactions", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  invoiceId: text("invoice_id"),
  /** Saved card the attempt ran against (per-card auto-retry budgets). Null = legacy/unknown. */
  paymentMethodId: text("payment_method_id"),
  tracker: text("tracker"),
  chargeId: text("charge_id"),
  kind: text("kind").notNull(),
  status: text("status").notNull(),
  amountMinor: integer("amount_minor").notNull(),
  currency: text("currency").notNull().default("USD"),
  description: text("description"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const webhookEvents = sqliteTable(
  "webhook_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    source: text("source").notNull(),
    externalId: text("external_id"),
    eventType: text("event_type").notNull(),
    payloadHash: text("payload_hash").notNull(),
    payloadJsonRedacted: text("payload_json_redacted").notNull(),
    processedAt: integer("processed_at"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => ({
    eventIdx: uniqueIndex("webhook_events_source_external_idx").on(
      table.source,
      table.externalId,
    ),
  }),
);

export const idempotencyKeys = sqliteTable("idempotency_keys", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  operation: text("operation").notNull(),
  requestHash: text("request_hash").notNull(),
  responseJson: text("response_json"),
  status: text("status").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/** Per-year invoice number sequence for INV-YYYY-NNNN numbering. */
export const invoiceSequences = sqliteTable("invoice_sequences", {
  year: integer("year").primaryKey(),
  lastNumber: integer("last_number").notNull().default(0),
});

/** Browser payment sessions (Atoms). Confirm reconciles the stored amount. */
export const paymentSessions = sqliteTable("payment_sessions", {
  tracker: text("tracker").primaryKey(),
  orgId: text("org_id").notNull(),
  userId: text("user_id"),
  amountMinor: integer("amount_minor").notNull(),
  currency: text("currency").notNull().default("USD"),
  purpose: text("purpose").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: integer("created_at").notNull(),
});

/* GrowthSnipe sidekick tables (single-table definitions live in
 * src/server/db/schema.ts so MCP/scheduler code can import them without the
 * billing schema; re-exported here so the app Db, drizzle-kit, and migrations
 * see one unified schema). */
export {
  sidekickAuditLogs,
  sidekickBriefingJobs,
  sidekickBusinessProfiles,
  sidekickConnections,
  sidekickEmployeeStates,
  sidekickMcpTokens,
  sidekickPolicies,
  sidekickSchedules,
} from "../src/server/db/schema";

/** MCP OAuth authorization server (opaque tokens, hashes only). */
export const oauthClients = sqliteTable("oauth_clients", {
  id: text("id").primaryKey(),
  name: text("name").notNull().default("MCP client"),
  redirectUrisJson: text("redirect_uris_json").notNull().default("[]"),
  createdAt: integer("created_at").notNull(),
});

export const oauthCodes = sqliteTable("oauth_codes", {
  codeHash: text("code_hash").primaryKey(),
  clientId: text("client_id").notNull(),
  redirectUri: text("redirect_uri").notNull(),
  orgId: text("org_id").notNull(),
  userId: text("user_id").notNull(),
  scope: text("scope").notNull().default(""),
  codeChallenge: text("code_challenge").notNull(),
  codeChallengeMethod: text("code_challenge_method").notNull().default("S256"),
  expiresAt: integer("expires_at").notNull(),
  usedAt: integer("used_at"),
  createdAt: integer("created_at").notNull(),
});

export const oauthTokens = sqliteTable("oauth_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  kind: text("kind").notNull().default("access"),
  clientId: text("client_id").notNull(),
  orgId: text("org_id").notNull(),
  userId: text("user_id").notNull(),
  scope: text("scope").notNull().default(""),
  expiresAt: integer("expires_at").notNull(),
  refreshHash: text("refresh_hash"),
  revokedAt: integer("revoked_at"),
  createdAt: integer("created_at").notNull(),
});

/* Platform-wide application logs (superadmin console). One row per captured
 * error or major domain event. Request bodies, tokens, and provider payloads
 * are never stored - detail_json holds only scrubbed metadata. */
export const appLogs = sqliteTable(
  "app_logs",
  {
    id: text("id").primaryKey(),
    createdAt: integer("created_at").notNull(),
    level: text("level").notNull(),
    event: text("event").notNull(),
    surface: text("surface").notNull(),
    message: text("message").notNull(),
    path: text("path"),
    method: text("method"),
    statusCode: integer("status_code"),
    userId: text("user_id"),
    userEmail: text("user_email"),
    orgId: text("org_id"),
    orgName: text("org_name"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    requestId: text("request_id"),
    detailJson: text("detail_json"),
    /** Where the request came from, from Cloudflare's `request.cf` geo. */
    city: text("city"),
    country: text("country"),
  },
  (t) => ({
    createdIdx: index("app_logs_created_idx").on(t.createdAt),
    levelCreatedIdx: index("app_logs_level_created_idx").on(t.level, t.createdAt),
    eventCreatedIdx: index("app_logs_event_created_idx").on(t.event, t.createdAt),
    userIdx: index("app_logs_user_idx").on(t.userId),
    orgIdx: index("app_logs_org_idx").on(t.orgId),
  }),
);
