import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { desc, sql } from "drizzle-orm";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { magicLink, organization } from "better-auth/plugins";
import { ac, roles } from "../shared/permissions";
import type { Env } from "./types";
import type { Db } from "./repositories/db";
import * as schema from "../../db/schema";
import {
  sendEmail,
  subscribeVerifiedUserToBrevo,
  // superadminBcc,
  verificationEmail,
  magicLinkEmail,
  invitationEmail,
  resetPasswordEmail,
} from "./lib/email";
import { isSuperadminSeedEmail, parseSuperadminEmails } from "./lib/access";
import { getSetting, getUserById, isSuperadmin, seedSuperadmins } from "./repositories";
import { drizzleStore, getUser, setDefaultOrg } from "./repositories/billing";
import { activeMemberCount, canCreateOrg, orgAccess } from "./billing/access";

/**
 * Re-send the verification link when someone signs up with an address that
 * already has an UNVERIFIED account (Better Auth returns a generic success
 * and sends nothing in that case). Verified addresses are never mailed.
 * A 60s per-address cooldown blunts signup-form email bombing. Exported for
 * tests; the signup hook wires the live sender.
 */
export async function resendVerificationForExistingSignup(
  db: Db,
  send: (email: string, headers: Headers) => Promise<void>,
  user: { email: string; emailVerified: boolean },
  headers: Headers,
): Promise<"sent" | "skipped" | "failed"> {
  if (user.emailVerified) return "skipped";
  const email = user.email.trim().toLowerCase();
  if (!email) return "skipped";
  try {
    const recent = await db
      .select({ createdAt: schema.verifications.createdAt })
      .from(schema.verifications)
      .where(sql`lower(${schema.verifications.identifier}) = ${`email-verification:${email}`}`)
      .orderBy(desc(schema.verifications.createdAt))
      .limit(1);
    const at = recent[0]?.createdAt?.getTime() ?? 0;
    if (Date.now() - at < 60_000) return "skipped";
  } catch {
    // Cooldown is best-effort anti-spam; never block the resend on it.
  }
  try {
    await send(email, headers);
    return "sent";
  } catch {
    return "failed";
  }
}

/**
 * Per-request Better Auth instance (D1 binding is per-request on Workers).
 *
 * Verified against better-auth 1.7 docs:
 * - Hono mount: `app.all("/api/auth/*", (c) => auth.handler(c.req.raw))`
 * - Drizzle adapter with explicit schema mapping (plural table names)
 * - organization plugin with table/field mapping + creatorRole
 * - magic link + email verification + Google OAuth
 *
 * Assumptions recorded in docs/decision-log.md:
 * - plugin `fields.organizationId -> orgId` mapping shape
 * - free-form member roles ("user"/"viewer" stored as-is)
 * - session.create hook payload shape (defensive try/catch + middleware self-heal)
 */
export function createAuth(env: Env, db: Db) {
  // Set after betterAuth() returns; the signup hooks below only run per-request.
  const authRef: { current: Auth | null } = { current: null };
  const google =
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          socialProviders: {
            google: {
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: env.GOOGLE_CLIENT_SECRET,
            },
          },
        }
      : {};

  const auth = betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.APP_BASE_URL,
    trustedOrigins: [env.APP_BASE_URL],
    database: drizzleAdapter(db, {
      provider: "sqlite",
      // Keyed by BOTH singular model names and plural table names: core
      // adapter calls use singular ("member") while the organization plugin
      // queries plural ("members"). Covers either lookup verbatim.
      schema: {
        user: schema.users,
        users: schema.users,
        session: schema.sessions,
        sessions: schema.sessions,
        account: schema.accounts,
        accounts: schema.accounts,
        verification: schema.verifications,
        verifications: schema.verifications,
        organization: schema.organizations,
        organizations: schema.organizations,
        member: schema.members,
        members: schema.members,
        invitation: schema.invitations,
        invitations: schema.invitations,
      },
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      // Re-signup with a pending (unverified) address re-sends the link, so a
      // confused user isn't stranded without clicking Resend. Verified
      // addresses are never mailed here — the signup form must not become a
      // spam cannon against registered emails.
      onExistingUserSignUp: async ({ user }, request) => {
        try {
          const auth = authRef.current;
          if (!auth) return;
          await resendVerificationForExistingSignup(
            db,
            async (email, headers) => {
              await auth.api.sendVerificationEmail({
                body: { email, callbackURL: "/onboarding" },
                headers,
              });
            },
            user,
            request?.headers ?? new Headers(),
          );
        } catch {
          // never break signup over a background resend
        }
      },
      sendResetPassword: async ({ user, url }) => {
        // Auth emails send via Resend (Brevo is billing-only + signup list).
        await sendEmail(
          env.RESEND_API_KEY,
          { ...resetPasswordEmail(user.email, url) /*, bcc: superadminBcc(env, user.email) */ },
          env.RESEND_FROM_EMAIL,
        );
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        // Auth emails send via Resend (Brevo is billing-only + signup list).
        await sendEmail(
          env.RESEND_API_KEY,
          { ...verificationEmail(user.email, url) /*, bcc: superadminBcc(env, user.email) */ },
          env.RESEND_FROM_EMAIL,
        );
      },
    },
    ...google,
    plugins: [
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          // Auth emails send via Resend (Brevo is billing-only + signup list).
          await sendEmail(
            env.RESEND_API_KEY,
            { ...magicLinkEmail(email, url) /*, bcc: superadminBcc(env, email) */ },
            env.RESEND_FROM_EMAIL,
          );
        },
      }),
      organization({
        creatorRole: "admin",
        requireEmailVerificationOnInvitation: true,
        ac,
        roles,
        organizationHooks: {
          // Organization names are globally unique (case-insensitive).
          // Superadmins are platform operators, not tenants: they cannot create orgs.
          // Multi-org rule: another workspace opens only while the user's
          // first workspace holds an active paid subscription.
          beforeCreateOrganization: async ({ organization, user }) => {
            if (user?.id && (await isSuperadmin(db, user.id))) {
              throw new APIError("FORBIDDEN", { message: "Superadmins cannot create organizations" });
            }
            if (user?.id) {
              const store = drizzleStore(db);
              const verdict = await canCreateOrg(store, user.id);
              if (!verdict.ok) throw new APIError("FORBIDDEN", { message: verdict.reason ?? "Cannot create another workspace right now" });
            }
            const name = (organization.name ?? "").trim().toLowerCase();
            if (!name) throw new APIError("BAD_REQUEST", { message: "Organization name is required" });
            const existing = await db
              .select({ id: schema.organizations.id })
              .from(schema.organizations)
              .where(sql`lower(${schema.organizations.name}) = ${name}`)
              .limit(1);
            if (existing.length > 0) {
              throw new APIError("CONFLICT", { message: "An organization with this name already exists" });
            }
          },
          // Plan limits cap membership: block invites at the limit.
          beforeCreateInvitation: async ({ invitation }) => {
            const orgId = invitation.organizationId as string | undefined;
            if (!orgId) return;
            const store = drizzleStore(db);
            const access = await orgAccess(store, orgId);
            if (access.maxUsers == null) return;
            const count = await activeMemberCount(store, orgId);
            if (count >= access.maxUsers) {
              throw new APIError("FORBIDDEN", {
                message: `This workspace is limited to ${access.maxUsers} user${access.maxUsers === 1 ? "" : "s"}. Contact us to add more.`,
              });
            }
          },
          // The first organization a user creates becomes their default.
          afterCreateOrganization: async ({ organization, user }) => {
            try {
              if (!user?.id || !organization?.id) return;
              const existing = await getUser(db, user.id);
              if (existing && !existing.defaultOrgId) {
                await setDefaultOrg(db, user.id, organization.id);
              }
            } catch {
              // never break org creation over the default pointer
            }
          },
        },
        sendInvitationEmail: async (data) => {
          const support = (await getSetting(db, "support_email")) ?? "support@growthsnipe.com";
          const link = `${env.APP_BASE_URL}/accept-invitation/${data.id}`;
          // Auth emails send via Resend (Brevo is billing-only + signup list).
          await sendEmail(
            env.RESEND_API_KEY,
            { ...invitationEmail(data.email, data.organization.name, link, support) /*, bcc: superadminBcc(env, data.email) */ },
            env.RESEND_FROM_EMAIL,
          );
        },
        schema: {
          organization: { modelName: "organizations" },
          member: { modelName: "members", fields: { organizationId: "orgId" } },
          invitation: { modelName: "invitations", fields: { organizationId: "orgId" } },
        },
      }),
    ],
    databaseHooks: {
      user: {
        // Brevo "GrowthSnipe New Signup" list: subscribe only after the email
        // is verified (per product decision). Best-effort — never blocks auth.
        create: {
          after: async (user: unknown) => {
            try {
              const u = user as { email?: string; name?: string | null; emailVerified?: boolean };
              if (u?.email && u.emailVerified) {
                await subscribeVerifiedUserToBrevo(env, { email: u.email, name: u.name });
              }
            } catch {
              // ignore — auth must succeed regardless
            }
          },
        },
        update: {
          after: async (user: unknown) => {
            try {
              const u = user as { email?: string; name?: string | null; emailVerified?: boolean };
              if (u?.email && u.emailVerified) {
                await subscribeVerifiedUserToBrevo(env, { email: u.email, name: u.name });
              }
            } catch {
              // ignore — auth must succeed regardless
            }
          },
        },
      },
      session: {
        create: {
          after: async (created: unknown) => {
            // Best-effort superadmin seeding; never break login.
            // requireSuperadmin middleware self-heals if this hook misfires.
            try {
              const userId = (created as { userId?: string } | null)?.userId;
              if (!userId) return;
              const user = await getUserById(db, userId);
              if (user && isSuperadminSeedEmail(env.SUPERADMIN_EMAILS, user.email)) {
                await seedSuperadmins(db, [user.email]);
              }
            } catch {
              // ignore — login must succeed regardless
            }
          },
        },
      },
    },
  });
  authRef.current = auth;
  return auth;
}

export type Auth = ReturnType<typeof createAuth>;

export function superadminSeedEmails(env: Env): string[] {
  return [...parseSuperadminEmails(env.SUPERADMIN_EMAILS)];
}
