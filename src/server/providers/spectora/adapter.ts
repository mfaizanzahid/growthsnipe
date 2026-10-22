import type { BusinessProviderAdapter, Page, ClientRecord, OrderRecord, AgentRecord, EventRecord, ProviderCapabilities, SearchClientsInput, SearchOrdersInput } from '../types';
import { SpectoraClient } from './client';
import { mapAgent, mapClient, mapEvent, mapOrder, fromJsonApi, deriveAgent, deriveContact, deriveEvent, deriveOrder, type JsonApiResource } from './mapper';
import { agentParams, contactParams, eventParams, getParams, nextCursor, orderParams } from './params';

type Connection = { provider: 'spectora'; credentials: Record<string, string>; metadata?: Record<string, unknown> };

function listPayload(raw: unknown): { data: JsonApiResource[]; meta: unknown } {
  const payload = (raw ?? {}) as { data?: unknown; meta?: unknown };
  return { data: Array.isArray(payload.data) ? (payload.data as JsonApiResource[]) : [], meta: payload.meta };
}

function singlePayload(raw: unknown): JsonApiResource | null {
  const payload = (raw ?? {}) as { data?: unknown };
  if (!payload.data || typeof payload.data !== 'object' || Array.isArray(payload.data)) return null;
  return payload.data as JsonApiResource;
}

export class SpectoraAdapter implements BusinessProviderAdapter {
  key = 'spectora' as const;
  private readonly client: SpectoraClient;
  constructor(_env: unknown, connection: Connection) { this.client = new SpectoraClient(connection.credentials); }
  async capabilities(): Promise<ProviderCapabilities> { return { provider: 'spectora', read: ['clients','orders','agents','events'], write: [], lastCheckedAt: new Date().toISOString() }; }
  private async list<T>(path: string, query: Record<string, unknown>, map: (item: JsonApiResource) => T): Promise<Page<T>> {
    const { data, meta } = listPayload(await this.client.get(path, query));
    const pagination = (meta ?? {}) as { pagination?: { records?: unknown } };
    const records = (pagination as { pagination?: { records?: number } }).pagination?.records;
    const page: Page<T> = { items: data.map(map) };
    const cursor = nextCursor(meta);
    if (cursor !== undefined) page.nextCursor = cursor;
    if (typeof records === 'number') page.totalEstimate = records;
    return page;
  }
  async searchClients(input: SearchClientsInput): Promise<Page<ClientRecord>> {
    return this.list('/v2/contacts', contactParams(input), (r) => mapClient(deriveContact(fromJsonApi(r))));
  }
  async getClient(id:string){
    const item = singlePayload(await this.client.get(`/v2/contacts/${encodeURIComponent(getParams(id).id)}`));
    return item ? mapClient(deriveContact(fromJsonApi(item))) : null;
  }
  async searchOrders(input:SearchOrdersInput):Promise<Page<OrderRecord>>{
    return this.list('/v2/inspections', orderParams(input), (r) => mapOrder(deriveOrder(fromJsonApi(r))));
  }
  async getOrder(id:string){
    const item = singlePayload(await this.client.get(`/v2/inspections/${encodeURIComponent(getParams(id).id)}`));
    return item ? mapOrder(deriveOrder(fromJsonApi(item))) : null;
  }
  async searchAgents(input:{query?:string;limit:number;cursor?:string}):Promise<Page<AgentRecord>>{
    return this.list('/v2/connections', agentParams(input), (r) => mapAgent(deriveAgent(fromJsonApi(r))));
  }
  async getAgent(id:string){
    const item = singlePayload(await this.client.get(`/v2/connections/${encodeURIComponent(getParams(id).id)}`));
    return item ? mapAgent(deriveAgent(fromJsonApi(item))) : null;
  }
  async searchEvents(input:{from?:string;to?:string;type?:string;limit:number;cursor?:string}):Promise<Page<EventRecord>>{
    return this.list('/v2/events', eventParams(input), (r) => mapEvent(deriveEvent(fromJsonApi(r))));
  }
}
