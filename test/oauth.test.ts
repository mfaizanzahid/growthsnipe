import { describe, expect, it } from "vitest";
import type { Env } from "../src/server/types";
import { createOAuthRoutes } from "../src/server/routes/oauth";
import type { MemberStore, SessionUser } from "../src/server/middleware";
import type { Auth } from "../src/server/auth";
import type { Db } from "../src/server/repositories/db";
import type { OAuthStore } from "../src/server/oauth/store";
import { REFRESH_TTL_MS } from "../src/server/oauth/store";
import { pkceS256Challenge } from "../src/server/lib/tokens";

const ENV = { APP_BASE_URL: "https://app.test", MCP_TOKEN_PEPPER: "pepper-test" } as unknown as Env;
const USER: SessionUser = { id: "u1", email: "owner@test.com", emailVerified: true };

function memberStore(): MemberStore {
  return {
    getMember: async (orgId, userId) =>
      orgId === "o1" && userId === "u1" ? { role: "admin" } : null,
    isSuperadmin: async () => false,
    seedSuperadmins: async () => undefined,
  };
}

interface CodeRow {
  codeHash: string;
  clientId: string;
  redirectUri: string;
  orgId: string;
  userId: string;
  scope: string;
  codeChallenge: string;
  expiresAt: number;
  usedAt: number | null;
}
interface TokenRow {
  tokenHash: string;
  clientId: string;
  orgId: string;
  userId: string;
  scope: string;
  expiresAt: number;
  refreshHash: string | null;
  revokedAt: number | null;
  createdAt: number;
}

function memoryOAuth() {
  const clients = new Map<string, { id: string; name: string; redirectUris: string[] }>();
  const codes = new Map<string, CodeRow>();
  const tokens = new Map<string, TokenRow>();
  const store: OAuthStore = {
    async createClient(input) {
      clients.set(input.id, input);
    },
    async getClient(id) {
      return clients.get(id) ?? null;
    },
    async createCode(input) {
      codes.set(input.codeHash, { ...input, usedAt: null });
    },
    async consumeCode(codeHash, nowSec) {
      const row = codes.get(codeHash);
      if (!row || row.usedAt !== null || row.expiresAt <= nowSec) return null;
      row.usedAt = nowSec;
      return row;
    },
    async createToken(input) {
      tokens.set(input.tokenHash, { ...input, revokedAt: null, createdAt: Date.now() });
    },
    async getAccessToken(tokenHash, nowSec) {
      const row = tokens.get(tokenHash);
      if (!row || row.revokedAt !== null || row.expiresAt <= nowSec) return null;
      return row;
    },
    async rotateRefresh(refreshHash, nowSec) {
      const row = [...tokens.values()].find((t) => t.refreshHash === refreshHash);
      if (!row || row.revokedAt !== null) return null;
      if (row.createdAt + REFRESH_TTL_MS < nowSec * 1000) return null;
      row.revokedAt = nowSec;
      return row;
    },
    async revokeToken(tokenHash) {
      const row = tokens.get(tokenHash);
      if (row) row.revokedAt = Date.now();
    },
  };
  return { store, clients, codes, tokens };
}

function buildApp(oauth: OAuthStore, hasConnection?: (db: Db, orgId: string) => Promise<boolean>) {
  return createOAuthRoutes({
    session: async () => USER,
    store: memberStore(),
    oauth,
    orgs: async () => [{ id: "o1", name: "Test Org", slug: null, role: "admin" }],
    ctx: { db: {} as unknown as Db, auth: {} as unknown as Auth },
    ...(hasConnection ? { hasConnection } : {}),
  });
}

function req(app: ReturnType<typeof buildApp>, path: string, body?: unknown, method = "GET", form = false) {
  return app.request(
    path,
    {
      method,
      headers: { "Content-Type": form ? "application/x-www-form-urlencoded" : "application/json" },
      body: body === undefined ? undefined : form ? new URLSearchParams(body as Record<string, string>).toString() : JSON.stringify(body),
    },
    ENV,
  );
}

describe("OAuth discovery metadata", () => {
  it("serves protected-resource and authorization-server metadata", async () => {
    const app = buildApp(memoryOAuth().store);
    const pr = (await (await req(app, "/.well-known/oauth-protected-resource")).json()) as {
      resource: string;
      authorization_servers: string[];
    };
    expect(pr.resource).toBe("https://app.test/mcp");
    expect(pr.authorization_servers).toEqual(["https://app.test"]);
    const as = (await (await req(app, "/.well-known/oauth-authorization-server")).json()) as {
      issuer: string;
      code_challenge_methods_supported: string[];
      token_endpoint_auth_methods_supported: string[];
    };
    expect(as.issuer).toBe("https://app.test");
    expect(as.code_challenge_methods_supported).toEqual(["S256"]);
    expect(as.token_endpoint_auth_methods_supported).toEqual(["none"]);
  });
});

describe("OAuth client registration", () => {
  it("registers a public client and rejects bad redirect URIs", async () => {
    const app = buildApp(memoryOAuth().store);
    const ok = await req(app, "/oauth/register", { redirect_uris: ["https://claude.ai/api/mcp/auth_callback"], client_name: "Claude" }, "POST");
    expect(ok.status).toBe(201);
    const body = (await ok.json()) as { client_id: string; token_endpoint_auth_method: string };
    expect(body.client_id).toBeTruthy();
    expect(body.token_endpoint_auth_method).toBe("none");
    const bad = await req(app, "/oauth/register", { redirect_uris: ["not-a-url"] }, "POST");
    expect(bad.status).toBe(400);
    const http = await req(app, "/oauth/register", { redirect_uris: ["http://evil.example/cb"] }, "POST");
    expect(http.status).toBe(400);
    const loopback = await req(app, "/oauth/register", { redirect_uris: ["http://localhost:6274/callback"] }, "POST");
    expect(loopback.status).toBe(201);
  });
});

describe("OAuth authorize + code flow", () => {
  async function registeredClient() {
    const { store } = memoryOAuth();
    const app = buildApp(store);
    const res = await req(app, "/oauth/register", { redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] }, "POST");
    const { client_id } = (await res.json()) as { client_id: string };
    return { app, client_id };
  }

  it("renders consent for valid requests and guards org membership", async () => {
    const { app, client_id } = await registeredClient();
    const good = await req(
      app,
      `/oauth/authorize?response_type=code&client_id=${client_id}&redirect_uri=${encodeURIComponent("https://claude.ai/api/mcp/auth_callback")}&code_challenge=abc123challenge&code_challenge_method=S256&orgId=o1&state=xyz`,
    );
    expect(good.status).toBe(200);
    const consentHtml = await good.text();
    expect(consentHtml).toContain("Approve");
    // The approve button must never be disabled before submit: disabled
    // controls are excluded from the POST body, which would drop
    // decision=approve and fail authorization with access_denied.
    expect(consentHtml).not.toContain("disabled=true");
    expect(consentHtml).toContain("Authorizing...");
    const forbidden = await req(
      app,
      `/oauth/authorize?response_type=code&client_id=${client_id}&redirect_uri=${encodeURIComponent("https://claude.ai/api/mcp/auth_callback")}&code_challenge=abc&orgId=o2`,
    );
    expect(forbidden.status).toBe(403);
    const badClient = await req(app, `/oauth/authorize?response_type=code&client_id=nope&redirect_uri=https://x&code_challenge=abc&orgId=o1`);
    expect(badClient.status).toBe(400);
  });

  it("renders a workspace picker when orgId is absent (OAuth clients don't know orgs)", async () => {
    const { app, client_id } = await registeredClient();
    const res = await req(
      app,
      `/oauth/authorize?response_type=code&client_id=${client_id}&redirect_uri=${encodeURIComponent("https://claude.ai/api/mcp/auth_callback")}&code_challenge=abc123challenge&code_challenge_method=S256&state=xyz&scope=sidekick`,
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('name="orgId"');
    expect(html).toContain("Test Org");
  });

  it("issues a code on approve and completes PKCE exchange", async () => {
    const { app, client_id } = await registeredClient();
    const redirect = "https://claude.ai/api/mcp/auth_callback";
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const challenge = await pkceS256Challenge(verifier);
    const approve = await req(
      app,
      "/oauth/authorize?orgId=o1",
      { client_id, redirect_uri: redirect, scope: "sidekick", state: "s1", code_challenge: challenge, orgId: "o1", decision: "approve" },
      "POST",
      true,
    );
    expect(approve.status).toBe(302);
    const location = approve.headers.get("location") ?? "";
    expect(location.startsWith(redirect)).toBe(true);
    const code = new URL(location).searchParams.get("code");
    expect(code).toBeTruthy();

    const token = await req(
      app,
      "/oauth/token",
      { grant_type: "authorization_code", code, redirect_uri: redirect, client_id, code_verifier: verifier },
      "POST",
      true,
    );
    expect(token.status).toBe(200);
    const tokens = (await token.json()) as { access_token: string; refresh_token: string; token_type: string };
    expect(tokens.token_type).toBe("Bearer");
    expect(tokens.access_token.startsWith("bsoa_")).toBe(true);

    // Single-use code: replay fails.
    const replay = await req(
      app,
      "/oauth/token",
      { grant_type: "authorization_code", code, redirect_uri: redirect, client_id, code_verifier: verifier },
      "POST",
      true,
    );
    expect(replay.status).toBe(400);

    // Refresh rotation works; old refresh is single-use.
    const refreshed = await req(app, "/oauth/token", { grant_type: "refresh_token", refresh_token: tokens.refresh_token }, "POST", true);
    expect(refreshed.status).toBe(200);
    const again = await req(app, "/oauth/token", { grant_type: "refresh_token", refresh_token: tokens.refresh_token }, "POST", true);
    expect(again.status).toBe(400);
  });

  it("fails immediately when the workspace has no connected platform", async () => {
    const { store } = memoryOAuth();
    const noneConnected = async () => false;
    const app = buildApp(store, noneConnected);
    const reg = await req(app, "/oauth/register", { redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] }, "POST");
    const { client_id } = (await reg.json()) as { client_id: string };
    const redirect = "https://claude.ai/api/mcp/auth_callback";

    const get = await req(
      app,
      `/oauth/authorize?response_type=code&client_id=${client_id}&redirect_uri=${encodeURIComponent(redirect)}&code_challenge=abc123challenge&code_challenge_method=S256&orgId=o1`,
    );
    expect(get.status).toBe(409);
    expect(await get.text()).toContain("No platform connected");

    const post = await req(
      app,
      "/oauth/authorize?orgId=o1",
      { client_id, redirect_uri: redirect, scope: "", code_challenge: "abc", orgId: "o1", decision: "approve" },
      "POST",
      true,
    );
    expect(post.status).toBe(409);
    expect(await post.text()).toContain("No platform connected");
  });

  it("rejects wrong verifier and denied consent", async () => {
    const { app, client_id } = await registeredClient();
    const redirect = "https://claude.ai/api/mcp/auth_callback";
    const challenge = await pkceS256Challenge("correct-verifier-12345678901234567890");
    const approve = await req(
      app,
      "/oauth/authorize?orgId=o1",
      { client_id, redirect_uri: redirect, scope: "", code_challenge: challenge, orgId: "o1", decision: "approve" },
      "POST",
      true,
    );
    const code = new URL(approve.headers.get("location") ?? "").searchParams.get("code");
    const wrong = await req(
      app,
      "/oauth/token",
      { grant_type: "authorization_code", code, redirect_uri: redirect, client_id, code_verifier: "wrong-verifier" },
      "POST",
      true,
    );
    expect(wrong.status).toBe(400);
    const deny = await req(
      app,
      "/oauth/authorize?orgId=o1",
      { client_id, redirect_uri: redirect, scope: "", code_challenge: challenge, orgId: "o1", decision: "deny", state: "s9" },
      "POST",
      true,
    );
    expect(deny.status).toBe(302);
    expect(deny.headers.get("location") ?? "").toContain("error=access_denied");
  });
});
