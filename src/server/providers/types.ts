import { z } from 'zod';

export const ProviderKeySchema = z.enum(['spectora', 'isn', 'servicetitan', 'housecallpro', 'jobber']);
export type ProviderKey = z.infer<typeof ProviderKeySchema>;

/** Providers with live adapters. Everything else is coming soon (fail-closed stubs). */
export const LIVE_PROVIDERS: readonly ProviderKey[] = ['spectora', 'isn'];

export const COMING_SOON_PROVIDERS: readonly ProviderKey[] = ['servicetitan', 'housecallpro', 'jobber'];

export const PROVIDER_DISPLAY_NAMES: Record<ProviderKey, string> = {
  spectora: 'Spectora',
  isn: 'ISN',
  servicetitan: 'ServiceTitan',
  housecallpro: 'Housecall Pro',
  jobber: 'Jobber',
};

export function isComingSoonProvider(provider: string): boolean {
  return (COMING_SOON_PROVIDERS as readonly string[]).includes(provider);
}

export const ActionNameSchema = z.enum([
  'create_client',
  'update_client',
  'delete_client',
  'create_order',
  'update_order',
  'cancel_order',
  'delete_order',
  'reschedule_order',
  'create_agent',
  'update_agent',
  'delete_agent',
  'send_message',
]);
export type ActionName = z.infer<typeof ActionNameSchema>;

export type PermissionLevel = 'READ' | 'SUGGEST' | 'EXECUTE';

export interface Page<T> {
  items: T[];
  nextCursor?: string;
  totalEstimate?: number;
}

export interface ClientRecord {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  city?: string;
  state?: string;
  source?: string;
  createdAt?: string;
  updatedAt?: string;
  tags?: string[];
}

export interface OrderRecord {
  id: string;
  clientId?: string;
  status?: string;
  serviceType?: string;
  scheduledAt?: string;
  completedAt?: string;
  /**
   * Order total in **integer minor units** (cents). Vendor APIs report major
   * units; adapters convert at the boundary via `providers/money.ts` so this
   * value is safe to sum and to pass to `formatMoney`.
   */
  total?: number;
  /** ISO currency for `total`. Always set by adapters (ISN is USD-only). */
  currency?: string;
  assignedToId?: string;
  address?: string;
  notes?: string;
  /** People on the job (provider-dependent; Spectora: *_name attributes). */
  buyerName?: string;
  inspectorName?: string;
  buyingAgentName?: string;
  sellingAgentName?: string;
  /** Money / progress flags (provider-dependent). */
  paid?: boolean;
  confirmed?: boolean;
  referralSource?: string;
  createdAt?: string;
  updatedAt?: string;
  /**
   * Full normalized provider attributes for this order (everything the
   * vendor returned, key-normalized). First-class fields above cover the
   * common analytics needs; `details` carries the rest without contract
   * churn per provider.
   */
  details?: Record<string, unknown>;
}

export interface AgentRecord {
  id: string;
  name: string;
  email?: string;
  active?: boolean;
  stats?: Record<string, number | string | null>;
}

export interface EventRecord {
  id: string;
  type: string;
  occurredAt: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

export interface ProviderCapabilities {
  provider: ProviderKey;
  read: string[];
  write: ActionName[];
  lastCheckedAt?: string;
}

export interface SearchClientsInput {
  query?: string;
  status?: string;
  limit: number;
  cursor?: string;
}

export interface SearchOrdersInput {
  query?: string;
  status?: string;
  from?: string;
  to?: string;
  limit: number;
  cursor?: string;
}

export interface BusinessProviderAdapter {
  key: ProviderKey;
  capabilities(): Promise<ProviderCapabilities>;
  searchClients(input: SearchClientsInput): Promise<Page<ClientRecord>>;
  getClient(id: string): Promise<ClientRecord | null>;
  searchOrders(input: SearchOrdersInput): Promise<Page<OrderRecord>>;
  getOrder(id: string): Promise<OrderRecord | null>;
  searchAgents(input: { query?: string; limit: number; cursor?: string }): Promise<Page<AgentRecord>>;
  getAgent(id: string): Promise<AgentRecord | null>;
  searchEvents(input: { from?: string; to?: string; type?: string; limit: number; cursor?: string }): Promise<Page<EventRecord>>;
  createOrder?(input: Record<string, unknown>): Promise<OrderRecord>;
  updateOrder?(id: string, input: Record<string, unknown>): Promise<OrderRecord>;
  cancelOrder?(id: string, reason?: string): Promise<OrderRecord>;
  rescheduleOrder?(id: string, scheduledAt: string): Promise<OrderRecord>;
  deleteOrder?(id: string): Promise<{ id: string; deleted: boolean }>;
  createClient?(input: Record<string, unknown>): Promise<ClientRecord>;
  updateClient?(id: string, input: Record<string, unknown>): Promise<ClientRecord>;
  deleteClient?(id: string): Promise<{ id: string; deleted: boolean }>;
  createAgent?(input: Record<string, unknown>): Promise<AgentRecord>;
  updateAgent?(id: string, input: Record<string, unknown>): Promise<AgentRecord>;
  deleteAgent?(id: string): Promise<{ id: string; deleted: boolean }>;
  sendMessage?(input: Record<string, unknown>): Promise<{ id: string; status: string }>;
}

export class ProviderCapabilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderCapabilityError';
  }
}
