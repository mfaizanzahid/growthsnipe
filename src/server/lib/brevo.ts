/**
 * Brevo transport (Workers-safe, fetch only).
 *
 * - Transactional sends: POST https://api.brevo.com/v3/smtp/email
 * - Contact subscribe: POST https://api.brevo.com/v3/contacts with `listIds`
 *   (+ fallback POST /v3/contacts/lists/{listId}/contacts/add for duplicates)
 *
 * All functions throw on transport/API failure so callers can fall back
 * (Resend) or swallow (best-effort subscribe). No secrets are logged.
 */

export interface BrevoSender {
  email: string;
  name?: string;
}

export interface BrevoEmailInput {
  to: string;
  bcc?: string[];
  subject: string;
  html: string;
}

const BREVO_API_BASE = "https://api.brevo.com/v3";

/** Parse "Name <email@x.com>" or plain "email@x.com" into { name, email }. */
export function parseSenderAddress(raw: string | undefined): BrevoSender | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const angled = trimmed.match(/^(.*?)\s*<\s*([^<>\s@]+@[^<>\s]+)\s*>$/);
  if (angled) {
    const name = (angled[1] ?? "").trim().replace(/^["']|["']$/g, "").trim();
    return { email: angled[2]!.trim(), ...(name ? { name } : {}) };
  }
  if (/^[^<>\s@]+@[^<>\s]+$/.test(trimmed)) return { email: trimmed };
  return undefined;
}

/**
 * Resolve the Brevo sender: explicit BREVO_SENDER_EMAIL/NAME win,
 * otherwise fall back to parsing the legacy `from` (RESEND_FROM_EMAIL).
 */
export function resolveBrevoSender(input: {
  brevoEmail?: string;
  brevoName?: string;
  fallbackFrom?: string;
}): BrevoSender | undefined {
  const email = input.brevoEmail?.trim();
  if (email) {
    const name = input.brevoName?.trim();
    return { email, ...(name ? { name } : {}) };
  }
  return parseSenderAddress(input.fallbackFrom);
}

function splitName(fullName: string | undefined): { FNAME?: string; LNAME?: string } {
  if (!fullName) return {};
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { FNAME: parts[0] };
  return { FNAME: parts[0], LNAME: parts.slice(1).join(" ") };
}

export async function sendBrevoEmail(
  apiKey: string,
  sender: BrevoSender,
  email: BrevoEmailInput,
): Promise<void> {
  const bcc = (email.bcc ?? []).filter((e) => e && e.toLowerCase() !== email.to.toLowerCase());
  const res = await fetch(`${BREVO_API_BASE}/smtp/email`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender: { email: sender.email, ...(sender.name ? { name: sender.name } : {}) },
      to: [{ email: email.to }],
      ...(bcc.length > 0 ? { bcc: bcc.map((addr) => ({ email: addr })) } : {}),
      subject: email.subject,
      htmlContent: email.html,
    }),
  });
  if (res.ok) return;
  const body = await res.text().catch(() => "");
  throw new Error(`Brevo send failed (${res.status}): ${body.slice(0, 300)}`);
}

export function resolveSignupListId(raw: string | number | undefined, fallback = 8): number {
  if (typeof raw === "number" && Number.isInteger(raw) && raw > 0) return raw;
  if (typeof raw === "string") {
    const n = Number.parseInt(raw.trim(), 10);
    if (Number.isInteger(n) && n > 0) return n;
  }
  return fallback;
}

/**
 * Create (or update) a Brevo contact and assign it to `listIds`.
 * Uses updateEnabled:true so re-verifies / repeat signups don't 400.
 * On duplicate errors, falls back to the add-to-list endpoint.
 */
export async function addBrevoContactToLists(
  apiKey: string,
  input: { email: string; name?: string; listIds: number[] },
): Promise<void> {
  const email = input.email.trim();
  if (!email) throw new Error("Brevo contact requires an email");
  const attributes = splitName(input.name);
  const res = await fetch(`${BREVO_API_BASE}/contacts`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      email,
      ...(Object.keys(attributes).length > 0 ? { attributes } : {}),
      listIds: input.listIds,
      updateEnabled: true,
    }),
  });
  if (res.ok) return;
  const status = res.status;
  const body = await res.text().catch(() => "");
  // Duplicate / already-exists: ensure list membership via the add endpoint.
  if (status === 400 && /already|duplicate|exists/i.test(body)) {
    for (const listId of input.listIds) {
      const add = await fetch(`${BREVO_API_BASE}/contacts/lists/${listId}/contacts/add`, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "api-key": apiKey,
        },
        body: JSON.stringify({ emails: [email] }),
      });
      if (!add.ok) {
        const addBody = await add.text().catch(() => "");
        throw new Error(`Brevo add-to-list failed (${add.status}): ${addBody.slice(0, 300)}`);
      }
    }
    return;
  }
  throw new Error(`Brevo contact create failed (${status}): ${body.slice(0, 300)}`);
}
