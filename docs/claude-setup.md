# Claude setup

Two ways to connect. OAuth is the production path; the simple token suits owner testing.

## Option A — OAuth (recommended)

Claude connects to the Sidekick MCP over OAuth 2.1 — no tokens to copy.

### Prerequisites

1. Sign in to the SaaS dashboard and create a workspace.
2. Connect Spectora under Connections (V1 serves the Spectora connection).
3. Deploy the app to a public URL, or expose local dev with a tunnel (see below).

### Connect Claude

1. In Claude go to **Settings → Connectors → Add custom connector**.
2. Authentication: **OAuth** ("Required when the server asks" also works — the server answers 401 + discovery).
3. Enter the MCP server URL: `https://YOUR_DOMAIN/mcp`.
4. Complete the browser sign-in when prompted: pick the workspace (organization) to authorize, then approve.
4. Ask:
   - `How did my business perform recently?`
   - `What changed?`
   - `Find anything unusual.`
   - `Which clients need attention?`
   - `What should I focus on today?`

Tokens are issued per organization (1-hour access, rotating 1-year refresh) and can be cut off from the AI access page (disconnect the app or revoke the token) or by removing workspace access. Every provider write stays capability- and policy-gated and is audit-logged.

## Option B — Simple token (owner testing)

1. As org admin, open AI access in the dashboard (or `/mcp-access`) and create a token. Copy the **connector URL** shown once — it looks like `https://YOUR_DOMAIN/mcp?apiKey=bs_mcp_…`.
2. In Claude's connector settings pick Authentication: **None** and paste the connector URL as the server URL.

Same validation and org scoping as the header path (Spectora documents the same `?apiKey=` pattern for header-less clients). Caveat: tokens in URLs can leak into proxy/browser logs — fine for your own workspace testing, but use OAuth for anything shared or production.

## Local testing without Claude

- **MCP Inspector** (bearer tokens, no OAuth needed): create an org-scoped token under AI access in the dashboard (or `/mcp-access`), then connect Inspector to `http://localhost:5173/mcp` with an `Authorization: Bearer bs_mcp_…` header.
- **OAuth against local dev**: set `APP_BASE_URL` in `.dev.vars` to your public tunnel URL (e.g. the ngrok URL) and restart the dev server — OAuth discovery metadata must advertise the public URL Claude can reach, not localhost.

## Tunnels (ngrok)

```bash
ngrok http 5173
```

Then use `https://<your-ngrok-host>/mcp` as the connector URL and set `APP_BASE_URL=https://<your-ngrok-host>` in `.dev.vars` (restart `npm run dev`). ngrok free URLs change on restart — re-registering the connector may be needed.
