import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "../repositories/db";
import { oauthClients, oauthCodes, oauthTokens } from "../../../db/schema";

/** Refresh-token lifetime: access rows live 1h (expires_at); refresh stays valid 1yr from creation. */
export const REFRESH_TTL_MS = 365 * 86_400 * 1000;

/** Narrow data-access surface for the OAuth authorization server (real or fake in tests). */
export interface OAuthStore {
  createClient(input: { id: string; name: string; redirectUris: string[] }): Promise<void>;
  getClient(id: string): Promise<{ id: string; name: string; redirectUris: string[] } | null>;
  createCode(input: {
    codeHash: string;
    clientId: string;
    redirectUri: string;
    orgId: string;
    userId: string;
    scope: string;
    codeChallenge: string;
    expiresAt: number;
  }): Promise<void>;
  consumeCode(codeHash: string, nowSec: number): Promise<{
    clientId: string;
    redirectUri: string;
    orgId: string;
    userId: string;
    scope: string;
    codeChallenge: string;
  } | null>;
  createToken(input: {
    tokenHash: string;
    kind: string;
    clientId: string;
    orgId: string;
    userId: string;
    scope: string;
    expiresAt: number;
    refreshHash: string | null;
  }): Promise<void>;
  getAccessToken(tokenHash: string, nowSec: number): Promise<{
    orgId: string;
    userId: string;
    clientId: string;
    scope: string;
  } | null>;
  rotateRefresh(refreshHash: string, nowSec: number): Promise<{
    clientId: string;
    orgId: string;
    userId: string;
    scope: string;
  } | null>;
  revokeToken(tokenHash: string): Promise<void>;
}

export function drizzleOAuthStore(db: Db): OAuthStore {
  return {
    async createClient(input) {
      await db.insert(oauthClients).values({
        id: input.id,
        name: input.name,
        redirectUrisJson: JSON.stringify(input.redirectUris),
        createdAt: Date.now(),
      });
    },
    async getClient(id) {
      const rows = await db.select().from(oauthClients).where(eq(oauthClients.id, id)).limit(1);
      const row = rows[0];
      if (!row) return null;
      return { id: row.id, name: row.name ?? "MCP client", redirectUris: JSON.parse(row.redirectUrisJson ?? "[]") as string[] };
    },
    async createCode(input) {
      await db.insert(oauthCodes).values({ ...input, codeChallengeMethod: "S256", usedAt: null, createdAt: Date.now() });
    },
    async consumeCode(codeHash, nowSec) {
      const rows = await db.select().from(oauthCodes).where(eq(oauthCodes.codeHash, codeHash)).limit(1);
      const row = rows[0];
      if (!row || row.usedAt !== null || row.expiresAt <= nowSec) return null;
      await db.update(oauthCodes).set({ usedAt: nowSec }).where(eq(oauthCodes.codeHash, codeHash));
      return {
        clientId: row.clientId,
        redirectUri: row.redirectUri,
        orgId: row.orgId,
        userId: row.userId,
        scope: row.scope ?? "",
        codeChallenge: row.codeChallenge,
      };
    },
    async createToken(input) {
      await db.insert(oauthTokens).values({ ...input, revokedAt: null, createdAt: Date.now() });
    },
    async getAccessToken(tokenHash, nowSec) {
      const rows = await db
        .select()
        .from(oauthTokens)
        .where(and(eq(oauthTokens.tokenHash, tokenHash), isNull(oauthTokens.revokedAt)))
        .limit(1);
      const row = rows[0];
      if (!row || row.expiresAt <= nowSec) return null;
      return { orgId: row.orgId, userId: row.userId, clientId: row.clientId, scope: row.scope ?? "" };
    },
    async rotateRefresh(refreshHash, nowSec) {
      const rows = await db
        .select()
        .from(oauthTokens)
        .where(and(eq(oauthTokens.refreshHash, refreshHash), isNull(oauthTokens.revokedAt)))
        .limit(1);
      const row = rows[0];
      if (!row || row.revokedAt !== null) return null;
      if (row.createdAt + REFRESH_TTL_MS < nowSec * 1000) return null;
      // Single-use refresh: revoke the old row; the caller inserts replacements.
      await db.update(oauthTokens).set({ revokedAt: nowSec }).where(eq(oauthTokens.tokenHash, row.tokenHash));
      return { clientId: row.clientId, orgId: row.orgId, userId: row.userId, scope: row.scope ?? "" };
    },
    async revokeToken(tokenHash) {
      await db.update(oauthTokens).set({ revokedAt: Date.now() }).where(eq(oauthTokens.tokenHash, tokenHash));
    },
  };
}
