import { Resend } from "resend";
import {
  freshInviteContent,
  invitationContent,
  magicLinkContent,
  resetPasswordContent,
  verificationContent,
  type OutgoingEmail,
} from "../email/templates";
import { parseSuperadminEmails } from "./access";
import {
  resolveBrevoSender,
  resolveSignupListId,
  sendBrevoEmail,
  addBrevoContactToLists,
} from "./brevo";
import type { Env } from "../types";

export type { OutgoingEmail };
export { escapeHtml } from "../email/templates";

/**
 * Email delivery for auth + billing notifications.
 *
 * All sends go through Brevo first (BREVO_API_KEY). When Brevo is not
 * configured or its send fails, delivery falls back to Resend
 * (RESEND_API_KEY) so the Resend path keeps working. In tests (or when no
 * API key is configured), messages are captured in an in-memory outbox
 * instead of being delivered.
 *
 * Copy lives in `email/templates.ts` — this module is transport only
 * (plus thin auth builders kept for import compatibility).
 */

let captureEnabled = false;
const outbox: OutgoingEmail[] = [];

/** Enable in-memory capture (tests). Returns the live outbox array. */
export function captureEmails(): OutgoingEmail[] {
  captureEnabled = true;
  outbox.length = 0;
  return outbox;
}

export function clearOutbox(): void {
  outbox.length = 0;
}

/**
 * Superadmin BCC list for a message: every SUPERADMIN_EMAILS entry except the
 * primary recipient (no duplicate delivery when the admin is the recipient).
 */
export function superadminBcc(env: { SUPERADMIN_EMAILS?: string }, to: string): string[] {
  const normalized = to.trim().toLowerCase();
  return [...parseSuperadminEmails(env.SUPERADMIN_EMAILS)].filter((e) => e !== normalized);
}

/** Merge the superadmin audit copy into an email without duplicating addresses. */
function withSuperadminBcc(env: EmailEnv, email: OutgoingEmail): OutgoingEmail {
  const existing = email.bcc ?? [];
  const seen = new Set(existing.map((e) => e.trim().toLowerCase()));
  const extra = superadminBcc(env, email.to).filter((e) => {
    const key = e.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (extra.length === 0) return email;
  return { ...email, bcc: [...existing, ...extra] };
}

type EmailEnv = Pick<
  Env,
  | "RESEND_API_KEY"
  | "RESEND_FROM_EMAIL"
  | "BREVO_API_KEY"
  | "BREVO_SENDER_EMAIL"
  | "BREVO_SENDER_NAME"
  | "BREVO_NEW_SIGNUP_LIST_ID"
  | "SUPERADMIN_EMAILS"
>;

async function sendViaResend(
  resendApiKey: string,
  email: OutgoingEmail,
  from?: string | undefined,
): Promise<void> {
  const resend = new Resend(resendApiKey);
  const bcc = (email.bcc ?? []).filter((e) => e && e.toLowerCase() !== email.to.toLowerCase());
  const { error } = await resend.emails.send({
    from: from ?? "portal@resend.dev",
    to: email.to,
    ...(bcc.length > 0 ? { bcc } : {}),
    subject: email.subject,
    html: email.html,
  });
  if (error) {
    throw new Error(`Resend send failed: ${error.message}`);
  }
}

/**
 * Send one transactional email. Accepts either the legacy
 * `(resendApiKey, email, from)` shape (Resend-only, kept for tests) or
 * `(env, email, from)` — the Env shape tries Brevo first, then Resend.
 */
export async function sendEmail(
  envOrKey: string | undefined | EmailEnv,
  email: OutgoingEmail,
  from?: string | undefined,
): Promise<void> {
  // Non-auth emails pass the full Env, so every customer-facing message gets
  // a hidden superadmin copy. Auth emails pass the raw Resend key and are
  // intentionally excluded (verification, magic link, reset, invitations).
  const message =
    typeof envOrKey === "object" && envOrKey !== null
      ? withSuperadminBcc(envOrKey, email)
      : email;
  if (captureEnabled) {
    outbox.push(message);
    return;
  }
  // Legacy callers pass the raw Resend key string (or undefined).
  if (typeof envOrKey === "string" || envOrKey == null) {
    if (!envOrKey) {
      // No key (local dev without email): capture locally so flows stay testable.
      outbox.push(message);
      return;
    }
    await sendViaResend(envOrKey, message, from);
    return;
  }
  const env = envOrKey;
  const brevoKey = env.BREVO_API_KEY?.trim();
  const sender = resolveBrevoSender({
    brevoEmail: env.BREVO_SENDER_EMAIL,
    brevoName: env.BREVO_SENDER_NAME,
    fallbackFrom: from ?? env.RESEND_FROM_EMAIL,
  });
  if (brevoKey && sender) {
    try {
      await sendBrevoEmail(brevoKey, sender, message);
      return;
    } catch (err) {
      // Fall through to Resend when configured; otherwise surface the error.
      // Warn so Brevo outages/misconfig don't go unnoticed (message only, no secrets).
      console.warn("[brevo] send failed, trying Resend fallback:", (err as Error)?.message ?? err);
      if (!env.RESEND_API_KEY) throw err;
      await sendViaResend(env.RESEND_API_KEY, message, from ?? env.RESEND_FROM_EMAIL);
      return;
    }
  }
  if (env.RESEND_API_KEY) {
    await sendViaResend(env.RESEND_API_KEY, message, from ?? env.RESEND_FROM_EMAIL);
    return;
  }
  // No provider configured (local dev without email): capture locally.
  outbox.push(message);
}

/**
 * Best-effort subscribe to the "GrowthSnipe New Signup" Brevo list
 * (default id 8, override via BREVO_NEW_SIGNUP_LIST_ID). Never throws:
 * auth and checkout must succeed even when Brevo is down.
 */
async function subscribeToNewSignupList(
  env: Pick<EmailEnv, "BREVO_API_KEY" | "BREVO_NEW_SIGNUP_LIST_ID">,
  input: { email: string; name?: string | null },
): Promise<"subscribed" | "skipped" | "failed"> {
  const apiKey = env.BREVO_API_KEY?.trim();
  if (!apiKey) return "skipped";
  const email = input.email?.trim();
  if (!email) return "skipped";
  try {
    await addBrevoContactToLists(apiKey, {
      email,
      ...(input.name ? { name: input.name } : {}),
      listIds: [resolveSignupListId(env.BREVO_NEW_SIGNUP_LIST_ID)],
    });
    return "subscribed";
  } catch (err) {
    console.warn("[brevo] contact subscribe failed (best-effort):", (err as Error)?.message ?? err);
    return "failed";
  }
}

/** Auth hook: a user whose email is verified joins the new signup list. */
export const subscribeVerifiedUserToBrevo = subscribeToNewSignupList;

/** Checkout hook: every buyer joins the same list, verified or not. */
export const subscribePurchaserToBrevo = subscribeToNewSignupList;

export function verificationEmail(to: string, url: string): OutgoingEmail {
  return { to, ...verificationContent(url) };
}

export function magicLinkEmail(to: string, url: string): OutgoingEmail {
  return { to, ...magicLinkContent(url) };
}

export function resetPasswordEmail(to: string, url: string): OutgoingEmail {
  return { to, ...resetPasswordContent(url) };
}

export function invitationEmail(
  to: string,
  orgName: string,
  inviteLink: string,
  supportEmail: string,
): OutgoingEmail {
  return { to, ...invitationContent(orgName, inviteLink, supportEmail) };
}

export function freshInviteEmail(
  to: string,
  url: string,
  supportEmail: string,
): OutgoingEmail {
  return { to, ...freshInviteContent({ url, supportEmail }) };
}
