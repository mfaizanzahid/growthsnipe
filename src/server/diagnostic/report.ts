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
  claimDiagnosticOrdersForEnrichment,
  clearDiagnosticOrders,
  countDiagnosticOrders,
  countPendingEnrichment,
  createOrGetRun,
  failRun,
  getRunById,
  listDiagnosticOrders,
  logDiagnosticEvent,
  saveDiagnosticOrderServices,
  saveFacts,
  saveNarrative,
  updateRun,
  type DiagnosticRunRow,
} from "./store";
import {
  collectAndPersist,
  diagnosticWindow,
  fetchDiagnosticEnrichment,
} from "./collect";
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

export interface PreparedDiagnosticRun {
  provider: "spectora" | "isn";
  pendingEnrichment: boolean;
}

function runProvider(run: DiagnosticRunRow): "spectora" | "isn" | null {
  return run.provider === "spectora" || run.provider === "isn" ? run.provider : null;
}

/**
 * Fetch the listing (no ISN detail reads) and persist the temp rows. Workflow
 * batches then claim and enrich only the rows that still need fee detail.
 */
export async function prepareDiagnosticRun(
  env: Env,
  db: Db,
  runId: string,
): Promise<PreparedDiagnosticRun> {
  const run = await getRunById(db, runId);
  if (!run) throw new Error("Diagnostic run not found");
  const alreadyReady = run.status === "ready" || run.status === "ready_email_failed";
  const loaded = alreadyReady ? null : await loadCredentials(db, env, runId);
  if (!alreadyReady && !loaded) {
    await failRun(db, runId, "awaiting_connection", "No credentials were saved for this run");
    throw new Error("No credentials were saved for this run");
  }
  const provider = loaded?.provider ?? runProvider(run) ?? "isn";
  if (alreadyReady) return { provider, pendingEnrichment: false };

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
  await logDiagnosticEvent(
    db,
    runId,
    "collecting",
    `Fetching ${provider} data for ${window.from.slice(0, 10)} to ${window.to.slice(0, 10)}`,
  );

  const collected = await collectAndPersist(
    env,
    db,
    runId,
    provider,
    loaded!.credentials,
    window,
    Date.now(),
    { enrich: false },
  );
  const pendingEnrichment = provider === "isn" && (await countPendingEnrichment(db, runId)) > 0;
  await logDiagnosticEvent(
    db,
    runId,
    "collecting",
    `Fetched ${collected.retrieved} orders${collected.truncated ? " (listing was capped)" : ""}`,
  );
  return { provider, pendingEnrichment };
}

/** Enrich one bounded batch of ISN orders and persist their fee lines. */
export async function enrichDiagnosticRunBatch(
  env: Env,
  db: Db,
  runId: string,
  providerOrderIds: string[],
): Promise<number> {
  if (providerOrderIds.length === 0) return 0;
  const loaded = await loadCredentials(db, env, runId);
  if (!loaded) throw new Error("Credentials are no longer available");
  const updates = await fetchDiagnosticEnrichment(
    env,
    runId,
    loaded.provider,
    loaded.credentials,
    providerOrderIds,
  );
  await saveDiagnosticOrderServices(db, runId, updates);
  const total = await countDiagnosticOrders(db, runId);
  const pending = await countPendingEnrichment(db, runId);
  const progress = total > 0 ? 15 + Math.round(((total - pending) / total) * 45) : 50;
  await updateRun(db, runId, { progress: Math.min(60, progress), stage: "collecting" });
  return updates.length;
}

/** Analyze, synthesize, mark ready, and email the report. */
export async function finalizeDiagnosticRun(env: Env, db: Db, runId: string): Promise<void> {
  const run = await getRunById(db, runId);
  if (!run) return;
  if (run.status === "ready" || run.status === "ready_email_failed") return;

  try {
    const provider = runProvider(run);
    if (!provider) throw new Error("Diagnostic provider is missing");
    const order = await getOneTimeOrder(db, run.oneTimeOrderId);
    const window = run.windowFrom && run.windowTo
      ? { from: run.windowFrom, to: run.windowTo, monthsCovered: 12 }
      : diagnosticWindow();

    await updateRun(db, runId, { status: "analyzing", stage: "analyzing", progress: 60 });
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
      `Computed facts from ${rows.length} orders`,
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
    throw err;
  }
}

/**
 * Full pipeline for local/dev runs without a Workflow binding. The workflow
 * uses the prepare/enrich-batch/finalize functions directly so each step stays
 * under the per-invocation subrequest budget.
 */
export async function processDiagnosticRun(env: Env, db: Db, runId: string): Promise<void> {
  const run = await getRunById(db, runId);
  if (!run) return;
  if (run.status === "ready" || run.status === "ready_email_failed") return;

  try {
    const prepared = await prepareDiagnosticRun(env, db, runId);
    if (prepared.provider === "isn") {
      for (let i = 0; i < 1000; i += 1) {
        const ids = await claimDiagnosticOrdersForEnrichment(db, runId, 40);
        if (ids.length === 0) break;
        await enrichDiagnosticRunBatch(env, db, runId, ids);
      }
    }
    await finalizeDiagnosticRun(env, db, runId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await failRun(db, runId, "processing", message);
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
