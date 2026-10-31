import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../types";
import { contextMiddleware, createContextMiddleware } from "../middleware";
import type { Db } from "../repositories/db";
import type { Auth } from "../auth";
import { getSetting } from "../repositories";
import { parseSuperadminEmails } from "../lib/access";
import { escapeHtml, sendEmail } from "../lib/email";
import { writeAppLog } from "../lib/app-logs";

const REVENUE_RANGES = [
  "Under $250k",
  "$250k to $500k",
  "$500k to $1M",
  "$1M to $2.5M",
  "Over $2.5M",
  "Prefer not to say",
] as const;

const TEAM_SIZES = ["Just me", "2 to 5", "6 to 15", "16 to 50", "Over 50"] as const;

const SOFTWARE = ["Spectora", "ISN", "ServiceTitan", "Housecall Pro", "Jobber", "Something else"] as const;

const MARKETING_SPEND = ["None right now", "Under 1k/mo", "1k to 3k/mo", "3k to 10k/mo", "Over 10k/mo"] as const;

const GROWTH_TARGETS = ["25% growth", "50% growth", "Double the business", "Not sure yet"] as const;

const websiteRefine = (v: string) =>
  /^(https?:\/\/)?[\w-]+(\.[\w-]+)+/.test(v) || "Enter a valid website or profile link.";

const BookBody = z.object({
  name: z.string().trim().min(1).max(120),
  workEmail: z.string().trim().email().max(200),
  phone: z.string().trim().min(7).max(40),
  businessName: z.string().trim().min(1).max(160),
  website: z.string().trim().min(4).max(300).refine(websiteRefine),
  trade: z.string().trim().min(1).max(120),
  serviceArea: z.string().trim().min(1).max(160),
  revenueRange: z.enum(REVENUE_RANGES),
  teamSize: z.enum(TEAM_SIZES),
  software: z.enum(SOFTWARE),
  growthChallenge: z.string().trim().min(10).max(2000),
  marketingSpend: z.union([z.enum(MARKETING_SPEND), z.literal("")]).optional().default(""),
  growthTarget: z.union([z.enum(GROWTH_TARGETS), z.literal("")]).optional().default(""),
  notes: z.string().trim().max(2000).optional().default(""),
});

/** Book-a-call requests: validates, emails the support address, logs the event. */
export function createBookRoutes(deps: {
  ctx?: { db?: Db; auth?: Auth };
  settings?: { getSupportEmail(): Promise<string> };
} = {}) {
  const routes = new Hono<{ Bindings: Env; Variables: { db: Db } }>();

  routes.use("*", deps.ctx ? createContextMiddleware(deps.ctx) : contextMiddleware);

  routes.post("/api/book", async (c) => {
    const env = c.env as Env;
    const parsed = BookBody.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) {
      const detail = parsed.error.issues[0];
      return c.json({ error: `Please complete the form (${detail?.path.join(".") ?? "check the highlighted fields"}).` }, 422);
    }
    const supportEmail = deps.settings
      ? await deps.settings.getSupportEmail()
      : ((await getSetting(c.get("db") as Db, "support_email")) ??
        [...parseSuperadminEmails(env.SUPERADMIN_EMAILS)][0] ??
        "");
    if (!supportEmail) return c.json({ error: "Booking is unavailable right now — please try again later." }, 503);
    const b = parsed.data;
    const rows: Array<[string, string]> = [
      ["Name", b.name],
      ["Work email", b.workEmail],
      ["Phone", b.phone],
      ["Business", b.businessName],
      ["Website / profile", b.website],
      ["Trade", b.trade],
      ["Service area", b.serviceArea],
      ["Revenue range", b.revenueRange],
      ["Team size", b.teamSize],
      ["Software", b.software],
      ["Growth challenge", b.growthChallenge],
    ];
    if (b.marketingSpend) rows.push(["Marketing spend", b.marketingSpend]);
    if (b.growthTarget) rows.push(["12-month target", b.growthTarget]);
    if (b.notes) rows.push(["Anything else", b.notes]);
    try {
      await sendEmail(
        env,
        {
          to: supportEmail,
          subject: `Book a call: ${b.businessName} (${b.trade})`,
          html: rows
            .map(([k, v]) => `<p><strong>${escapeHtml(k)}:</strong> ${escapeHtml(v).replace(/\n/g, "<br>")}</p>`)
            .join(""),
          bcc: [],
        },
        env.RESEND_FROM_EMAIL,
      );
    } catch {
      return c.json({ error: "Could not send your request — please try again later." }, 502);
    }
    try {
      await writeAppLog(c.get("db") as Db, {
        level: "info",
        event: "book.submitted",
        surface: "api",
        message: `Book-a-call request from ${b.businessName}`,
        path: "/api/book",
        method: "POST",
        statusCode: 200,
        userEmail: b.workEmail,
        detail: { businessName: b.businessName, trade: b.trade, software: b.software },
      });
    } catch {
      // Logged best-effort; the email already went out.
    }
    return c.json({ ok: true });
  });

  return routes;
}
