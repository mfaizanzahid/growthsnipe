/**
 * ISN REST client (V1 read path).
 *
 * Spec: docs/isn.yaml (v8665); local digest docs/isn-contract.md.
 * Base: `https://{host}/{companyKey}/rest` — host AND companyKey are both
 * compulsory (white-label domains differ; nothing is defaulted or
 * hard-coded). Auth: HTTP Basic (accessKey as user, secretKey as password).
 *
 * Verb encoding (yaml ~lines 60-80): GET = query string; POST =
 * application/json OR form; PUT/DELETE = form-only. The V1 read path only
 * issues GETs. Unknown endpoint -> 405, 400 = missing fields,
 * 403 = privilege lack.
 *
 * Every response carries `{status: ok|error}` (+ `message` detail) — always
 * checked before any payload is read.
 *
 * Secrets: access/secret keys never expire and carry the owning user's full
 * privileges. They are sent only in the Authorization header, never logged,
 * never interpolated into error messages, and never returned by any API.
 *
 * TODO(PROBE): verify base-URL joining + envelope shape against a live
 * `/me` response once the owner provides credentials.
 */

export interface IsnCredentials {
  companyKey: string;
  host: string;
  accessKey: string;
  secretKey: string;
}

export class IsnApiError extends Error {
  readonly httpStatus?: number;
  constructor(message: string, httpStatus?: number) {
    super(message);
    this.name = 'IsnApiError';
    this.httpStatus = httpStatus;
  }
}

function truncate(value: unknown, max = 200): string {
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/**
 * Live probe (2026-09-13): ISN's 401 body echoes the Basic-auth username,
 * i.e. OUR access key (`"username received: '<accessKey>'"`). Any server
 * text that reaches error messages (snapshot UI, logs) must be scrubbed of
 * key material first — keys never expire and carry full user privileges.
 */
export function redactSecrets(message: string, secrets: Array<string | undefined>): string {
  let out = message;
  for (const secret of secrets) {
    if (!secret) continue;
    const needle = secret.trim();
    if (needle.length < 4) continue;
    out = out.split(needle).join('[redacted]');
  }
  return out;
}

/** Worker-safe Basic header. Keys are ASCII by construction; the fallback
 * covers non-Latin1 input because `btoa` only handles Latin1. */
function basicAuthHeader(accessKey: string, secretKey: string): string {
  try {
    return `Basic ${btoa(`${accessKey}:${secretKey}`)}`;
  } catch {
    const bytes = new TextEncoder().encode(`${accessKey}:${secretKey}`);
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return `Basic ${btoa(bin)}`;
  }
}

function cleanHost(host: string | undefined): string {
  // Host is compulsory: white-label customers live on their own domain, so
  // silently defaulting would point credentials at the wrong tenant.
  const cleaned = (host ?? '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/g, '')
    .trim();
  if (!cleaned) {
    throw new IsnApiError('ISN connection needs a host (e.g. inspectionsupport.com or your white-label domain).');
  }
  return cleaned;
}

function encodeQuery(query: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.append(key, typeof value === 'boolean' ? String(value) : String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

export class IsnClient {
  private readonly companyKey: string;
  private readonly host: string;
  private readonly accessKey: string;
  private readonly secretKey: string;

  constructor(credentials: IsnCredentials) {
    const companyKey = (credentials.companyKey ?? '').trim();
    const accessKey = (credentials.accessKey ?? '').trim();
    const secretKey = (credentials.secretKey ?? '').trim();
    if (!companyKey || !accessKey || !secretKey) {
      throw new IsnApiError(
        'ISN connection is missing companyKey, accessKey, or secretKey. ' +
          'Provide ISN-shaped credentials (companyKey + accessKey + secretKey), not an apiKey.',
      );
    }
    this.companyKey = companyKey;
    this.host = cleanHost(credentials.host);
    this.accessKey = accessKey;
    this.secretKey = secretKey;
  }

  baseUrl(): string {
    return `https://${this.host}/${encodeURIComponent(this.companyKey)}/rest`;
  }

  jsonBaseUrl(): string {
    return `https://${this.host}/${encodeURIComponent(this.companyKey)}/json`;
  }

  /**
   * Low-level request with per-verb encoding and envelope checking.
   * Only `query` is used by the V1 read path; `json`/`form` exist so future
   * (out-of-scope) callers encode POST bodies correctly per the spec.
   */
  private secrets(): Array<string | undefined> {
    return [this.accessKey, this.secretKey, this.companyKey];
  }

  /** Fetch + HTTP status gate. Never builds error text from the URL (it can
   * carry a query window) or from key material. */
  private async send(
    url: string,
    path: string,
    method: 'GET' | 'POST' | 'DELETE',
    headers: Record<string, string>,
    body?: string,
  ): Promise<Response> {
    let res: Response;
    try {
      res = await globalThis.fetch(url, { method, headers, body });
    } catch (err) {
      // Never include keys, host credentials, or the query string.
      throw new IsnApiError(
        redactSecrets(
          `ISN request to ${path} failed before a response (${truncate(err instanceof Error ? err.message : String(err), 120)})`,
          this.secrets(),
        ),
      );
    }
    if (!res.ok) {
      throw new IsnApiError(httpErrorMessage(res.status, path), res.status);
    }
    return res;
  }

  /**
   * Full-detail order read (live-probed 2026-10-18 against goisn.net).
   *
   * The `/json` family is the only order endpoint that returns money
   * (`total_fee`) and inspector/agent/client display names, but it differs
   * from `/rest` in three ways a caller must respect:
   *  - it returns a TOP-LEVEL ARRAY — there is no `{status}` envelope, so
   *    `checkEnvelope` MUST NOT be applied here;
   *  - it REQUIRES both `start` and `end` as ISO 8601 instants (missing or
   *    malformed -> HTTP 400);
   *  - it ignores every other query param (`completed`, `canceled`, `limit`,
   *    `after` are all no-ops), so callers filter client-side.
   */
  async getOrdersWindow(start: string, end: string): Promise<unknown[]> {
    const path = '/orders';
    const url = `${this.jsonBaseUrl()}${path}${encodeQuery({ start, end })}`;
    const res = await this.send(url, `/json${path}`, 'GET', {
      authorization: basicAuthHeader(this.accessKey, this.secretKey),
    });
    let parsed: unknown;
    try {
      parsed = await res.json();
    } catch {
      throw new IsnApiError(`ISN /json${path} returned a non-JSON response (HTTP ${res.status})`, res.status);
    }
    if (!Array.isArray(parsed)) {
      throw new IsnApiError(`ISN /json${path} returned an unexpected response shape (expected a JSON array)`);
    }
    return parsed;
  }

  async request(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    opts: { query?: Record<string, unknown>; json?: unknown; form?: Record<string, string> } = {},
  ): Promise<Record<string, unknown>> {
    const url = `${this.baseUrl()}${path}${encodeQuery(opts.query ?? {})}`;
    const headers: Record<string, string> = { authorization: basicAuthHeader(this.accessKey, this.secretKey) };
    let body: string | undefined;
    // Spec verb encoding (live-verified for POST JSON + DELETE form):
    // POST accepts JSON or form; DELETE is form-only (JSON arrives empty).
    if (method === 'POST') {
      if (opts.json !== undefined) {
        headers['content-type'] = 'application/json';
        body = JSON.stringify(opts.json);
      } else if (opts.form !== undefined) {
        headers['content-type'] = 'application/x-www-form-urlencoded';
        body = new URLSearchParams(opts.form).toString();
      }
    } else if (method === 'DELETE') {
      // Form-only per spec; bodiless deletes (e.g. DELETE /client/{id},
      // live-probed) send no body at all.
      const form = new URLSearchParams(opts.form ?? {}).toString();
      if (form !== '') {
        headers['content-type'] = 'application/x-www-form-urlencoded';
        body = form;
      }
    }
    const res = await this.send(url, path, method, headers, body);
    let parsed: unknown;
    try {
      parsed = await res.json();
    } catch {
      throw new IsnApiError(`ISN ${path} returned a non-JSON response (HTTP ${res.status})`, res.status);
    }
    return checkEnvelope(parsed, path, this.secrets());
  }

  async get(path: string, query: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    return this.request('GET', path, { query });
  }

  /** Credential validation probe: GET /me (yaml:8188 -> {me, message, status}). */
  async validateCredentials(): Promise<void> {
    await this.get('/me');
  }
}

/** Envelope gate: `status: ok` passes; `error` (+ message) and missing
 * status both throw. Server text is scrubbed of key material first (ISN
 * echoes the access key in auth-failure messages — live-probed). */
export function checkEnvelope(parsed: unknown, path: string, secrets: Array<string | undefined> = []): Record<string, unknown> {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new IsnApiError(`ISN ${path} returned an unexpected response shape (missing status envelope)`);
  }
  const status = (parsed as { status?: unknown }).status;
  if (status === 'ok') return parsed as Record<string, unknown>;
  if (status === 'error') {
    const message = (parsed as { message?: unknown }).message;
    throw new IsnApiError(redactSecrets(`ISN ${path} reported an error: ${truncate(message ?? 'unknown error')}`, secrets));
  }
  throw new IsnApiError(`ISN ${path} returned no status envelope; refusing to read the payload`);
}

function httpErrorMessage(status: number, path: string): string {
  // Actionable text per the spec's error section; never secret material.
  // Unknown endpoint -> 405 (not 404); 400 lists missing fields;
  // 403 = credentials accepted but the owning user lacks the privilege.
  if (status === 401) return `ISN rejected the credentials for ${path} (401). Check the access key / secret key.`;
  if (status === 403) return `ISN accepted the credentials but the owning user lacks the privilege for ${path} (403).`;
  if (status === 404 || status === 405) return `ISN has no such endpoint (HTTP ${status} for ${path}).`;
  if (status === 400) return `ISN rejected the request for ${path} (400: missing or invalid fields).`;
  return `ISN request to ${path} failed (HTTP ${status}).`;
}
