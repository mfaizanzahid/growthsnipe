/**
 * ServiceTitan adapter shell (coming soon, fail-closed).
 *
 * No live contract has been probed yet, so every data method throws and
 * capabilities advertise nothing. Per the provider rules, no fields, tools,
 * or params are invented here — the read model lands only after live
 * probing, at which point this stub is replaced method by method.
 */
import type {
  BusinessProviderAdapter,
  Page,
  ClientRecord,
  OrderRecord,
  AgentRecord,
  EventRecord,
  ProviderCapabilities,
  SearchClientsInput,
  SearchOrdersInput,
} from '../types';
import { ProviderCapabilityError } from '../types';

function comingSoon(): never {
  throw new ProviderCapabilityError(
    'ServiceTitan is coming soon — connections are not accepted yet. Follow the Connections page for availability.',
  );
}

export class ServicetitanAdapter implements BusinessProviderAdapter {
  key = 'servicetitan' as const;

  constructor(_env: unknown, _connection: { provider: 'servicetitan'; credentials: Record<string, string> }) {}

  async capabilities(): Promise<ProviderCapabilities> {
    return { provider: 'servicetitan', read: [], write: [] };
  }

  async searchClients(_input: SearchClientsInput): Promise<Page<ClientRecord>> {
    return comingSoon();
  }

  async getClient(_id: string): Promise<ClientRecord | null> {
    return comingSoon();
  }

  async searchOrders(_input: SearchOrdersInput): Promise<Page<OrderRecord>> {
    return comingSoon();
  }

  async getOrder(_id: string): Promise<OrderRecord | null> {
    return comingSoon();
  }

  async searchAgents(_input: { query?: string; limit: number; cursor?: string }): Promise<Page<AgentRecord>> {
    return comingSoon();
  }

  async getAgent(_id: string): Promise<AgentRecord | null> {
    return comingSoon();
  }

  async searchEvents(_input: { from?: string; to?: string; type?: string; limit: number; cursor?: string }): Promise<Page<EventRecord>> {
    return comingSoon();
  }
}
