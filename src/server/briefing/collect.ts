import type { Env } from '../lib/env';
import { decryptJson } from '../lib/crypto';
import { loadConnection } from '../mcp/auth';
import { createProviderAdapter } from '../providers/registry';
import type { BusinessProviderAdapter, ProviderKey } from '../providers/types';
import { analyzeWindow, buildDataQuality, computeDeltas } from './analyze';
import { cadenceSpec } from './cadence';
import { strategyFor } from './providers/strategies';
import { briefingMaxPages } from '../lib/retrieval-limits';
import type { BriefingFacts } from './types';
import { briefingWindows, dayBuckets } from './windows';

/**
 * Build every fact a briefing reports.
 *
 * Retrieval is provider-specific and uses only verified endpoints. Metrics are
 * computed deterministically (never by the model), and anything a platform
 * cannot support lands in `dataQuality.omissions` instead of being guessed.
 */
export async function collectBriefingFacts(
  env: Env,
  organizationId: string,
  provider: ProviderKey,
  cadenceType: string,
  timezone: string,
  now: Date,
): Promise<BriefingFacts> {
  const spec = cadenceSpec(cadenceType);
  const adapter = await adapterFor(env, organizationId, provider);
  // Per-window page budget, sized from the platform's real limits rather than a
  // magic number (lib/retrieval-limits.ts). Overridable per deployment.
  const strategy = strategyFor(provider, briefingMaxPages(env));
  if (!strategy) {
    throw new Error(`No verified briefing data plan exists for ${provider}.`);
  }

  const windows = briefingWindows(cadenceType, timezone, now);
  const compare = spec.compare && strategy.supportsComparison;
  const current = await strategy.collect(adapter, windows.current);
  const previous = compare
    ? await strategy.collect(adapter, windows.previous!)
    : null;

  const currentMetrics = analyzeWindow(
    current,
    timezone,
    now,
    dayBuckets(windows.current, timezone),
  );
  const previousMetrics = previous
    ? analyzeWindow(previous, timezone, now, dayBuckets(windows.previous!, timezone))
    : null;

  return {
    cadence: spec.type,
    cadenceLabel: spec.label,
    provider,
    currency: current.orders.find((o) => o.currency)?.currency ?? 'USD',
    timezone,
    current: windows.current,
    previous: windows.previous,
    metrics: currentMetrics,
    deltas: computeDeltas(currentMetrics, previousMetrics),
    dataQuality: buildDataQuality(current, previous, currentMetrics, strategy.peopleNamesUsable),
  };
}

/** Connection-backed adapter for a workspace, decrypting stored credentials. */
export async function adapterFor(
  env: Env,
  organizationId: string,
  provider: ProviderKey,
): Promise<BusinessProviderAdapter> {
  const connection = await loadConnection(env, organizationId, provider);
  if (!connection) throw new Error(`No ${provider} connection configured.`);
  if (!env.MCP_ENCRYPTION_KEY) throw new Error('Server is missing MCP_ENCRYPTION_KEY.');
  return createProviderAdapter(env, {
    provider,
    credentials: await decryptJson<Record<string, string>>(
      env.MCP_ENCRYPTION_KEY,
      connection.encryptedCredentials,
    ),
  });
}