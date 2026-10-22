import { Hono } from "hono";
import { z } from "zod";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { accounts, users, verifications } from "../../../db/schema";
import type { Env } from "../types";
import { contextMiddleware, createContextMiddleware } from "../middleware";
import type { Db } from "../repositories/db";
import type { Auth } from "../auth";

const Body = z.object({
  currentEmail: z.string().trim().toLowerCase().email().max(200),
  newEmail: z.string().trim().toLowerCase().email().max(200),
});

const ExistsBody = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
});

/** Minimum gap between verification sends for one pending address. */
const RESEND_COOLDOWN_MS = 60_000;

/**
 * Better Auth stores email-verification tokens under this identifier.
 * Used only for the cooldown check + stale-token cleanup; a shape change
 * upstream fails open (cooldown skipped, core guards unaffected).
 */
const verificationIdentifier = (email: string) => `email-verification:${email}`;

/** Narrow data-access surface (real or fake in tests). */
export interface PendingEmailStore {
  findByEmail(email: string): Promise<{ id: string; email: string; emailVerified: boolean } | null>;
  emailTakenByOther(email: string, exceptUserId: string): Promise<boolean>;
  lastVerificationSentAt(email: string): Promise<number | null>;
  changeEmail(userId: string, oldEmail: string, newEmail: string): Promise<void>;
}

/** Sends a fresh verification link (real or fake in tests). */
export interface PendingEmailMailer {
  sendVerificationEmail(email: string, headers: Headers): Promise<void>;
}

function liveStore(db: Db): PendingEmailStore {
  return {
    async findByEmail(email) {
      const rows = await db
        .select({ id: users.id, email: users.email, emailVerified: users.emailVerified })
        .from(users)
        .where(sql`lower(${users.email}) = ${email}`)
        .limit(1);
      return rows[0] ?? null;
    },
    async emailTakenByOther(email, exceptUserId) {
      const rows = await db
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.email}) = ${email}`)
        .limit(2);
      return rows.some((r) => r.id !== exceptUserId);
    },
    async lastVerificationSentAt(email) {
      try {
        const rows = await db
          .select({ createdAt: verifications.createdAt })
          .from(verifications)
          .where(eq(verifications.identifier, verificationIdentifier(email)))
          .orderBy(desc(verifications.createdAt))
          .limit(1);
        const at = rows[0]?.createdAt;
        return at ? at.getTime() : null;
      } catch {
        return null;
      }
    },
    async changeEmail(userId, oldEmail, newEmail) {
      const now = new Date();
      await db.update(users).set({ email: newEmail, updatedAt: now }).where(eq(users.id, userId));
      // Password sign-in looks the account up by this email — keep it in sync.
      await db
        .update(accounts)
        .set({ accountId: newEmail, updatedAt: now })
        .where(sql`${accounts.userId} = ${userId} AND ${accounts.providerId} = 'credential'`);
      // Old links must die with the old address (plus any stale rows for the new one).
      await db
        .delete(verifications)
        .where(
          inArray(
            verifications.identifier,
            [verificationIdentifier(oldEmail), verificationIdentifier(newEmail)],
          ),
        );
    },
  };
}

function liveMailer(auth: Auth): PendingEmailMailer {
  return {
    async sendVerificationEmail(email, headers) {
      await auth.api.sendVerificationEmail({
        body: { email, callbackURL: "/onboarding" },
        headers,
      });
    },
  };
}

/**
 * Move a still-unverified signup to a corrected address and re-send the link.
 * No session exists before verification, so this is intentionally scoped:
 * unverified accounts only, new address must be unused, 60s per-address
 * cooldown. Unknown addresses get a generic success (no enumeration oracle).
 */
export function createPendingEmailRoutes(deps: {
  ctx?: { db?: Db; auth?: Auth };
  store?: PendingEmailStore;
  mailer?: PendingEmailMailer;
} = {}) {
  const routes = new Hono<{ Bindings: Env; Variables: { db: Db; auth: Auth } }>();

  routes.use("*", deps.ctx ? createContextMiddleware(deps.ctx) : contextMiddleware);

  /**
   * Deliberate enumeration oracle for the signup form: tells whether a
   * VERIFIED account already uses an address so the UI can say "please sign
   * in" instead of stranding the user on the verify page. Unverified
   * addresses report false so pending signups keep the resend-link flow
   * (sign-in would fail for them anyway).
   */
  routes.post("/api/account-exists", async (c) => {
    const parsed = ExistsBody.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json({ error: "Enter a valid email address." }, 422);
    const db = c.get("db") as Db;
    const store = deps.store ?? liveStore(db);
    const user = await store.findByEmail(parsed.data.email);
    return c.json({ exists: user?.emailVerified === true });
  });

  routes.post("/api/pending-email", async (c) => {
    const parsed = Body.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success || parsed.data.currentEmail === parsed.data.newEmail) {
      return c.json({ error: "Please provide your current address and a different new address." }, 422);
    }
    const { currentEmail, newEmail } = parsed.data;
    const db = c.get("db") as Db;
    const store = deps.store ?? liveStore(db);

    const user = await store.findByEmail(currentEmail);
    if (!user) return c.json({ ok: true });
    if (user.emailVerified) {
      return c.json({ error: "This email is already verified. Please sign in instead." }, 400);
    }
    if (await store.emailTakenByOther(newEmail, user.id)) {
      return c.json({ error: "That email address is already in use." }, 400);
    }
    const lastSent = await store.lastVerificationSentAt(currentEmail);
    if (lastSent != null && Date.now() - lastSent < RESEND_COOLDOWN_MS) {
      return c.json({ error: "Please wait a minute before trying again." }, 429);
    }

    await store.changeEmail(user.id, currentEmail, newEmail);
    const mailer = deps.mailer ?? liveMailer(c.get("auth") as Auth);
    try {
      await mailer.sendVerificationEmail(newEmail, c.req.raw.headers);
    } catch {
      // Address is moved; the user can still get a link via Resend below.
      return c.json(
        { error: "Email updated, but we couldn't send the new link. Use Resend below.", email: newEmail },
        502,
      );
    }
    return c.json({ ok: true, email: newEmail });
  });

  return routes;
}
