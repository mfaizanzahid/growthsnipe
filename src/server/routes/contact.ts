import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../types";
import { contextMiddleware, createContextMiddleware } from "../middleware";
import type { Db } from "../repositories/db";
import type { Auth } from "../auth";
import { getSetting } from "../repositories";
import { parseSuperadminEmails } from "../lib/access";
import { escapeHtml, sendEmail } from "../lib/email";

const ContactBody = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  message: z.string().trim().min(10).max(5000),
});

/** Public contact form: validates, then emails the support address via Resend. */
export function createContactRoutes(deps: {
  ctx?: { db?: Db; auth?: Auth };
  settings?: { getSupportEmail(): Promise<string> };
} = {}) {
  const routes = new Hono<{ Bindings: Env; Variables: { db: Db } }>();

  routes.use("*", deps.ctx ? createContextMiddleware(deps.ctx) : contextMiddleware);

  routes.post("/api/contact", async (c) => {
    const env = c.env as Env;
    const parsed = ContactBody.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json({ error: "Please provide your name, a valid email, and a message (10+ characters)." }, 422);
    const supportEmail = deps.settings
      ? await deps.settings.getSupportEmail()
      : ((await getSetting(c.get("db") as Db, "support_email")) ??
        [...parseSuperadminEmails(env.SUPERADMIN_EMAILS)][0] ??
        "");
    if (!supportEmail) return c.json({ error: "Contact is unavailable right now — please try again later." }, 503);
    const { name, email, message } = parsed.data;
    try {
      await sendEmail(
        env,
        {
          to: supportEmail,
          subject: `Contact form: ${name}`,
          html:
            `<p><strong>From:</strong> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;</p>` +
            `<p>${escapeHtml(message).replace(/\n/g, "<br>")}</p>`,
          bcc: [],
        },
        env.RESEND_FROM_EMAIL,
      );
    } catch {
      return c.json({ error: "Could not send your message — please try again later." }, 502);
    }
    return c.json({ ok: true });
  });

  return routes;
}
