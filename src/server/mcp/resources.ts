import type { McpServer } from '@modelcontextprotocol/server';
import type { Env } from '../lib/env';
import {
  coreInstructions,
  workInstructions,
  employeeBusinessOwner as businessOwner,
  employeeCfo as cfo,
  employeeOperations as operationsManager,
  employeeRevenue as revenueManager,
  employeeCustomer as customerManager,
  employeeMarketing as marketingAnalyst,
  employeeQuality as qualityRiskManager,
} from '../sidekick/knowledge';

/**
 * Operating knowledge as MCP resources (not tools): core instructions, work
 * instructions, and one resource per employee playbook. Clients read them on
 * demand; nothing here executes or infers — the client model does that.
 */

interface ResourceDef {
  name: string;
  uri: string;
  title: string;
  description: string;
  text: string;
  /** Hidden resources stay registered in code but unserved. Re-enable via
   * code (flip to true) or at runtime with MCP_ENABLE_RESOURCES (comma
   * names/URIs, or `*`). Only core instructions are enabled by default. */
  enabled: boolean;
}

const RESOURCES: ResourceDef[] = [
  {
    name: 'core-instructions',
    uri: 'sidekick://instructions/core',
    title: 'GrowthSnipe Core Instructions',
    description: 'Operating model: mission, rules, KPI framework, briefing formats, activation.',
    text: coreInstructions,
    enabled: true,
  },
  {
    name: 'work-instructions',
    uri: 'sidekick://instructions/work',
    title: 'GrowthSnipe Project/Work Instructions',
    description: 'Response shape and read/write discipline for owner work.',
    text: workInstructions,
    enabled: false,
  },
  { name: 'employee-owner', uri: 'sidekick://employees/owner', title: 'Business Owner / CEO Advisor', description: 'Owner priorities playbook.', text: businessOwner, enabled: false },
  { name: 'employee-cfo', uri: 'sidekick://employees/cfo', title: 'CFO / Performance Analyst', description: 'Revenue and performance playbook.', text: cfo, enabled: false },
  { name: 'employee-operations', uri: 'sidekick://employees/operations', title: 'Operations Manager', description: 'Scheduling and capacity playbook.', text: operationsManager, enabled: false },
  { name: 'employee-revenue', uri: 'sidekick://employees/revenue', title: 'Revenue Manager', description: 'Pipeline and pricing playbook.', text: revenueManager, enabled: false },
  { name: 'employee-customer', uri: 'sidekick://employees/customer', title: 'Customer Intelligence Manager', description: 'Customer attention and referral playbook.', text: customerManager, enabled: false },
  { name: 'employee-marketing', uri: 'sidekick://employees/marketing', title: 'Marketing / Channel Analyst', description: 'Channel and referral-source playbook.', text: marketingAnalyst, enabled: false },
  { name: 'employee-quality', uri: 'sidekick://employees/quality', title: 'Quality / Risk Manager', description: 'Defects and risk playbook.', text: qualityRiskManager, enabled: false },
];

export const RESOURCE_URIS = RESOURCES.filter((r) => r.enabled).map((r) => r.uri);
export const ALL_RESOURCE_URIS = RESOURCES.map((r) => r.uri);

/** Runtime re-enable list: `MCP_ENABLE_RESOURCES` (comma names/URIs, or `*`). */
export function enabledResources(env?: Env): ResourceDef[] {
  const raw = (env as Record<string, string | undefined> | undefined)?.MCP_ENABLE_RESOURCES;
  if (!raw) return RESOURCES.filter((r) => r.enabled);
  const want = raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (want.includes('*')) return RESOURCES;
  return RESOURCES.filter((r) => r.enabled || want.includes(r.name.toLowerCase()) || want.includes(r.uri.toLowerCase()));
}

export function registerResources(server: McpServer, env?: Env, profileText?: string | null): void {
  for (const r of enabledResources(env)) {
    // The core instructions carry the org's business profile so the operating
    // model is personalized per workspace. Server is built per request, so
    // this closure is request-scoped (no cross-org leakage via shared state).
    const text = r.name === 'core-instructions' && profileText ? `${r.text}\n\n${profileText}` : r.text;
    server.registerResource(
      r.name,
      r.uri,
      { title: r.title, description: r.description, mimeType: 'text/markdown' },
      async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text }] }),
    );
  }
}
