/**
 * ISN provider adapter (reads + probed order writes).
 *
 * REST client: `https://{host}/{companyKey}/rest` with HTTP Basic
 * (access key / secret key). Read mapping: `/orders` + `/order/{id}` ->
 * orders, `/clients/search` + `/client/{id}` -> clients,
 * `/agents/search` + `/agent/{id}` -> agents, `/calendarevents` -> events.
 *
 * Order reads have two shapes (live-probed 2026-10-18):
 * - windowed (`from` + `to` set) -> `https://{host}/{companyKey}/json/orders`
 *   with required `start`/`end` ISO instants. Returns a bare array of
 *   full-detail orders (money + display names); every other param is ignored.
 * - un-windowed -> `/rest/orders` (listing shape, no window requirement).
 *
 * Write capabilities (each live-probed 2026-09-13/14 against throwaway test
 * records that were deleted afterwards — never against real data):
 * - create_order: POST /order (JSON) -> {id, oid}, then GET read-back.
 * - update_order: POST /order/{id} (JSON partial) -> GET read-back.
 * - reschedule_order: POST /order/{id} {datetime} -> GET read-back.
 * - delete_order: DELETE /order (form {uuid}) -> soft-delete
 *   (deleteddatetime set, show=no).
 * - create_client / update_client / delete_client: POST /client,
 *   POST /client/{id}, DELETE /client/{id} (no body) -> soft-delete
 *   (show=no). Server normalizes phones; display may come back null.
 * - create_agent / update_agent / delete_agent: POST /agent,
 *   POST /agent/{id}, DELETE /agent/{id} -> soft-delete (show=no).
 *   (Spec claims OWNER privilege; the probed manager-level key succeeded —
 *   recorded, not relied upon.)
 * Destructive calls stay gated by MCP policy (EXECUTE + explicit allow) +
 * audit. NOT implemented: cancel_order (undocumented date validation
 * rejected everything — fail closed); order fees (POST /order/fees
 * `orderfees` format opaque, five variants rejected — money writes get
 * extra caution); note appends (no add-note endpoint exists; order `notes`
 * field maps via update_order); files/catalog.
 *
 * Pagination: ISN list endpoints take no page params — one read returns the
 * whole matching collection, so `nextCursor` is always undefined. `totalEstimate`
 * is the pre-slice mapped length (capped by the vendor `count` where present),
 * so any shortfall from the memory backstop stays visible as a truncation
 * instead of hiding behind a smaller "total".
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
import { IsnApiError, IsnClient } from './client';
import { isnSafetyLimit } from '../../lib/retrieval-limits';
import { agentParams, clientParams, eventParams, getParams, orderParams, toIsnInstant } from './params';
import {
  fromIsnAgent,
  fromIsnClient,
  fromIsnEvent,
  fromIsnOrder,
  mapAgent,
  mapClient,
  mapEvent,
  mapOrder,
} from './mapper';

type Connection = {
  provider: 'isn';
  credentials: Record<string, string>;
  metadata?: Record<string, unknown>;
};

const ISN_READ = ['clients', 'orders', 'agents', 'events'];

/**
 * ISN list endpoints take no limit/page/size params (see the read catalog in
 * docs/isn-contract.md), so every read returns the whole matching collection
 * over the wire and the only thing we can do is decide how much to retain. The
 * memory backstop below is that decision; it is deliberately far above any real
 * window (see lib/retrieval-limits.ts) so it does not bind in practice, and the
 * vendor `count`/mapped length is surfaced as `totalEstimate` so a bound that
 * DOES bind shows up as truncation instead of a silently smaller total.
 */
function listItems(raw: unknown, key: string): unknown[] {
  const payload = (raw ?? {}) as Record<string, unknown>;
  const items = payload[key];
  return Array.isArray(items) ? items : [];
}

function returnedCount(raw: unknown, fallback: number): number {
  const count = (raw ?? {}) as { count?: unknown };
  const vendorCount =
    typeof count.count === 'number' && Number.isFinite(count.count) ? count.count : fallback;
  // `count` is "records returned", which includes rows the mapper intentionally
  // drops (soft-deleted orders). Clamping keeps those deliberate exclusions out
  // of the truncation signal while a real vendor shortfall still shows up.
  return Math.min(vendorCount, fallback);
}

/** Map raw ISN order rows to canonical orders. Deleted (`show:"no"`) and
 * id-less rows drop out here; callers size `totalEstimate` to this pre-slice
 * result so an intentional drop is not mistaken for memory-bound truncation. */
function mapOrderRows(rows: unknown[]): OrderRecord[] {
  return rows
    .map((row) => fromIsnOrder(row))
    .filter((o): o is Record<string, unknown> => o !== null)
    .map(mapOrder);
}

export class IsnAdapter implements BusinessProviderAdapter {
  key = 'isn' as const;
  private readonly client: IsnClient;
  private readonly safetyLimit: number;

  constructor(_env: unknown, connection: Connection) {
    const { companyKey, host, accessKey, secretKey, apiKey, oauthAccessToken } = connection.credentials;
    if ((apiKey ?? oauthAccessToken) && !(companyKey ?? accessKey ?? secretKey)) {
      throw new Error(
        'ISN needs ISN-shaped credentials (companyKey + accessKey + secretKey), not a Spectora-style apiKey. ' +
          'Reconnect with your ISN company key and access keys.',
      );
    }
    // Memory backstop only — ISN returns whole collections, so this is the one
    // bound on what a read retains (see lib/retrieval-limits.ts).
    this.safetyLimit = isnSafetyLimit(_env as { ISN_SAFETY_LIMIT?: string } | undefined);
    // IsnClient validates presence of companyKey/accessKey/secretKey.
    this.client = new IsnClient({ companyKey, host, accessKey, secretKey });
  }

  async capabilities(): Promise<ProviderCapabilities> {
    return {
      provider: 'isn',
      read: [...ISN_READ],
      write: [
        'create_order',
        'update_order',
        'reschedule_order',
        'delete_order',
        'create_client',
        'update_client',
        'delete_client',
        'create_agent',
        'update_agent',
        'delete_agent',
      ],
      lastCheckedAt: new Date().toISOString(),
    };
  }

  async searchOrders(input: SearchOrdersInput): Promise<Page<OrderRecord>> {
    // Windowed reads use `/json/orders`, the only order endpoint that returns
    // money (`total_fee`) and inspector/agent/client display names. It ignores
    // `limit`/`completed`/`canceled`, so this returns the WHOLE window; the only
    // thing that can shorten it is the memory backstop, and `totalEstimate` is
    // the pre-slice mapped length so that shortfall stays visible as truncation.
    if (input.from !== undefined && input.to !== undefined) {
      const rows = await this.client.getOrdersWindow(toIsnInstant(input.from), toIsnInstant(input.to));
      const mapped = mapOrderRows(rows);
      return { items: mapped.slice(0, this.safetyLimit), totalEstimate: mapped.length };
    }
    // Un-windowed reads (public MCP `search_orders` with no from/to) keep the
    // legacy `/rest` listing: it is the only shape that supports a date-bounded
    // free-text listing without a start/end pair.
    const raw = await this.client.get('/orders', orderParams(input));
    const mapped = mapOrderRows(listItems(raw, 'orders'));
    return { items: mapped.slice(0, this.safetyLimit), totalEstimate: returnedCount(raw, mapped.length) };
  }

  async getOrder(id: string): Promise<OrderRecord | null> {
    const raw = await this.client.get(`/order/${encodeURIComponent(getParams(id).id)}`);
    const order = (raw as { order?: unknown }).order;
    if (!order || typeof order !== 'object') return null;
    const flat = fromIsnOrder(order);
    return flat ? mapOrder(flat) : null;
  }

  async searchClients(input: SearchClientsInput): Promise<Page<ClientRecord>> {
    const raw = await this.client.get('/clients/search', clientParams(input));
    const mapped = listItems(raw, 'clients')
      .map(fromIsnClient)
      .filter((c): c is Record<string, unknown> => c !== null)
      .map(mapClient);
    return { items: mapped.slice(0, this.safetyLimit), totalEstimate: returnedCount(raw, mapped.length) };
  }

  async getClient(id: string): Promise<ClientRecord | null> {
    const raw = await this.client.get(`/client/${encodeURIComponent(getParams(id).id)}`);
    const client = (raw as { client?: unknown }).client;
    if (!client || typeof client !== 'object') return null;
    const flat = fromIsnClient(client);
    return flat ? mapClient(flat) : null;
  }

  async searchAgents(input: { query?: string; limit: number; cursor?: string }): Promise<Page<AgentRecord>> {
    const raw = await this.client.get('/agents/search', agentParams(input));
    const mapped = listItems(raw, 'agents')
      .map(fromIsnAgent)
      .filter((a): a is Record<string, unknown> => a !== null)
      .map(mapAgent);
    return { items: mapped.slice(0, this.safetyLimit), totalEstimate: returnedCount(raw, mapped.length) };
  }

  async getAgent(id: string): Promise<AgentRecord | null> {
    const raw = await this.client.get(`/agent/${encodeURIComponent(getParams(id).id)}`);
    // Verified in yaml (getAgentId 200): {agent, message, status}.
    const agent = (raw as { agent?: unknown }).agent;
    if (!agent || typeof agent !== 'object') return null;
    const flat = fromIsnAgent(agent);
    return flat ? mapAgent(flat) : null;
  }

  async searchEvents(input: { from?: string; to?: string; type?: string; limit: number; cursor?: string }): Promise<Page<EventRecord>> {
    const raw = await this.client.get('/calendarevents', eventParams(input));
    const rawEvents = listItems(raw, 'events');
    const mapped = rawEvents
      .map(fromIsnEvent)
      .filter((e): e is Record<string, unknown> => e !== null)
      .map(mapEvent);
    // /calendarevents has no `count` in the spec: totalEstimate = raw records
    // returned (pre-slice, pre-drop), so dropped id-less items and any
    // memory-bound shortfall both stay visible as a gap.
    return { items: mapped.slice(0, this.safetyLimit), totalEstimate: rawEvents.length };
  }

  /**
   * Canonical order input -> ISN write body. Only verified fields map:
   * address -> address1, scheduledAt -> datetime (both live-probed),
   * notes -> notes (spec-verified update field, yaml:10643). serviceType is
   * a reference UUID server-side (never a name) — dropped, never guessed.
   */
  private orderWriteBody(input: Record<string, unknown>): Record<string, unknown> {
    const body: Record<string, unknown> = {};
    if (typeof input.address === 'string' && input.address.trim() !== '') body.address1 = input.address.trim();
    if (typeof input.scheduledAt === 'string' && input.scheduledAt.trim() !== '') body.datetime = input.scheduledAt.trim();
    if (typeof input.notes === 'string' && input.notes.trim() !== '') body.notes = input.notes.trim();
    return body;
  }

  private async readBackOrder(id: string): Promise<OrderRecord> {
    const record = await this.getOrder(id);
    if (!record) throw new IsnApiError(`ISN order ${id} was written but could not be read back`);
    return record;
  }

  async createOrder(input: Record<string, unknown>): Promise<OrderRecord> {
    const raw = await this.client.request('POST', '/order', { json: this.orderWriteBody(input) });
    const id = (raw as { id?: unknown }).id;
    if (typeof id !== 'string' || id === '') throw new IsnApiError('ISN order create returned no id');
    return this.readBackOrder(id);
  }

  async updateOrder(id: string, input: Record<string, unknown>): Promise<OrderRecord> {
    const clean = getParams(id).id;
    await this.client.request('POST', `/order/${encodeURIComponent(clean)}`, { json: this.orderWriteBody(input) });
    return this.readBackOrder(clean);
  }

  async rescheduleOrder(id: string, scheduledAt: string): Promise<OrderRecord> {
    const clean = getParams(id).id;
    const when = scheduledAt.trim();
    if (!when) throw new IsnApiError('ISN reschedule needs a scheduledAt datetime');
    await this.client.request('POST', `/order/${encodeURIComponent(clean)}`, { json: { datetime: when } });
    return this.readBackOrder(clean);
  }

  async deleteOrder(id: string): Promise<{ id: string; deleted: boolean }> {
    const clean = getParams(id).id;
    // Live-probed: DELETE /order takes form {uuid} and soft-deletes
    // (deleteddatetime set, show=no). Destructive — MCP EXECUTE policy +
    // audit gate every call; there is no undelete probe.
    await this.client.request('DELETE', '/order', { form: { uuid: clean } });
    return { id: clean, deleted: true };
  }

  /**
   * Canonical person input -> ISN client/agent body. Phones map to
   * mobilephone (probed writable); address/city/state map 1:1. A single
   * `name` splits on the last space into first/last AND ships as `display`
   * verbatim so nothing is lost to the split (documented assumption).
   */
  private personWriteBody(input: Record<string, unknown>): Record<string, unknown> {
    const body: Record<string, unknown> = {};
    const set = (key: string, value: unknown) => {
      if (typeof value === 'string' && value.trim() !== '') body[key] = value.trim();
    };
    set('email', input.email);
    set('mobilephone', input.phone);
    set('address1', input.address);
    set('city', input.city);
    set('state', input.state);
    if (typeof input.firstName === 'string' && typeof input.lastName === 'string') {
      set('first', input.firstName);
      set('last', input.lastName);
    } else if (typeof input.name === 'string' && input.name.trim() !== '') {
      const name = input.name.trim();
      set('display', name);
      const cut = name.lastIndexOf(' ');
      if (cut > 0) {
        set('first', name.slice(0, cut));
        set('last', name.slice(cut + 1));
      } else {
        set('first', name);
      }
    }
    return body;
  }

  async createClient(input: Record<string, unknown>): Promise<ClientRecord> {
    const raw = await this.client.request('POST', '/client', { json: this.personWriteBody(input) });
    const id = (raw as { id?: unknown }).id;
    if (typeof id !== 'string' || id === '') throw new IsnApiError('ISN client create returned no id');
    const record = await this.getClient(id);
    if (!record) throw new IsnApiError(`ISN client ${id} was created but could not be read back`);
    return record;
  }

  async updateClient(id: string, input: Record<string, unknown>): Promise<ClientRecord> {
    const clean = getParams(id).id;
    await this.client.request('POST', `/client/${encodeURIComponent(clean)}`, { json: this.personWriteBody(input) });
    const record = await this.getClient(clean);
    if (!record) throw new IsnApiError(`ISN client ${clean} was updated but could not be read back`);
    return record;
  }

  async deleteClient(id: string): Promise<{ id: string; deleted: boolean }> {
    const clean = getParams(id).id;
    // Live-probed: DELETE /client/{id} takes no body and soft-deletes
    // (show=no). Destructive — EXECUTE policy + audit gate every call.
    await this.client.request('DELETE', `/client/${encodeURIComponent(clean)}`);
    return { id: clean, deleted: true };
  }

  async createAgent(input: Record<string, unknown>): Promise<AgentRecord> {
    const raw = await this.client.request('POST', '/agent', { json: this.personWriteBody(input) });
    const id = (raw as { id?: unknown }).id;
    if (typeof id !== 'string' || id === '') throw new IsnApiError('ISN agent create returned no id');
    const record = await this.getAgent(id);
    if (!record) throw new IsnApiError(`ISN agent ${id} was created but could not be read back`);
    return record;
  }

  async updateAgent(id: string, input: Record<string, unknown>): Promise<AgentRecord> {
    const clean = getParams(id).id;
    await this.client.request('POST', `/agent/${encodeURIComponent(clean)}`, { json: this.personWriteBody(input) });
    const record = await this.getAgent(clean);
    if (!record) throw new IsnApiError(`ISN agent ${clean} was updated but could not be read back`);
    return record;
  }

  async deleteAgent(id: string): Promise<{ id: string; deleted: boolean }> {
    const clean = getParams(id).id;
    // Live-probed: DELETE /agent/{id} takes no body and soft-deletes
    // (show=no). Destructive — EXECUTE policy + audit gate every call.
    await this.client.request('DELETE', `/agent/${encodeURIComponent(clean)}`);
    return { id: clean, deleted: true };
  }
}
