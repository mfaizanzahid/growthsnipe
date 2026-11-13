import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../types";
import type { Db } from "../repositories/db";
import { contextMiddleware, createContextMiddleware } from "../middleware";
import type { Auth } from "../auth";
import { verifyDiagnosticToken } from "../diagnostic/tokens";
import { getRunByOrderId, logDiagnosticEvent, updateRun } from "../diagnostic/store";
import {
  normalizeCredentials,
  saveCredentials,
  validateCredentials,
} from "../diagnostic/credentials";
import {
  enqueueDiagnosticRun,
  parseFacts,
  processDiagnosticRun,
  renderRunReport,
} from "../diagnostic/report";
import type { DiagnosticProvider } from "../diagnostic/types";

const ConnectBody = z.object({
  token: z.string().min(1).max(2000),
  provider: z.enum(["spectora", "isn"]),
  credentials: z.record(z.string(), z.unknown()),
});

async function orderIdFromToken(env: Env, token: string): Promise<string | null> {
  const connect = await verifyDiagnosticToken(env, token, "connect");
  if (connect) return connect;
  return verifyDiagnosticToken(env, token, "report");
}

function filenameFor(businessName: string | null): string {
  const base = (businessName ?? "business")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `SNIPE-Diagnostic-${base || "business"}.pdf`;
}

export function createDiagnosticRoutes(deps: {
  ctx?: { db?: Db; auth?: Auth };
} = {}) {
  const routes = new Hono<{ Bindings: Env; Variables: { db: Db } }>();
  routes.use("*", deps.ctx ? createContextMiddleware(deps.ctx) : contextMiddleware);

  // Status for the connect/status page. Accepts either link purpose.
  routes.get("/api/diagnostic/run", async (c) => {
    const env = c.env as Env;
    const token = c.req.query("token") ?? "";
    const orderId = await orderIdFromToken(env, token);
    if (!orderId) return c.json({ error: "This link is invalid or has expired." }, 401);
    const run = await getRunByOrderId(c.get("db") as Db, orderId);
    if (!run) return c.json({ error: "Diagnostic not found." }, 404);
    return c.json({
      ok: true,
      run: {
        status: run.status,
        stage: run.stage,
        progress: run.progress,
        provider: run.provider,
        ready: run.status === "ready" || run.status === "ready_email_failed",
        failed: run.status === "failed",
      },
    });
  });

  // Save credentials and start the analysis.
  routes.post("/api/diagnostic/connect", async (c) => {
    const env = c.env as Env;
    const parsed = ConnectBody.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json({ error: "Choose a platform and provide its credentials." }, 422);
    const orderId = await verifyDiagnosticToken(env, parsed.data.token, "connect");
    if (!orderId) return c.json({ error: "This connect link is invalid or has expired." }, 401);

    const db = c.get("db") as Db;
    const run = await getRunByOrderId(db, orderId);
    if (!run) return c.json({ error: "Diagnostic not found." }, 404);
    if (run.status === "ready" || run.status === "ready_email_failed") {
      return c.json({ error: "This Diagnostic is already complete." }, 409);
    }

    const provider = parsed.data.provider as DiagnosticProvider;
    let credentials;
    try {
      credentials = normalizeCredentials(provider, parsed.data.credentials);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Credentials are incomplete." }, 422);
    }

    const validation = await validateCredentials(env, provider, credentials);
    if (!validation.ok) {
      return c.json({ error: validation.error }, 422);
    }

    await saveCredentials(db, env, run.id, provider, credentials);
    await updateRun(db, run.id, {
      provider,
      status: "syncing",
      stage: "queued",
      progress: 10,
      errorText: null,
    });
    await logDiagnosticEvent(db, run.id, "credentials", `${provider} credentials validated and saved`);

    const queued = await enqueueDiagnosticRun(env, run.id);
    if (!queued) {
      // Local/dev fallback: run inline without blocking the response.
      const task = processDiagnosticRun(env, db, run.id).catch(() => undefined);
      try {
        c.executionCtx.waitUntil(task);
      } catch {
        void task;
      }
    }
    return c.json({ ok: true, queued });
  });

  // Render and stream the PDF on demand from the stored facts and narrative.
  routes.get("/api/diagnostic/report", async (c) => {
    const env = c.env as Env;
    const token = c.req.query("token") ?? "";
    const orderId = await verifyDiagnosticToken(env, token, "report");
    if (!orderId) return c.json({ error: "This report link is invalid or has expired." }, 401);
    const db = c.get("db") as Db;
    const run = await getRunByOrderId(db, orderId);
    if (!run) return c.json({ error: "Diagnostic not found." }, 404);
    if (run.status !== "ready" && run.status !== "ready_email_failed") {
      return c.json({ error: "Your report is still being prepared." }, 409);
    }
    const pdf = await renderRunReport(db, run);
    if (!pdf) return c.json({ error: "The report could not be rendered." }, 500);
    const businessName = parseFacts(run)?.meta.businessName ?? null;
    const headers = new Headers({
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${filenameFor(businessName)}"`,
      "cache-control": "private, no-store",
    });
    const body = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
    return new Response(body, { status: 200, headers });
  });

  return routes;
}
