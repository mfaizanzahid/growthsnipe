/**
 * ISN read-path contract tests (offline; stubbed fetch).
 *
 * Covers params (verified query shapes), mapper (spec-indicative fixtures),
 * client (envelope gate + HTTP mapping + no secret leakage), adapter
 * (7 reads, capabilities, no writes), and the public MCP tool surface
 * (7 domain primitives, no provider-shaped names).
 *
 * Live integration (real /me + /orders bodies) is separate and pending
 * owner credentials — see docs/decision-log.md 2026-09-13 probe checklist.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IsnAdapter } from '../src/server/providers/isn/adapter';
import { IsnApiError, IsnClient, checkEnvelope } from '../src/server/providers/isn/client';
import { agentParams, clientParams, eventParams, getParams, orderParams } from '../src/server/providers/isn/params';
import {
  fromIsnAgent,
  fromIsnClient,
  fromIsnEvent,
  fromIsnOrder,
  mapAgent,
  mapClient,
  mapEvent,
  mapOrder,
} from '../src/server/providers/isn/mapper';
import { registerDataTools } from '../src/server/mcp/tools';

const CREDS = { companyKey: 'acme', host: 'test.isn', accessKey: 'ak-user', secretKey: 'sk-secret' };

function stubFetch(handler: (url: string) => unknown, ok = true, status = 200) {
  const seen: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      seen.push(String(url));
      return { ok, status, json: async () => handler(String(url)) } as unknown as Response;
    }),
  );
  return seen;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// --- params ---------------------------------------------------------------

describe('ISN query params (live-probed)', () => {
  it('maps order from/to onto datetimeafter/datetimebefore and drops query/cursor', () => {
    expect(orderParams({ limit: 25, from: '2026-08-01', to: '2026-08-31' })).toEqual({
      datetimeafter: '2026-08-01',
      datetimebefore: '2026-08-31',
    });
    const dropped = orderParams({ limit: 10, query: 'Austin', cursor: 'x' });
    expect(dropped).toEqual({});
    expect('limit' in dropped).toBe(false);
  });

  it("maps only status 'completed' onto completed=true (false is a server no-op)", () => {
    expect(orderParams({ limit: 10, status: 'completed' })).toEqual({ completed: true });
    expect(orderParams({ limit: 10, status: 'Completed' })).toEqual({ completed: true });
    expect(orderParams({ limit: 10, status: 'cancelled' })).toEqual({});
    expect(orderParams({ limit: 10, status: 'scheduled' })).toEqual({});
  });

  it('coerces full ISO datetimes to Y-m-d (the probed filter format)', () => {
    expect(orderParams({ limit: 10, from: '2026-08-01T15:49:00.000Z' })).toEqual({ datetimeafter: '2026-08-01' });
    expect(eventParams({ from: '2026-08-01T08:00:00Z', to: '2026-09-13', limit: 10 })).toEqual({
      start: '2026-08-01',
      end: '2026-09-13',
    });
  });

  it('passes client/agent q through', () => {
    expect(clientParams({ limit: 10, query: 'Doe' })).toEqual({ q: 'Doe' });
    expect(agentParams({ limit: 10, query: 'Jane' })).toEqual({ q: 'Jane' });
    expect(clientParams({ limit: 10 })).toEqual({});
  });

  it('maps event from/to onto start/end and drops type/cursor', () => {
    expect(eventParams({ from: '2026-01-01', to: '2026-01-31', limit: 10 })).toEqual({
      start: '2026-01-01',
      end: '2026-01-31',
    });
    expect(eventParams({ type: 'radon_drop', limit: 10, cursor: 'x' })).toEqual({});
  });

  it('validates single-record ids', () => {
    expect(getParams('abc-123')).toEqual({ id: 'abc-123' });
    expect(() => getParams('   ')).toThrow(/id is required/);
  });
});

// --- mapper ---------------------------------------------------------------

const ORDER_FIXTURE = {
  id: 'ord-1',
  oid: 42,
  complete: '1',
  canceled: null,
  canceleddatetime: null,
  completeddatetime: '2026-08-10 14:00:00',
  scheduleddatetime: '2026-08-10 09:00:00',
  datetime: '2026-08-10 09:00:00',
  totalfee: 450,
  paid: '1',
  confirmedby: 'Scheduler',
  confirmeddatetime: '2026-08-01 10:00:00',
  client: 'cli-9',
  inspector1: 'Mike P',
  buyersagent: 'Jane S',
  sellersagent: 'Bob J',
  referreason: 'Internet',
  ordertype: '4f06d537-b74a-4833-99e9-2228eaa1f413',
  address1: '123 Main St',
  address2: null,
  city: 'Austin',
  state: 'TX',
  zip: '78701',
  createddatetime: '2026-08-01 08:00:00',
  modified: '2026-08-10 15:00:00',
};

/**
 * A `/json/orders` row (live-probed 2026-10-18): bare-array entry, dollar-float
 * `total_fee`, `*_display` names, `show`/`canceled` flags, no completion flag.
 */
const JSON_ORDER_FIXTURE = {
  id: 'ord-1',
  oid: 42,
  datetime: '2026-08-10T09:00:00',
  total_fee: 450,
  client_id: 'cli-9',
  client_display: 'Dana Buyer',
  agent_display: 'Jane S',
  inspector1_display: 'Mike P',
  address1: '123 Main St',
  city: 'Austin',
  state: 'TX',
  postal_code: '78701',
  show: 'yes',
  canceled: 'no',
  modified: '2026-08-10T15:00:00',
};

describe('ISN order mapping (spec-indicative)', () => {
  it('maps a full order fixture', () => {
    const record = mapOrder(fromIsnOrder(ORDER_FIXTURE)!);
    expect(record.id).toBe('ord-1');
    expect(record.status).toBe('completed');
    expect(record.scheduledAt).toBe('2026-08-10 09:00:00');
    expect(record.completedAt).toBe('2026-08-10 14:00:00');
    // Vendor totalfee is major units (450); canonical totals are integer cents.
    expect(record.total).toBe(45000);
    expect(record.currency).toBe('USD');
    expect(record.paid).toBe(true);
    expect(record.confirmed).toBe(true);
    expect(record.clientId).toBe('cli-9');
    expect(record.inspectorName).toBe('Mike P');
    expect(record.buyingAgentName).toBe('Jane S');
    expect(record.sellingAgentName).toBe('Bob J');
    expect(record.referralSource).toBe('Internet');
    // Live probe: ordertype is a reference UUID, never a name — dropped.
    expect(record.serviceType).toBeUndefined();
    expect(record.address).toBe('123 Main St, Austin, TX, 78701');
    expect(record.details).toMatchObject({ oid: 42 });
  });

  it('prefers string id, falls back to oid, marks cancelled over completed', () => {
    expect(mapOrder(fromIsnOrder({ oid: 7 })!).id).toBe('7');
    const cancelled = mapOrder(fromIsnOrder({ id: 'x', canceled: 'yes', canceleddatetime: '2026-01-01 00:00:00', complete: '1' })!);
    expect(cancelled.status).toBe('cancelled');
    expect(mapOrder(fromIsnOrder({ id: 'y' })!).status).toBe('scheduled');
  });

  it('returns null without any id and never throws on odd types', () => {
    expect(fromIsnOrder({})).toBeNull();
    expect(fromIsnOrder(null)).toBeNull();
    expect(fromIsnOrder('nope')).toBeNull();
    const odd = mapOrder(fromIsnOrder({ id: 'z', totalfee: { weird: true }, paid: 'maybe', address1: 123 })!);
    expect(odd.total).toBeUndefined();
    expect(odd.paid).toBeUndefined();
    expect(odd.address).toBe('123');
  });
});

describe('ISN client/agent mapping (spec-indicative)', () => {
  it('names clients from display, full name, then company', () => {
    expect(mapClient(fromIsnClient({ id: '1', display: 'D V', first: 'A', last: 'B' })!).name).toBe('D V');
    expect(mapClient(fromIsnClient({ id: '2', first: 'John', last: 'Doe' })!).name).toBe('John Doe');
    expect(mapClient(fromIsnClient({ id: '3', companyname: 'Acme LLC' })!).name).toBe('Acme LLC');
    const phones = mapClient(fromIsnClient({ id: '4', homephone: 'h', workphone: 'w', mobilephone: 'm' })!);
    expect(phones.phone).toBe('m');
    const fallback = mapClient(fromIsnClient({ id: '5', homephone: 'h', stateabbreviation: 'TX', modified: '2026-01-01 00:00:00' })!);
    expect(fallback.phone).toBe('h');
    expect(fallback.state).toBe('TX');
    expect(fallback.updatedAt).toBe('2026-01-01 00:00:00');
    expect(fromIsnClient({})).toBeNull();
  });

  it('derives agent active from the probed show flag, with agency stats', () => {
    const agent = mapAgent(fromIsnAgent({ id: 'a1', first: 'Jane', last: 'Smith', email: 'j@x.com', agency: 'Big Realty', lastactive: '2026-01-01 00:00:00', show: 'yes' })!);
    expect(agent.name).toBe('Jane Smith');
    expect(agent.email).toBe('j@x.com');
    expect(agent.active).toBe(true);
    expect(agent.stats).toMatchObject({ agency: 'Big Realty' });
    expect(mapAgent(fromIsnAgent({ id: 'a2', show: 'no' })!).active).toBe(false);
    expect(mapAgent(fromIsnAgent({ id: 'a3' })!).active).toBeUndefined();
    expect(fromIsnAgent({})).toBeNull();
  });
});

describe('ISN event mapping (untyped calendarevents, best-effort)', () => {
  it('maps id/occurredAt/type/order link and keeps the rest as metadata', () => {
    const event = mapEvent(fromIsnEvent({ uuid: 'e1', start: '2026-08-10 09:00:00', eventtype: 'Inspection', orderid: 'ord-1', extra: 'kept' })!);
    expect(event.id).toBe('e1');
    expect(event.occurredAt).toBe('2026-08-10 09:00:00');
    expect(event.type).toBe('Inspection');
    expect(event.entityType).toBe('order');
    expect(event.entityId).toBe('ord-1');
    expect(event.metadata).toMatchObject({ extra: 'kept' });
  });

  it('drops items with no id or no occurredAt instead of inventing them', () => {
    expect(fromIsnEvent({ start: '2026-01-01' })).toBeNull();
    expect(fromIsnEvent({ id: 'e2' })).toBeNull();
    expect(fromIsnEvent({ id: 'e3', datetime: '2026-01-01 00:00:00' })!.id).toBe('e3');
  });

  it('prefers the human title over generic type and drops soft-deleted events', () => {
    const probed = mapEvent(
      fromIsnEvent({ id: 'x1', start: '2026-08-01 08:00:00', end: '2026-08-01 17:00:00', title: 'Unavailable', type: 'event', orderid: '', deleted: null, show: 1 })!,
    );
    expect(probed.type).toBe('Unavailable');
    expect(probed.occurredAt).toBe('2026-08-01 08:00:00');
    expect(probed.entityId).toBeUndefined();
    expect(fromIsnEvent({ id: 'x2', start: '2026-08-01 08:00:00', deleted: '2026-08-02 00:00:00' })).toBeNull();
  });
});

// --- client ---------------------------------------------------------------

describe('ISN client envelope + HTTP mapping', () => {
  it('builds the base URL from host + companyKey (never hard-coded)', () => {
    expect(new IsnClient(CREDS).baseUrl()).toBe('https://test.isn/acme/rest');
    expect(new IsnClient({ ...CREDS, host: 'https://goisn.net/' }).baseUrl()).toBe('https://goisn.net/acme/rest');
  });

  it('refuses to build a client without a host (compulsory, never defaulted)', () => {
    expect(() => new IsnClient({ companyKey: 'acme', accessKey: 'a', secretKey: 's' } as never)).toThrow(/needs a host/);
    expect(() => new IsnClient({ companyKey: 'acme', host: '  ', accessKey: 'a', secretKey: 's' })).toThrow(/needs a host/);
  });

  it('returns ok payloads and gates error/missing envelopes', () => {
    expect(checkEnvelope({ status: 'ok', orders: [] }, '/orders')).toEqual({ status: 'ok', orders: [] });
    expect(() => checkEnvelope({ status: 'error', message: 'bad key' }, '/orders')).toThrow(IsnApiError);
    expect(() => checkEnvelope({ orders: [] }, '/orders')).toThrow(/no status envelope/);
    expect(() => checkEnvelope(null, '/orders')).toThrow(/unexpected response shape/);
  });

  it('redacts key material echoed by the server (live: 401 echoes the username)', () => {
    const errBody = { status: 'error', message: "username received: 'ak-user'" };
    const secrets = ['ak-user', 'sk-secret', 'acme'];
    expect(() => checkEnvelope(errBody, '/me', secrets)).toThrow(/\[redacted\]/);
    try {
      checkEnvelope(errBody, '/me', secrets);
      expect.unreachable();
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).not.toContain('ak-user');
      expect(msg).toContain('[redacted]');
    }
  });

  it('maps HTTP failures to actionable errors without secret leakage', async () => {
    stubFetch(() => ({}), false, 401);
    await expect(new IsnClient(CREDS).get('/orders')).rejects.toThrow(/rejected the credentials.*401/);
    try {
      await new IsnClient(CREDS).get('/orders');
      expect.unreachable();
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).not.toContain('ak-user');
      expect(msg).not.toContain('sk-secret');
    }
  });

  it('sends Basic auth and query strings on GET', async () => {
    const seen = stubFetch(() => ({ status: 'ok', orders: [], count: 0 }));
    await new IsnClient(CREDS).get('/orders', { datetimeafter: '2026-08-01' });
    expect(seen[0]).toContain('/acme/rest/orders?');
    expect(seen[0]).toContain('datetimeafter=2026-08-01');
  });
});

// --- adapter ---------------------------------------------------------------

describe('ISN adapter reads (stubbed fetch)', () => {
  function isnFetch() {
    return stubFetch((url) => {
      if (url.includes('/json/orders')) return [JSON_ORDER_FIXTURE];
      if (url.includes('/rest/orders?')) return { status: 'ok', orders: [ORDER_FIXTURE], count: 1, after: null };
      if (url.includes('/rest/order/')) return { status: 'ok', order: ORDER_FIXTURE, message: '' };
      if (url.includes('/rest/clients/search')) {
        return { status: 'ok', clients: [{ id: 'c1', first: 'John', last: 'Doe' }], count: 1, q: 'Doe' };
      }
      if (url.includes('/rest/client/')) return { status: 'ok', client: { id: 'c1', first: 'John', last: 'Doe' }, message: '' };
      if (url.includes('/rest/agents/search')) {
        return { status: 'ok', agents: [{ id: 'a1', first: 'Jane', last: 'Smith' }], count: 1, q: 'Jane' };
      }
      if (url.includes('/rest/agent/')) return { status: 'ok', agent: { id: 'a1', first: 'Jane', last: 'Smith' }, message: '' };
      if (url.includes('/rest/calendarevents')) {
        return { status: 'ok', events: [{ id: 'e1', start: '2026-08-10 09:00:00' }, { noid: true }], message: '' };
      }
      if (url.includes('/rest/me')) return { status: 'ok', me: 'owner', message: '' };
      return { status: 'error', message: 'no action' };
    });
  }

  it('serves all seven reads with single-page semantics', async () => {
    isnFetch();
    const adapter = new IsnAdapter({}, { provider: 'isn', credentials: CREDS });
    const orders = await adapter.searchOrders({ limit: 25, from: '2026-08-01', to: '2026-08-31' });
    expect(orders.items).toHaveLength(1);
    expect(orders.items[0]!.status).toBe('completed');
    expect(orders.nextCursor).toBeUndefined();
    expect(orders.totalEstimate).toBe(1);

    expect((await adapter.getOrder('ord-1'))!.id).toBe('ord-1');

    const clients = await adapter.searchClients({ limit: 10, query: 'Doe' });
    expect(clients.items[0]!.name).toBe('John Doe');
    expect((await adapter.getClient('c1'))!.id).toBe('c1');

    const agents = await adapter.searchAgents({ limit: 10, query: 'Jane' });
    expect(agents.items[0]!.name).toBe('Jane Smith');
    expect((await adapter.getAgent('a1'))!.id).toBe('a1');

    const events = await adapter.searchEvents({ limit: 10 });
    expect(events.items).toHaveLength(1); // id-less item dropped
    expect(events.totalEstimate).toBe(2); // raw records returned stays visible
  });

  it('returns null for absent single records', async () => {
    stubFetch(() => ({ status: 'ok', order: null }));
    const adapter = new IsnAdapter({}, { provider: 'isn', credentials: CREDS });
    expect(await adapter.getOrder('nope')).toBeNull();
  });

  it('defines only the ten probed writes (cancel + sendMessage absent)', () => {
    const adapter = new IsnAdapter({}, { provider: 'isn', credentials: CREDS });
    for (const m of [
      'createOrder', 'updateOrder', 'rescheduleOrder', 'deleteOrder',
      'createClient', 'updateClient', 'deleteClient',
      'createAgent', 'updateAgent', 'deleteAgent',
    ] as const) {
      expect(typeof adapter[m]).toBe('function');
    }
    for (const m of ['cancelOrder', 'sendMessage'] as const) {
      expect(adapter[m]).toBeUndefined();
    }
  });

  it('creates/updates/deletes clients and agents with read-back (stubbed fetch)', async () => {
    const seen: Array<{ url: string; method: string; body?: string }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
        seen.push({ url: String(url), method: init?.method ?? 'GET', body: init?.body });
        const u = String(url);
        const method = init?.method ?? 'GET';
        if (u.endsWith('/rest/client') && method === 'POST') {
          return { ok: true, status: 200, json: async () => ({ status: 'ok', id: 'c-new', message: '' }) };
        }
        if (u.includes('/rest/client/') && method === 'POST') {
          return { ok: true, status: 200, json: async () => ({ status: 'ok', id: 'c1', message: '' }) };
        }
        if (u.includes('/rest/client/') && method === 'DELETE') {
          return { ok: true, status: 200, json: async () => ({ status: 'ok', id: 'c1', message: '' }) };
        }
        if (u.endsWith('/rest/agent') && method === 'POST') {
          return { ok: true, status: 200, json: async () => ({ status: 'ok', id: 'a-new', message: '' }) };
        }
        if (u.includes('/rest/agent/') && method === 'POST') {
          return { ok: true, status: 200, json: async () => ({ status: 'ok', id: 'a1', message: '' }) };
        }
        if (u.includes('/rest/agent/') && method === 'DELETE') {
          return { ok: true, status: 200, json: async () => ({ status: 'ok', id: 'a1', message: '' }) };
        }
        if (u.includes('/rest/client/')) {
          return { ok: true, status: 200, json: async () => ({ status: 'ok', client: { id: 'c1', first: 'John', last: 'Doe' }, message: '' }) };
        }
        if (u.includes('/rest/agent/')) {
          return { ok: true, status: 200, json: async () => ({ status: 'ok', agent: { id: 'a1', first: 'Jane', last: 'Smith' }, message: '' }) };
        }
        return { ok: true, status: 200, json: async () => ({ status: 'error', message: 'no action' }) };
      }),
    );
    const adapter = new IsnAdapter({}, { provider: 'isn', credentials: CREDS });
    const cc = await adapter.createClient({ name: 'John Doe', email: 'j@x.com', phone: '555', city: 'Austin', state: 'TX' });
    expect(cc.id).toBe('c1');
    const ccCall = seen.find((s) => s.url.endsWith('/rest/client') && s.method === 'POST')!;
    expect(JSON.parse(ccCall.body!)).toMatchObject({ first: 'John', last: 'Doe', display: 'John Doe', email: 'j@x.com' });

    const cu = await adapter.updateClient('c1', { phone: '556' });
    expect(cu.id).toBe('c1');
    expect(await adapter.deleteClient('c1')).toEqual({ id: 'c1', deleted: true });
    const cdel = seen.find((s) => s.url.includes('/rest/client/c1') && s.method === 'DELETE')!;
    expect(cdel.body).toBeUndefined();

    const ca = await adapter.createAgent({ firstName: 'Jane', lastName: 'Smith' });
    expect(ca.id).toBe('a1');
    const au = await adapter.updateAgent('a1', { email: 'jane@x.com' });
    expect(au.id).toBe('a1');
    expect(await adapter.deleteAgent('a1')).toEqual({ id: 'a1', deleted: true });
  });

  it('creates/updates/reschedules/deletes orders with read-back (stubbed fetch)', async () => {
    const seen: Array<{ url: string; method: string; body?: string }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
        seen.push({ url: String(url), method: init?.method ?? 'GET', body: init?.body });
        const u = String(url);
        if (u.endsWith('/rest/order') && (init?.method ?? 'GET') === 'POST') {
          return { ok: true, status: 200, json: async () => ({ status: 'ok', id: 'new-1', oid: 99, message: '' }) };
        }
        if (u.includes('/rest/order/') && (init?.method ?? 'GET') === 'POST') {
          return { ok: true, status: 200, json: async () => ({ status: 'ok', id: 'ord-1', oid: 42, message: '' }) };
        }
        if (u.endsWith('/rest/order') && init?.method === 'DELETE') {
          return { ok: true, status: 200, json: async () => ({ status: 'ok', id: 'ord-1', message: '' }) };
        }
        if (u.includes('/rest/order/')) {
          return { ok: true, status: 200, json: async () => ({ status: 'ok', order: ORDER_FIXTURE, message: '' }) };
        }
        return { ok: true, status: 200, json: async () => ({ status: 'error', message: 'no action' }) };
      }),
    );
    const adapter = new IsnAdapter({}, { provider: 'isn', credentials: CREDS });
    const created = await adapter.createOrder({ address: '1 Test Way', scheduledAt: '2030-01-15 09:00:00', serviceType: 'X', notes: 'Y' });
    expect(created.id).toBe('ord-1');
    const createCall = seen.find((s) => s.url.endsWith('/rest/order') && s.method === 'POST')!;
    expect(JSON.parse(createCall.body!)).toEqual({ address1: '1 Test Way', datetime: '2030-01-15 09:00:00', notes: 'Y' });

    const updated = await adapter.updateOrder('ord-1', { address: '2 Test Way' });
    expect(updated.id).toBe('ord-1');

    const moved = await adapter.rescheduleOrder('ord-1', '2030-02-01 10:00:00');
    expect(moved.id).toBe('ord-1');
    const moveCall = seen.filter((s) => s.url.includes('/rest/order/ord-1') && s.method === 'POST').pop()!;
    expect(JSON.parse(moveCall.body!)).toEqual({ datetime: '2030-02-01 10:00:00' });

    const deleted = await adapter.deleteOrder('ord-1');
    expect(deleted).toEqual({ id: 'ord-1', deleted: true });
    const delCall = seen.find((s) => s.method === 'DELETE')!;
    expect(delCall.url.endsWith('/rest/order')).toBe(true);
    expect(delCall.body).toBe('uuid=ord-1');
  });
});

// --- MCP surface ----------------------------------------------------------

describe('MCP tool surface (unchanged by ISN)', () => {
  it('registers exactly the seven domain primitives, no provider-shaped names', () => {
    const names: string[] = [];
    const server = { registerTool: (name: string) => void names.push(name) };
    const adapter = new IsnAdapter({}, { provider: 'isn', credentials: CREDS });
    registerDataTools(server as never, adapter);
    expect(names.sort()).toEqual(
      ['get_agent', 'get_client', 'get_order', 'search_agents', 'search_clients', 'search_events', 'search_orders'].sort(),
    );
    expect(names.some((n) => /isn/i.test(n))).toBe(false);
  });
});
