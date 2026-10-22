import { Resend } from "resend";
import {
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
export function superadminBcc(env: Env, to: string): string[] {
  const normalized = to.trim().toLowerCase();
  return [...parseSuperadminEmails(env.SUPERADMIN_EMAILS)].filter((e) => e !== normalized);
}

type EmailEnv = Pick<
  Env,
  | "RESEND_API_KEY"
  | "RESEND_FROM_EMAIL"
  | "BREVO_API_KEY"
  | "BREVO_SENDER_EMAIL"
  | "BREVO_SENDER_NAME"
  | "BREVO_NEW_SIGNUP_LIST_ID"
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
  if (captureEnabled) {
    outbox.push(email);
    return;
  }
  // Legacy callers pass the raw Resend key string (or undefined).
  if (typeof envOrKey === "string" || envOrKey == null) {
    if (!envOrKey) {
      // No key (local dev without email): capture locally so flows stay testable.
      outbox.push(email);
      return;
    }
    await sendViaResend(envOrKey, email, from);
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
      await sendBrevoEmail(brevoKey, sender, email);
      return;
    } catch (err) {
      // Fall through to Resend when configured; otherwise surface the error.
      // Warn so Brevo outages/misconfig don't go unnoticed (message only, no secrets).
      console.warn("[brevo] send failed, trying Resend fallback:", (err as Error)?.message ?? err);
      if (!env.RESEND_API_KEY) throw err;
      await sendViaResend(env.RESEND_API_KEY, email, from ?? env.RESEND_FROM_EMAIL);
      return;
    }
  }
  if (env.RESEND_API_KEY) {
    await sendViaResend(env.RESEND_API_KEY, email, from ?? env.RESEND_FROM_EMAIL);
    return;
  }
  // No provider configured (local dev without email): capture locally.
  outbox.push(email);
}

/**
 * Best-effort subscribe of a verified user to the "GrowthSnipe New Signup"
 * Brevo list (default id 8, override via BREVO_NEW_SIGNUP_LIST_ID).
 * Never throws — signup/login must succeed even when Brevo is down.
 */
export async function subscribeVerifiedUserToBrevo(
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
