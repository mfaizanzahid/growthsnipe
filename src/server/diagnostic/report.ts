import type { Db } from "../repositories/db";
import type { Env } from "../types";
import { getSetting } from "../repositories/index";
import { getOneTimeOrder } from "../repositories/billing";
import { sendEmail } from "../lib/email";
import {
  diagnosticConnectContent,
  diagnosticReadyContent,
  escapeHtml,
  firstNameOf,
  layout,
} from "../email/templates";
import { PORTAL_NAME } from "../lib/brand";
import {
  clearDiagnosticOrders,
  createOrGetRun,
  failRun,
  getRunById,
  listDiagnosticOrders,
  logDiagnosticEvent,
  saveFacts,
  saveNarrative,
  updateRun,
  type DiagnosticRunRow,
} from "./store";
import { collectAndPersist, diagnosticWindow } from "./collect";
import { buildFacts } from "./facts";
import { synthesizeDiagnostic } from "./synthesize";
import { renderDiagnosticPdf } from "./pdf";
import { loadCredentials, deleteCredentials } from "./credentials";
import { signDiagnosticToken } from "./tokens";
import type { DiagnosticFacts, DiagnosticNarrative } from "./types";

export interface DiagnosticOrderInfo {
  id: string;
  email: string;
  name: string | null;
  businessName: string | null;
  trade: string | null;
}

function baseUrl(env: Pick<Env, "APP_BASE_URL">): string {
  return (env.APP_BASE_URL ?? "").replace(/\/+$/, "");
}

async function supportEmail(db: Db): Promise<string> {
  return (await getSetting(db, "support_email").catch(() => null)) ?? "";
}

/**
 * Create the run for a paid diagnostic and send the secure connect link. Safe
 * to call more than once: the run is unique per order and the email is marked.
 */
export async function startDiagnosticRun(
  db: Db,
  env: Env,
  order: DiagnosticOrderInfo,
  now = Date.now(),
): Promise<DiagnosticRunRow> {
  const run = await createOrGetRun(db, { oneTimeOrderId: order.id, email: order.email, now });
  if (run.connectEmailSentAt) return run;

  const token = await signDiagnosticToken(env, { orderId: order.id, purpose: "connect", now });
  const connectUrl = `${baseUrl(env)}/diagnostic/connect?token=${encodeURIComponent(token)}`;
  const support = await supportEmail(db);
  const content = diagnosticConnectContent({
    firstName: firstNameOf(order.name),
    connectUrl,
  });
  await sendEmail(
    env,
    {
      to: order.email,
      subject: `[${PORTAL_NAME}] ${content.subject}`,
      html: layout(
        PORTAL_NAME,
        support,
        connectUrl,
        content.subject,
        content.html,
        "Connect your booking software",
      ),
    },
    env.RESEND_FROM_EMAIL,
  );
  await updateRun(db, run.id, { connectEmailSentAt: now }, now);
  await logDiagnosticEvent(db, run.id, "connect_email", "Connect link emailed", "info", now);
  return (await getRunById(db, run.id)) ?? run;
}

/**
 * Collect, analyze, synthesize, and mark the run ready. Called by the
 * DiagnosticWorkflow (or inline in local dev). Idempotent: an already-ready run
 * is left alone.
 */
export async function processDiagnosticRun(env: Env, db: Db, runId: string): Promise<void> {
  const run = await getRunById(db, runId);
  if (!run) return;
  if (run.status === "ready" || run.status === "ready_email_failed") return;

  try {
    const loaded = await loadCredentials(db, env, runId);
    if (!loaded) {
      await failRun(db, runId, "awaiting_connection", "No credentials were saved for this run");
      return;
    }
    const provider = loaded.provider;
    const order = await getOneTimeOrder(db, run.oneTimeOrderId);
    const window = run.windowFrom && run.windowTo
      ? { from: run.windowFrom, to: run.windowTo, monthsCovered: 12 }
      : diagnosticWindow();

    await updateRun(db, runId, {
      provider,
      status: "syncing",
      stage: "collecting",
      progress: 15,
      windowFrom: window.from,
      windowTo: window.to,
    });
    await logDiagnosticEvent(db, runId, "collecting", `Fetching ${provider} data for ${window.from.slice(0, 10)} to ${window.to.slice(0, 10)}`);

    const collected = await collectAndPersist(env, db, runId, provider, loaded.credentials, window);

    await updateRun(db, runId, { status: "analyzing", stage: "analyzing", progress: 55 });
    const rows = await listDiagnosticOrders(db, runId);
    const facts = buildFacts({
      provider,
      businessName: order?.businessName ?? null,
      trade: order?.trade ?? null,
      currency: "USD",
      window,
      orders: rows,
    });
    await saveFacts(db, runId, facts);
    await logDiagnosticEvent(
      db,
      runId,
      "analyzing",
      `Computed facts from ${collected.retrieved} orders${collected.truncated ? " (retrieval was capped)" : ""}`,
    );

    await updateRun(db, runId, { stage: "writing", progress: 78 });
    const narrative = await synthesizeDiagnostic(env, facts);
    await saveNarrative(db, runId, narrative);

    const now = Date.now();
    await updateRun(db, runId, {
      status: "ready",
      stage: "ready",
      progress: 100,
      readyAt: now,
      errorText: null,
    });
    await clearDiagnosticOrders(db, runId);
    await deleteCredentials(db, runId);
    await logDiagnosticEvent(db, runId, "ready", "Report is ready", "info", now);

    try {
      await sendReportReadyEmail(db, env, run, now);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await updateRun(db, runId, { status: "ready_email_failed", errorText: message.slice(0, 500) }, now);
      await logDiagnosticEvent(db, runId, "report_email", "Report email failed", "error", now);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await failRun(db, runId, run.stage ?? "processing", message);
    // Let the workflow retry transient collection/AI/render faults. The run
    // status stays failed until a retry succeeds and flips it to ready.
    throw err;
  }
}

async function sendReportReadyEmail(db: Db, env: Env, run: DiagnosticRunRow, now: number): Promise<void> {
  if (run.reportEmailSentAt) return;
  const token = await signDiagnosticToken(env, { orderId: run.oneTimeOrderId, purpose: "report", now });
  const reportUrl = `${baseUrl(env)}/api/diagnostic/report?token=${encodeURIComponent(token)}`;
  const bookUrl = `${baseUrl(env)}/book`;
  const order = await getOneTimeOrder(db, run.oneTimeOrderId);
  const support = await supportEmail(db);
  const content = diagnosticReadyContent({
    firstName: firstNameOf(order?.name ?? null),
    reportUrl,
    bookUrl,
  });
  await sendEmail(
    env,
    {
      to: run.email,
      subject: `[${PORTAL_NAME}] ${content.subject}`,
      html: layout(
        PORTAL_NAME,
        support,
        reportUrl,
        content.subject,
        content.html,
        "Download your Diagnostic report",
      ),
    },
    env.RESEND_FROM_EMAIL,
  );
  await updateRun(db, run.id, { reportEmailSentAt: now, errorText: null }, now);
}

export function parseFacts(run: DiagnosticRunRow): DiagnosticFacts | null {
  if (!run.factsJson) return null;
  try {
    return JSON.parse(run.factsJson) as DiagnosticFacts;
  } catch {
    return null;
  }
}

export function parseNarrative(run: DiagnosticRunRow): DiagnosticNarrative | null {
  if (!run.narrativeJson) return null;
  try {
    return JSON.parse(run.narrativeJson) as DiagnosticNarrative;
  } catch {
    return null;
  }
}

/** Render the report on demand from the stored facts and narrative. */
export async function renderRunReport(run: DiagnosticRunRow): Promise<Uint8Array | null> {
  const facts = parseFacts(run);
  const narrative = parseNarrative(run);
  if (!facts || !narrative) return null;
  return renderDiagnosticPdf(facts, narrative);
}

/** Escape helper re-exported for route error messages that include email text. */
export { escapeHtml };

export async function enqueueDiagnosticRun(
  env: Env,
  runId: string,
): Promise<boolean> {
  const binding = env.DIAGNOSTIC_WORKFLOW;
  if (!binding) return false;
  await binding.create({ id: `diagnostic:${runId}`, params: { runId } });
  return true;
}
