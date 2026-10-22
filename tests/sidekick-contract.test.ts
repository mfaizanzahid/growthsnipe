import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { IsnAdapter } from '../src/server/providers/isn/adapter';
import { SpectoraAdapter } from '../src/server/providers/spectora/adapter';
import { SpectoraApiError, SpectoraClient, resolveBaseUrl } from '../src/server/providers/spectora/client';
import {
  deriveAgent,
  deriveContact,
  deriveEvent,
  deriveOrder,
  fromJsonApi,
  mapClient,
  mapOrder,
} from '../src/server/providers/spectora/mapper';
import {
  agentParams,
  contactParams,
  eventParams,
  getParams,
  orderParams,
  nextCursor,
  pageNumber,
  pageSize,
} from '../src/server/providers/spectora/params';
describe('canonical MCP contracts',()=>{it('bounds search limits',()=>{const schema=z.object({limit:z.number().int().min(1).max(100).default(25)});expect(schema.parse({}).limit).toBe(25);expect(()=>schema.parse({limit:101})).toThrow();});});

describe('ISN adapter capabilities (reads + probed order writes)', () => {
  const creds = { companyKey: 'testco', host: 'test.isn', accessKey: 'ak', secretKey: 'sk' };
  it('advertises reads plus the ten live-probed writes', async () => {
    const caps = await new IsnAdapter({}, { provider: 'isn', credentials: creds }).capabilities();
    expect(caps.provider).toBe('isn');
    expect(caps.read).toEqual(['clients', 'orders', 'agents', 'events']);
    expect(caps.write).toEqual([
      'create_order', 'update_order', 'reschedule_order', 'delete_order',
      'create_client', 'update_client', 'delete_client',
      'create_agent', 'update_agent', 'delete_agent',
    ]);
  });
  it('rejects legacy apiKey-shaped credentials with a clear error', () => {
    expect(() => new IsnAdapter({}, { provider: 'isn', credentials: { apiKey: 'k' } })).toThrow(
      /ISN-shaped credentials/,
    );
  });
  it('requires companyKey/host/accessKey/secretKey presence', () => {
    expect(() => new IsnAdapter({}, { provider: 'isn', credentials: {} })).toThrow(/companyKey/);
    expect(
      () => new IsnAdapter({}, { provider: 'isn', credentials: { companyKey: 'c', accessKey: 'a', secretKey: 's' } }),
    ).toThrow(/needs a host/);
  });
});

describe('Spectora REST query mapping (verified 2026-09-10, REST docs 2026-09-14)', () => {
  it('builds flat list queries with page[number]/page[size]', () => {
    expect(orderParams({ limit: 25 })).toEqual({
      'page[number]': 1, 'page[size]': 25,
    });
    // No top-level limit key.
    expect('limit' in (orderParams({ limit: 25 }) as Record<string, unknown>)).toBe(false);
  });
  it('caps page size at 200 and defaults the page', () => {
    expect(pageSize(500)).toBe(200);
    expect(pageNumber(undefined)).toBe(1);
    expect(pageNumber('3')).toBe(3);
    expect(pageNumber('bogus')).toBe(1);
  });
  it('maps query/from/to onto Spectora filters', () => {
    expect(orderParams({ limit: 10, query: 'Austin', from: '2026-01-01T00:00:00Z', to: '2026-01-31T23:59:59Z' })).toEqual({
      'page[number]': 1,
      'page[size]': 10,
      'filter[fulltext]': 'Austin',
      'filter[datetime_greater_than]': '2026-01-01T00:00:00Z',
      'filter[datetime_less_than]': '2026-01-31T23:59:59Z',
    });
    expect(contactParams({ limit: 10, query: 'Doe' })['filter[fulltext]']).toBe('Doe');
    expect(agentParams({ limit: 10, query: 'Jane' })['filter[fulltext]']).toBe('Jane');
  });
  it('maps only the verified canceled status', () => {
    expect(orderParams({ limit: 10, status: 'cancelled' })['filter[canceled]']).toBe(true);
    expect('filter[canceled]' in orderParams({ limit: 10, status: 'completed' })).toBe(false);
  });
  it('maps event ranges and verified event types only', () => {
    const qp = eventParams({ from: '2026-01-01', to: '2026-01-31', type: 'radon_drop', limit: 10 });
    expect(qp['filter[start_datetime_between]']).toEqual(['2026-01-01', '2026-01-31']);
    expect(qp['filter[event_type]']).toBe('radon_drop');
    expect('filter[event_type]' in eventParams({ type: 'party', limit: 10 })).toBe(false);
  });
  it('normalizes full ISO datetimes to date-only for events (upstream rejects timestamps)', () => {
    const qp = eventParams({ from: '2026-08-14T10:00:00.000Z', to: '2026-09-13T15:49:00.000Z', limit: 100 });
    expect(qp['filter[start_datetime_between]']).toEqual(['2026-08-14', '2026-09-13']);
  });
  it('derives next-page cursors from pagination meta', () => {
    expect(nextCursor({ pagination: { current: 1, next: 2, last: 5 } })).toBe('2');
    expect(nextCursor({ pagination: { current: 5, next: 5, last: 5 } })).toBeUndefined();
    expect(nextCursor({})).toBeUndefined();
  });
  it('validates single-record ids for REST paths', () => {
    expect(getParams('12345')).toEqual({ id: '12345' });
    expect(() => getParams('   ')).toThrow(/id is required/);
  });
});

describe('Spectora JSON:API normalization', () => {
  const inspection = {
    id: '12345',
    type: 'inspection',
    attributes: {
      slug: 'abc', datetime: '2024-03-15T14:30:00Z', quote: '450.0', buyer_name: 'John Doe',
      full_address: '123 Main Street, Austin, TX 78701', service_names: 'Home Inspection',
      canceled_at: null, is_client_complete: true,
    },
    relationships: { buyer: { data: { id: '999', type: 'buyer' } } },
  };
  it('flattens attributes, hoists ids, derives order fields', () => {
    const flat = deriveOrder(fromJsonApi(inspection));
    expect(flat.id).toBe('12345');
    expect(flat.buyerName).toBe('John Doe');
    expect(flat.clientId).toBe('999');
    expect(flat.status).toBe('completed');
    expect(flat.total).toBe(45000);
    expect(flat.currency).toBe('USD');
    expect(flat.scheduledAt).toBe('2024-03-15T14:30:00Z');
    expect(flat.address).toBe('123 Main Street, Austin, TX 78701');
    const record = mapOrder(flat);
    expect(record.id).toBe('12345');
    expect(record.total).toBe(45000);
  });
  it('keeps first-class people/money fields plus a full details bag', () => {
    const flat = deriveOrder(
      fromJsonApi({
        id: '1',
        attributes: {
          datetime: '2024-03-15T14:30:00Z',
          quote: '450.0',
          buyer_names: 'John Doe & Jane Doe',
          inspector_name: 'Mike Patterson',
          buying_agent_name: 'Jane Smith',
          selling_agent_name: 'Bob Johnson',
          paid: true,
          confirmed: true,
          referral_source: 'Internet Search',
          created_at: '2024-03-01T09:00:00Z',
          custom_note: 'keep me',
        },
      }),
    );
    const record = mapOrder(flat);
    expect(record.buyerName).toBe('John Doe & Jane Doe');
    expect(record.inspectorName).toBe('Mike Patterson');
    expect(record.buyingAgentName).toBe('Jane Smith');
    expect(record.sellingAgentName).toBe('Bob Johnson');
    expect(record.paid).toBe(true);
    expect(record.confirmed).toBe(true);
    expect(record.referralSource).toBe('Internet Search');
    expect(record.createdAt).toBe('2024-03-01T09:00:00Z');
    expect(record.details).toMatchObject({ customNote: 'keep me', quote: '450.0' });
  });
  it('marks canceled inspections cancelled', () => {
    const flat = deriveOrder(fromJsonApi({ id: '1', attributes: { canceled_at: '2024-01-01T00:00:00Z' } }));
    expect(flat.status).toBe('cancelled');
  });
  it('reduces tag objects to names and falls back phones', () => {
    const flat = deriveContact(
      fromJsonApi({ id: '7', attributes: { first_name: 'John', mobile_phone: '555', tags: [{ name: 'buyer' }] } }),
    );
    expect(mapClient(flat).name).toBe('John');
    expect(flat.phone).toBe('555');
    expect(flat.tags).toEqual(['buyer']);
  });
  it('names agents and maps events', () => {
    const agent = deriveAgent(fromJsonApi({ id: '3', attributes: { first_name: 'Jane', last_name: 'Smith' } }));
    expect(agent.name).toBe('Jane Smith');
    const event = deriveEvent(fromJsonApi({ id: '9', attributes: { event_type: 'radon_drop', start_datetime: '2026-01-15T14:00:00Z', inspection_id: 1001 } }));
    expect(event.type).toBe('radon_drop');
    expect(event.occurredAt).toBe('2026-01-15T14:00:00Z');
    expect(event.entityId).toBe('1001');
  });
});

describe('Spectora REST transport', () => {
  it('defaults to the public REST base and compat-strips a stored /mcp suffix', () => {
    expect(resolveBaseUrl({})).toBe('https://connect.spectora.com');
    expect(resolveBaseUrl({ mcpEndpoint: 'https://connect.spectora.com/mcp' })).toBe('https://connect.spectora.com');
    expect(resolveBaseUrl({ restEndpoint: 'https://example.com/api/' })).toBe('https://example.com/api');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws SpectoraApiError on HTTP failures without leaking the key', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, text: async () => 'bad' }) as unknown as Response));
    await expect(new SpectoraClient({ apiKey: 'secret-key' }).get('/v2/contacts')).rejects.toThrow(SpectoraApiError);
    await expect(new SpectoraClient({ apiKey: 'secret-key' }).get('/v2/contacts')).rejects.toThrow(/rejected the credentials.*401/);
    try {
      await new SpectoraClient({ apiKey: 'secret-key' }).get('/v2/contacts');
      expect.unreachable();
    } catch (err) {
      expect((err as Error).message).not.toContain('secret-key');
    }
  });
  it('serializes arrays as repeated key[] params (events date range)', async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        seen.push(String(url));
        return { ok: true, status: 200, json: async () => ({ data: [], meta: {} }) } as unknown as Response;
      }),
    );
    await new SpectoraClient({ apiKey: 'k' }).get('/v2/events', {
      'page[number]': 1,
      'filter[start_datetime_between]': ['2026-01-01', '2026-01-31'],
    });
    const url = seen[0]!;
    expect(url).toContain('filter%5Bstart_datetime_between%5D%5B%5D=2026-01-01');
    expect(url).toContain('filter%5Bstart_datetime_between%5D%5B%5D=2026-01-31');
  });
});
describe('Spectora adapter (offline checks, no live credentials)', () => {
  it('advertises read-only capabilities without network', async () => {
    const adapter = new SpectoraAdapter({}, { provider: 'spectora', credentials: { apiKey: 'test' } });
    const caps = await adapter.capabilities();
    expect(caps.provider).toBe('spectora');
    expect(caps.read.length).toBeGreaterThan(0);
    expect(caps.write).toEqual([]);
  });
  it('refuses to call upstream without credentials', () => {
    expect(() => new SpectoraClient({})).toThrow(/missing api key/i);
  });
  it('hits REST resource paths with Bearer auth (stubbed fetch)', async () => {
    const seen: Array<{ url: string; auth: unknown }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
        seen.push({ url: String(url), auth: init?.headers?.authorization });
        const u = String(url);
        if (u.includes('/v2/inspections/')) {
          return { ok: true, status: 200, json: async () => ({ data: { id: '1', type: 'inspection', attributes: {} } }) };
        }
        return { ok: true, status: 200, json: async () => ({ data: [], meta: { pagination: { current: 1 } } }) };
      }),
    );
    const adapter = new SpectoraAdapter({}, { provider: 'spectora', credentials: { apiKey: 'k' } });
    await adapter.searchOrders({ limit: 10 });
    expect(seen[0]!.url).toContain('https://connect.spectora.com/v2/inspections?');
    expect(seen[0]!.auth).toBe('Bearer k');
    await adapter.getOrder('abc');
    expect(seen[1]!.url).toBe('https://connect.spectora.com/v2/inspections/abc');
  });
  it('exposes no write methods on Spectora; ISN exposes only probed order writes', () => {
    const adapter = new SpectoraAdapter({}, { provider: 'spectora', credentials: { apiKey: 'test' } });
    for (const m of ['createOrder', 'updateOrder', 'cancelOrder', 'deleteOrder', 'rescheduleOrder', 'createClient', 'updateClient', 'deleteClient', 'createAgent', 'updateAgent', 'deleteAgent', 'sendMessage'] as const) {
      expect(adapter[m]).toBeUndefined();
    }
    const isn = new IsnAdapter({}, { provider: 'isn', credentials: { companyKey: 'c', host: 'test.isn', accessKey: 'a', secretKey: 's' } });
    for (const m of ['createOrder', 'updateOrder', 'rescheduleOrder', 'deleteOrder', 'createClient', 'updateClient', 'deleteClient', 'createAgent', 'updateAgent', 'deleteAgent'] as const) {
      expect(typeof isn[m]).toBe('function');
    }
    for (const m of ['cancelOrder', 'sendMessage'] as const) {
      expect(isn[m]).toBeUndefined();
    }
  });
});
