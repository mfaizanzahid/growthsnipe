/** Shared client types for the Sidekick dashboard sections (all server-driven). */

export interface SidekickConnection {
  id: string;
  organizationId: string;
  provider: string;
  status: string;
  capabilitiesJson: string | null;
  externalAccountId: string | null;
  updatedAt: string;
}

export interface McpToken {
  id: string;
  name: string;
  tokenPrefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

/** AI app connected via OAuth sign-in (client names only, never token material). */
export interface OAuthGrant {
  clientId: string;
  name: string;
  /** Earliest live token creation (ms epoch) — when the app was connected. */
  connectedAt: number | null;
  activeTokens: number;
}

export interface BriefingSchedule {
  id: string;
  organizationId: string;
  type: string;
  timezone: string;
  localTime: string;
  ruleJson: string;
  deliveryJson: string;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

export interface Briefing {
  id: string;
  scheduleId: string;
  periodKey: string;
  status: string;
  briefingText: string | null;
  errorText: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface SnapshotFacts {
  recentOrders: number;
  recentCompletedRevenue: number;
  openOrders: number;
  recentAgents: number;
  eventCount: number;
}

export interface ManagementSnapshot {
  generatedAt: string;
  provider: string;
  window?: { from: string; to: string };
  facts: SnapshotFacts;
  caveats: string[];
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const text = await res.text();
  let parsed = false;
  let data: (T & { error?: string }) | null = null;
  if (text) {
    try {
      data = JSON.parse(text) as T & { error?: string };
      parsed = true;
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    // JSON errors carry `error`; the gating middleware answers 402 with a plain
    // sentence (no JSON), so fall back to that raw text before a status line.
    const jsonError = typeof data?.error === "string" ? data.error : undefined;
    throw new Error(errorMessage(jsonError ?? (parsed ? undefined : text), res.status));
  }
  return data as T;
}

/** Prefer the server's own words; never leak an HTML error page into a toast. */
function errorMessage(body: string | undefined, status: number): string {
  const trimmed = body?.trim();
  if (trimmed && trimmed.length <= 300 && !trimmed.startsWith("<")) return trimmed;
  return `Request failed (${status})`;
}
