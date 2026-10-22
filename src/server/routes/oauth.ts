import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { sidekickConnections } from "../../../db/schema";
import type { Env } from "../types";
import {
  contextMiddleware,
  createContextMiddleware,
  requireSession,
  sessionGuard,
  type MemberStore,
  type SessionResolver,
} from "../middleware";
import type { Auth } from "../auth";
import type { Db } from "../repositories/db";
import { listOrgsForUser, type OrgMembership } from "../repositories";
import { drizzleOAuthStore, type OAuthStore } from "../oauth/store";
import { hashMcpToken, pkceS256Challenge, randomOpaqueToken } from "../lib/tokens";

const CODE_TTL_SEC = 600;
const ACCESS_TTL_SEC = 3600;

function baseUrl(c: { env: Env; req: { url: string } }): string {
  const base = (c.env as Env).APP_BASE_URL;
  if (base) return base.replace(/\/+$/, "");
  return new URL(c.req.url).origin;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Server-rendered pages can't load the SPA stylesheet, so this mirrors the
// app's design language (centered card on muted background, same type scale,
// dark primary action) in a self-contained <style> block.
const PAGE_CSS = [
  "body{margin:0;font-family:system-ui,-apple-system,sans-serif;background:#f4f4f5;color:#09090b;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem 1rem;box-sizing:border-box}",
  ".card{background:#fff;border:1px solid #e4e4e7;border-radius:.75rem;box-shadow:0 1px 2px rgba(0,0,0,.05);padding:1.5rem;width:100%;max-width:24rem;box-sizing:border-box}",
  "h1{font-size:1.25rem;letter-spacing:-.01em;margin:0 0 .25rem}",
  ".desc{font-size:.875rem;color:#71717a;margin:0 0 1rem;line-height:1.5}",
  "label{display:block;font-size:.875rem;font-weight:500;margin-bottom:1rem}",
  "select{width:100%;padding:.5rem .75rem;border:1px solid #e4e4e7;border-radius:.5rem;font-size:.875rem;margin-top:.375rem;background:#fff;box-sizing:border-box}",
  ".row{display:flex;gap:.5rem;margin-top:1rem}",
  ".btn{flex:1;border-radius:.5rem;padding:.55rem;font-size:.875rem;font-weight:500;cursor:pointer}",
  ".btn-primary{background:#0669ff;color:#fafafa;border:0}",
  ".btn.is-submitting{opacity:.6;cursor:not-allowed}",
  ".btn-outline{background:#fff;border:1px solid #e4e4e7;color:#18181b}",
  "a{color:inherit}",
].join("");

function pageShell(title: string, body: string): string {
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${esc(title)}</title><style>${PAGE_CSS}</style></head>` +
    `<body><div class="card">${body}</div></body></html>`
  );
}

function isLoopback(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]");
  } catch {
    return false;
  }
}

const RegisterBody = z.object({
  redirect_uris: z.array(z.string().min(1)).min(1).max(10),
  client_name: z.string().trim().min(1).max(100).optional(),
});

const AuthorizeQuery = z.object({
  response_type: z.string(),
  client_id: z.string().min(1),
  redirect_uri: z.string().min(1),
  scope: z.string().max(500).optional().default(""),
  state: z.string().max(2000).optional(),
  code_challenge: z.string().min(1).max(200).optional(),
  code_challenge_method: z.string().max(20).optional(),
  orgId: z.string().min(1).optional(),
});

export function createOAuthRoutes(deps: {
  session?: SessionResolver;
  store?: MemberStore;
  ctx?: { db?: Db; auth?: Auth };
  oauth?: OAuthStore;
  orgs?: (db: Db, userId: string) => Promise<OrgMembership[]>;
  hasConnection?: (db: Db, orgId: string) => Promise<boolean>;
} = {}) {
  const routes = new Hono<{ Bindings: Env; Variables: { db: Db } }>();
  const guard = deps.session ? sessionGuard(deps.session) : requireSession;
  const listOrgs = deps.orgs ?? listOrgsForUser;
  // True when the workspace has at least one connected platform. Defaults to
  // a live sidekick_connections lookup; fail-open (true) when the query
  // itself errors so unit-test mock DBs without the table keep working.
  const hasConnection =
    deps.hasConnection ??
    (async (db: Db, orgId: string) => {
      try {
        const rows = await db
          .select({ id: sidekickConnections.id })
          .from(sidekickConnections)
          .where(eq(sidekickConnections.organizationId, orgId))
          .limit(1);
        return rows.length > 0;
      } catch {
        return true;
      }
    });

  function noPlatformPage(c: { env: Env }, clientName: string): string {
    const base = (c.env as Env).APP_BASE_URL
      ? ((c.env as Env).APP_BASE_URL as string).replace(/\/+$/, "")
      : "";
    const connectHref = base ? `${base}/connections` : "/connections";
    return pageShell(
      "Connect a platform first",
      `<h1>No platform connected</h1>` +
        `<p class="desc"><strong>${esc(clientName)}</strong> can't connect yet — this workspace has no connected platform. Connect Spectora or ISN first, then restart the connection from your AI client.</p>` +
        `<div class="row"><a class="btn btn-primary" style="text-align:center;text-decoration:none" href="${esc(connectHref)}">Connect platform</a></div>`,
    );
  }

  routes.use("*", deps.ctx ? createContextMiddleware(deps.ctx) : contextMiddleware);

  const svc = (db: Db): OAuthStore => deps.oauth ?? drizzleOAuthStore(db);

  // RFC9728 protected-resource metadata: tells MCP clients where the AS is.
  routes.get("/.well-known/oauth-protected-resource", async (c) => {
    const base = baseUrl(c);
    return c.json({
      resource: `${base}/mcp`,
      authorization_servers: [base],
      scopes_supported: ["sidekick"],
      bearer_methods_supported: ["header"],
    });
  });

  // RFC8414 authorization-server metadata.
  routes.get("/.well-known/oauth-authorization-server", async (c) => {
    const base = baseUrl(c);
    return c.json({
      issuer: base,
      authorization_endpoint: `${base}/oauth/authorize`,
      token_endpoint: `${base}/oauth/token`,
      registration_endpoint: `${base}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["sidekick"],
    });
  });

  // RFC7591 dynamic client registration (public clients, PKCE only).
  routes.post("/oauth/register", async (c) => {
    const parsed = RegisterBody.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json({ error: "invalid_client_metadata" }, 400);
    for (const uri of parsed.data.redirect_uris) {
      let u: URL;
      try {
        u = new URL(uri);
      } catch {
        return c.json({ error: "invalid_redirect_uri" }, 400);
      }
      if (u.protocol !== "https:" && !isLoopback(uri)) {
        return c.json({ error: "invalid_redirect_uri", error_description: "redirect_uri must be https (http allowed for loopback only)" }, 400);
      }
    }
    const id = crypto.randomUUID();
    await svc(c.get("db") as Db).createClient({
      id,
      name: parsed.data.client_name ?? "MCP client",
      redirectUris: parsed.data.redirect_uris,
    });
    return c.json(
      {
        client_id: id,
        client_name: parsed.data.client_name ?? "MCP client",
        redirect_uris: parsed.data.redirect_uris,
        grant_types: ["authorization_code", "refresh_token"],
        token_endpoint_auth_method: "none",
      },
      201,
    );
  });

  function redirectError(redirectUri: string, state: string | undefined, error: string) {
    const sep = redirectUri.includes("?") ? "&" : "?";
    const params = new URLSearchParams({ error });
    if (state) params.set("state", state);
    return { url: `${redirectUri}${sep}${params.toString()}` };
  }

  // Authorization + consent. OAuth clients don't know our orgs, so orgId is
  // optional here: the consent page lists the user's workspaces and the
  // issued code is bound to the chosen one (membership re-checked on POST).
  routes.get("/oauth/authorize", guard, async (c) => {
    const q = AuthorizeQuery.safeParse(Object.fromEntries(new URL(c.req.url).searchParams.entries()));
    if (!q.success) return c.json({ error: "invalid_request" }, 400);
    const { response_type, client_id, redirect_uri, scope, state, code_challenge, code_challenge_method } = q.data;
    const requestedOrg = q.data.orgId;
    const client = await svc(c.get("db") as Db).getClient(client_id);
    if (!client) return c.json({ error: "unauthorized_client" }, 400);
    if (!client.redirectUris.includes(redirect_uri)) return c.json({ error: "invalid_redirect_uri" }, 400);
    if (response_type !== "code") return c.redirect(redirectError(redirect_uri, state, "unsupported_response_type").url, 302);
    if (!code_challenge || (code_challenge_method ?? "S256") !== "S256") {
      return c.redirect(redirectError(redirect_uri, state, "invalid_request").url, 302);
    }
    const user = c.get("user") as { id: string; email: string };
    const orgs = await listOrgs(c.get("db") as Db, user.id);
    if (requestedOrg && !orgs.some((o) => o.id === requestedOrg)) {
      return c.json({ error: "forbidden", error_description: "Not a member of this workspace" }, 403);
    }
    if (orgs.length === 0) {
      const base = baseUrl(c);
      return c.html(
        pageShell(
          "Create a workspace first",
          `<h1>No workspace yet</h1>` +
            `<p class="desc"><strong>${esc(client.name)}</strong> needs a workspace to connect to. Create one, then restart the connection from your AI client.</p>` +
            `<div class="row"><a class="btn btn-primary" style="text-align:center;text-decoration:none" href="${esc(base)}/onboarding">Create a workspace</a></div>`,
        ),
      );
    }
    // Fail immediately when the target workspace has no connected platform.
    // With several workspaces and no orgId yet, the choice is still open, so
    // the check is enforced on POST once the workspace is chosen.
    const candidateOrg = requestedOrg ?? (orgs.length === 1 ? orgs[0]!.id : null);
    if (candidateOrg && !(await hasConnection(c.get("db") as Db, candidateOrg))) {
      return c.html(noPlatformPage(c, client.name), 409);
    }
    const selected = requestedOrg ?? (orgs.length === 1 ? orgs[0]!.id : "");
    const fields: Array<[string, string]> = [
      ["client_id", client_id],
      ["redirect_uri", redirect_uri],
      ["scope", scope],
      ["code_challenge", code_challenge],
    ];
    if (state) fields.push(["state", state]);
    const options = orgs
      .map((o) => `<option value="${esc(o.id)}"${o.id === selected ? " selected" : ""}>${esc(o.name)} (${esc(o.role)})</option>`)
      .join("");
    return c.html(
      pageShell(
        `Authorize ${client.name}`,
        `<h1>Authorize ${esc(client.name)}?</h1>` +
          `<p class="desc"><strong>${esc(client.name)}</strong> is requesting AI access to your <strong>Tradesmatic</strong> workspace (signed in as ${esc(user.email)}). Tokens are scoped to the chosen organization only.</p>` +
          `<form method="post" action="/oauth/authorize">` +
          fields.map(([k, v]) => `<input type="hidden" name="${k}" value="${esc(v)}">`).join("") +
          `<label>Workspace<select name="orgId" required>${options}</select></label>` +
          `<div class="row">` +
          `<button class="btn btn-primary" type="submit" name="decision" value="approve" id="approve-btn">Approve</button>` +
          `<button class="btn btn-outline" type="submit" name="decision" value="deny">Deny</button>` +
          `</div></form>` +
          `<script>(function(){var f=document.querySelector('form[action="/oauth/authorize"]');if(!f)return;f.addEventListener("submit",function(e){if(f.dataset.submitted==="1"){e.preventDefault();return;}var s=e&&e.submitter;if(s&&s.value!=="approve")return;f.dataset.submitted="1";var b=document.getElementById("approve-btn");if(!b)return;b.textContent="Authorizing...";b.classList.add("is-submitting");b.setAttribute("aria-disabled","true");});})();</script>`,
      ),
    );
  });

  routes.post("/oauth/authorize", guard, async (c) => {
    const form = await c.req.parseBody().catch(() => ({} as Record<string, string>));
    const get = (k: string): string => (typeof form[k] === "string" ? (form[k] as string) : "");
    const client_id = get("client_id");
    const redirect_uri = get("redirect_uri");
    const scope = get("scope");
    const state = get("state") || undefined;
    const code_challenge = get("code_challenge");
    const decision = get("decision");
    const orgId = get("orgId");
    const client = await svc(c.get("db") as Db).getClient(client_id);
    if (!client || !client.redirectUris.includes(redirect_uri)) return c.json({ error: "unauthorized_client" }, 400);
    const user = c.get("user") as { id: string };
    const orgs = await listOrgs(c.get("db") as Db, user.id);
    if (!orgId || !orgs.some((o) => o.id === orgId)) {
      return c.json({ error: "forbidden", error_description: "Not a member of this workspace" }, 403);
    }
    if (!(await hasConnection(c.get("db") as Db, orgId))) {
      return c.html(noPlatformPage(c, client.name), 409);
    }
    if (decision !== "approve") return c.redirect(redirectError(redirect_uri, state, "access_denied").url, 302);
    if (!code_challenge) return c.redirect(redirectError(redirect_uri, state, "invalid_request").url, 302);
    const code = randomOpaqueToken("bsoc");
    const nowSec = Math.floor(Date.now() / 1000);
    await svc(c.get("db") as Db).createCode({
      codeHash: await hashMcpToken(code, (c.env as Env).MCP_TOKEN_PEPPER),
      clientId: client_id,
      redirectUri: redirect_uri,
      orgId,
      userId: user.id,
      scope,
      codeChallenge: code_challenge,
      expiresAt: nowSec + CODE_TTL_SEC,
    });
    const sep = redirect_uri.includes("?") ? "&" : "?";
    const params = new URLSearchParams({ code });
    if (state) params.set("state", state);
    return c.redirect(`${redirect_uri}${sep}${params.toString()}`, 302);
  });

  // Token exchange: authorization_code (PKCE) + refresh_token (rotating).
  routes.post("/oauth/token", async (c) => {
    const env = c.env as Env;
    const contentType = c.req.header("content-type") ?? "";
    const body: Record<string, string> = contentType.includes("application/x-www-form-urlencoded")
      ? Object.fromEntries(
          Object.entries((await c.req.parseBody().catch(() => ({}))) as Record<string, unknown>).map(([k, v]) => [
            k,
            typeof v === "string" ? v : "",
          ]),
        )
      : ((await c.req.json().catch(() => ({}))) as Record<string, string>);
    const grant = body.grant_type;
    const nowSec = Math.floor(Date.now() / 1000);
    const store = svc(c.get("db") as Db);

    if (grant === "authorization_code") {
      const { code, redirect_uri, client_id, code_verifier } = body;
      if (!code || !redirect_uri || !client_id || !code_verifier) {
        return c.json({ error: "invalid_request" }, 400);
      }
      const claimed = await store.consumeCode(await hashMcpToken(code, env.MCP_TOKEN_PEPPER), nowSec);
      if (!claimed || claimed.clientId !== client_id || claimed.redirectUri !== redirect_uri) {
        return c.json({ error: "invalid_grant" }, 400);
      }
      const expected = await pkceS256Challenge(code_verifier);
      if (expected !== claimed.codeChallenge) return c.json({ error: "invalid_grant" }, 400);
      const access = randomOpaqueToken("bsoa");
      const refresh = randomOpaqueToken("bsor");
      await store.createToken({
        tokenHash: await hashMcpToken(access, env.MCP_TOKEN_PEPPER),
        kind: "access",
        clientId: claimed.clientId,
        orgId: claimed.orgId,
        userId: claimed.userId,
        scope: claimed.scope,
        expiresAt: nowSec + ACCESS_TTL_SEC,
        refreshHash: await hashMcpToken(refresh, env.MCP_TOKEN_PEPPER),
      });
      return c.json({
        access_token: access,
        token_type: "Bearer",
        expires_in: ACCESS_TTL_SEC,
        refresh_token: refresh,
        scope: claimed.scope,
      });
    }

    if (grant === "refresh_token") {
      const { refresh_token, client_id } = body;
      if (!refresh_token) return c.json({ error: "invalid_request" }, 400);
      const prior = await store.rotateRefresh(await hashMcpToken(refresh_token, env.MCP_TOKEN_PEPPER), nowSec);
      if (!prior || (client_id && prior.clientId !== client_id)) return c.json({ error: "invalid_grant" }, 400);
      const access = randomOpaqueToken("bsoa");
      const refresh = randomOpaqueToken("bsor");
      await store.createToken({
        tokenHash: await hashMcpToken(access, env.MCP_TOKEN_PEPPER),
        kind: "access",
        clientId: prior.clientId,
        orgId: prior.orgId,
        userId: prior.userId,
        scope: prior.scope,
        expiresAt: nowSec + ACCESS_TTL_SEC,
        refreshHash: await hashMcpToken(refresh, env.MCP_TOKEN_PEPPER),
      });
      return c.json({
        access_token: access,
        token_type: "Bearer",
        expires_in: ACCESS_TTL_SEC,
        refresh_token: refresh,
        scope: prior.scope,
      });
    }

    return c.json({ error: "unsupported_grant_type" }, 400);
  });

  return routes;
}
