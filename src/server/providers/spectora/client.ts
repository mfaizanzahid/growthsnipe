/**
 * Spectora REST client (direct API, no MCP transport).
 *
 * Base: `https://connect.spectora.com` + `/v2/...` resource paths (see
 * docs/spectora-contract.md + https://developer.spectora.com/api/*).
 * Auth: `Authorization: Bearer <key>` — API key preferred; a stored OAuth
 * access token is accepted for workspaces connected before the form was
 * simplified to API-key-only.
 *
 * Responses are JSON:API (`{data[], meta.pagination, links}`); the adapter
 * parses them with the same mapper used before. Non-2xx responses throw
 * `SpectoraApiError` with truncated, key-free detail.
 */

export const SPECTORA_DEFAULT_BASE = 'https://connect.spectora.com';

export class SpectoraApiError extends Error {
  readonly httpStatus?: number;
  constructor(message: string, httpStatus?: number) {
    super(message);
    this.name = 'SpectoraApiError';
    this.httpStatus = httpStatus;
  }
}

function truncate(value: unknown, max = 200): string {
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/**
 * Resolve the REST base URL. Legacy connections may carry `mcpEndpoint`
 * (the old MCP URL, possibly suffixed `/mcp`); a trailing `/mcp` is
 * stripped so stored values keep working against the REST paths.
 */
export function resolveBaseUrl(credentials: Record<string, string>): string {
  const raw = (credentials.restEndpoint ?? credentials.mcpEndpoint ?? '').trim() || SPECTORA_DEFAULT_BASE;
  const withoutProtocol = raw.replace(/^https?:\/\//i, '');
  const [host, ...rest] = withoutProtocol.split('/');
  let path = `/${rest.join('/').replace(/\/+$/g, '')}`;
  // Stored MCP URLs end in /mcp (transport root), which is not a REST path.
  if (path.toLowerCase().endsWith('/mcp')) path = path.slice(0, -4) || '/';
  const base = path === '/' ? `https://${host}` : `https://${host}${path}`;
  return base.replace(/\/+$/g, '');
}

function encodeQuery(query: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      // JSON:API array convention, exactly as documented for
      // `filter[start_datetime_between][]=a&filter[...][]=b`.
      for (const v of value) {
        if (v !== undefined && v !== null && v !== '') params.append(`${key}[]`, String(v));
      }
      continue;
    }
    params.append(key, typeof value === 'boolean' ? String(value) : String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

export class SpectoraClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(credentials: Record<string, string>) {
    const token = credentials.oauthAccessToken || credentials.apiKey;
    if (!token) {
      throw new Error('Spectora connection is missing API key or OAuth access token.');
    }
    this.token = token;
    this.baseUrl = resolveBaseUrl(credentials);
  }

  /** GET a REST path with a flat query object; returns parsed JSON. */
  async get(path: string, query: Record<string, unknown> = {}): Promise<unknown> {
    const url = `${this.baseUrl}${path}${encodeQuery(query)}`;
    let res: Response;
    try {
      res = await globalThis.fetch(url, {
        method: 'GET',
        headers: { authorization: `Bearer ${this.token}` },
      });
    } catch (err) {
      throw new SpectoraApiError(
        `Spectora request to ${path} failed before a response (${truncate(err instanceof Error ? err.message : String(err), 120)})`,
      );
    }
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        detail = truncate(await res.text(), 200);
      } catch {
        // fall through with the status-only message
      }
      if (res.status === 401) detail = `rejected the credentials (401): ${detail}`;
      if (res.status === 403) detail = `forbidden (403): ${detail}`;
      if (res.status === 404) detail = `not found (404): ${detail}`;
      if (res.status === 422) detail = `rejected the parameters (422): ${detail}`;
      if (res.status === 429) detail = `rate limited (429): ${detail}`;
      throw new SpectoraApiError(`Spectora request to ${path} failed: ${detail}`, res.status);
    }
    try {
      return await res.json();
    } catch {
      throw new SpectoraApiError(`Spectora ${path} returned a non-JSON response (HTTP ${res.status})`, res.status);
    }
  }
}
