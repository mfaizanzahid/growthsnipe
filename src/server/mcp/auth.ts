import { eq, and, isNull } from 'drizzle-orm';
import { createDb } from '../repositories/db';
import { drizzleStore } from '../repositories/billing';
import type { Env } from '../lib/env';
import { hashMcpToken } from '../lib/tokens';
import { orgAccess } from '../billing/access';
import { sidekickMcpTokens, sidekickConnections } from '../db/schema';
import { oauthTokens } from '../../../db/schema';
export interface McpPrincipal { tokenId: string; organizationId: string; tokenName: string; kind: 'mcp_token' | 'oauth'; }

/** Base URL for OAuth discovery (public app URL; falls back to request origin). */
export function publicBaseUrl(env: Env, reqUrl: string): string {
  const base = (env as { APP_BASE_URL?: string }).APP_BASE_URL;
  if (base) return base.replace(/\/+$/, '');
  return new URL(reqUrl).origin;
}

/** 401 with RFC9728 discovery so OAuth MCP clients can find the AS. */
function unauthorized(env: Env, reqUrl: string, error: string) {
  const resource = `${publicBaseUrl(env, reqUrl)}/.well-known/oauth-protected-resource`;
  return Response.json({ error }, {
    status: 401,
    headers: { 'WWW-Authenticate': `Bearer resource_metadata="${resource}", scope="sidekick"` },
  });
}

/**
 * Returns the principal, or a 401 Response (returned, never thrown, so
 * runtimes can't turn it into a 500). Accepts V1 org tokens (`bs_mcp_…`)
 * and OAuth access tokens (`bsoa_…`, unexpired, unrevoked), via the
 * `Authorization: Bearer` header or — for header-less clients such as
 * Claude's "no sign-in" connector mode — the `?apiKey=` / `?access_token=`
 * query parameter (same validation; Spectora uses the same pattern).
 * Query-string tokens can leak into logs, so prefer headers or OAuth
 * beyond owner testing.
 */
export async function authenticateMcpRequest(request: Request, env: Env): Promise<McpPrincipal | Response> {
  const header = request.headers.get('authorization');
  let token = header?.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    try {
      const q = new URL(request.url).searchParams;
      token = (q.get('apiKey') ?? q.get('access_token') ?? '').trim();
    } catch {
      token = '';
    }
  }
  if (!token) return unauthorized(env, request.url, 'Missing MCP bearer token');
  const db=createDb(env.DB);
  let organizationId: string;
  let tokenId: string;
  let tokenName: string;
  let kind: McpPrincipal['kind'];
  if (token.startsWith('bs_mcp_')) {
    const rows=await db.select().from(sidekickMcpTokens).where(and(eq(sidekickMcpTokens.tokenHash,await hashMcpToken(token, env.MCP_TOKEN_PEPPER)),isNull(sidekickMcpTokens.revokedAt))).limit(1);
    const principal=rows[0]; if(!principal) return unauthorized(env, request.url, 'Invalid or revoked MCP bearer token');
    await db.update(sidekickMcpTokens).set({lastUsedAt:new Date()}).where(eq(sidekickMcpTokens.id,principal.id));
    organizationId=principal.organizationId; tokenId=principal.id; tokenName=principal.name; kind='mcp_token';
  } else {
    const nowSec = Math.floor(Date.now() / 1000);
    const rows=await db.select().from(oauthTokens).where(and(eq(oauthTokens.tokenHash,await hashMcpToken(token, env.MCP_TOKEN_PEPPER)),isNull(oauthTokens.revokedAt))).limit(1);
    const granted=rows[0];
    if(!granted || granted.expiresAt <= nowSec) return unauthorized(env, request.url, 'Invalid, expired, or revoked access token');
    organizationId=granted.orgId; tokenId=granted.tokenHash.slice(0,16); tokenName=`oauth:${granted.clientId.slice(0,8)}`; kind='oauth';
  }
  // Gated workspaces (expired trial, suspended billing) lose AI access until
  // they subscribe — dashboard banner + billing stay open instead.
  const access = await orgAccess(drizzleStore(db), organizationId);
  if (access.state !== 'trial' && access.state !== 'active') {
    return Response.json({ error: 'Subscription required — upgrade from billing to restore AI access' }, { status: 402 });
  }
  return {tokenId,organizationId,tokenName,kind};
}
export async function loadConnection(env: Env, organizationId: string, provider: string) {
  const db=createDb(env.DB); const rows=await db.select().from(sidekickConnections).where(and(eq(sidekickConnections.organizationId,organizationId),eq(sidekickConnections.provider,provider))).limit(1); return rows[0]??null;
}
/** The org's platform connection (one platform per org). */
export async function loadOrgConnection(env: Env, organizationId: string) {
  const db=createDb(env.DB); const rows=await db.select().from(sidekickConnections).where(eq(sidekickConnections.organizationId,organizationId)).limit(1); return rows[0]??null;
}
