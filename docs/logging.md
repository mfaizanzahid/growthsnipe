# Application Logs

Platform-wide event and error log for the superadmin console. One row per
captured error or major domain event, across every account.

## Quick facts

| | |
|---|---|
| **Storage** | D1 table `app_logs` (migrations `0027_app_logs.sql`, `0028_app_logs_geo.sql`) |
| **Retention** | 90 days (default; `LOG_RETENTION_DAYS` overrides) |
| **Pagination** | 50 rows/page, newest first, max 100/page |
| **Search** | Free text over message, event, user email, workspace, path |
| **Filters** | Level, surface, date range |
| **Origin** | City + country resolved by Cloudflare from the client IP (`request.cf`) |
| **PII** | IP + user agent + city/country stored; passwords, tokens and secrets never stored |

## Surfaces and events

| Surface | Events |
|---|---|
| `api` | `http.5xx`, `http.unhandled_error` |
| `auth` | `auth.signup`, `auth.login`, `auth.login_failed`, `auth.signup_failed`, `auth.logout`, `auth.magic_link_requested`, `auth.magic_link_consumed`, `auth.password_reset_requested`, `auth.password_reset_completed`, `auth.email_verified` |
| `billing` | `billing.charge_succeeded`, `billing.charge_failed`, `billing.subscription_started`, `billing.plan_changed`, `billing.subscription_cancelled` |
| `org` | `org.member_invited`, `org.member_role_changed`, `org.member_removed`, `org.member_suspended`, `org.member_reactivated` |
| `mcp` | `mcp.auth_failed`, `mcp.tool_error` |
| `webhook` | `billing.webhook_rejected` |
| `cron` | `cron.renewals`, `cron.trials`, `cron.briefings`, `cron.retention_purged` (plus `*_failed` variants) |
| `superadmin` | `superadmin.write` (every non-GET write under `/api/superadmin/*`) |

Levels: `info` (normal), `warn` (recoverable / notable), `error` (failed).

## API

### `GET /api/superadmin/logs`

Superadmin only. Query params: `q`, `level`, `surface`, `from`, `to`,
`page`, `limit`.

`from`/`to` accept `YYYY-MM-DD` (UTC, `to` inclusive of the whole day) or a
full ISO 8601 timestamp. Invalid filters return `422`.

```json
{
  "logs": [
    {
      "id": "string",
      "createdAt": "ISO 8601",
      "level": "info|warn|error",
      "event": "auth.login",
      "surface": "auth",
      "message": "POST /api/auth/sign-in/email -> 200",
      "path": "/api/auth/sign-in/email",
      "method": "POST",
      "statusCode": 200,
      "userId": "string|null",
      "userEmail": "string|null",
      "orgId": "string|null",
      "orgName": "string|null",
      "ip": "string|null",
      "userAgent": "string|null",
      "requestId": "string|null",
      "city": "string|null",
      "country": "string|null",
      "detail": "object|null"
    }
  ],
  "page": 1,
  "limit": 50,
  "total": 123,
  "hasMore": true
}
```

### `DELETE /api/superadmin/logs`

Superadmin only. Body: `{ "ids": ["<id>", ...] }` (1-500 ids). Deletes the
named rows and returns `{ "deleted": <count> }`. An empty or malformed list
returns `422`. The console's select-and-delete uses this; the delete is
itself captured as a `superadmin.write` event.

## Superadmin UI

`/superadmin/logs` — searchable table with level/surface filters, a sticky
header, expandable detail rows, per-row and select-all checkboxes with a
bulk-delete menu, a city/country column derived from the request IP, and
First/Previous/Next/Last pagination with a loading state while a page loads.

## Capture points

- `src/server/index.ts` — app-level middleware logs any response `>= 500`;
  `app.onError` logs thrown exceptions (with stack) and returns JSON instead
  of Hono's default plain-text body.
- `src/server/index.ts` — `/api/auth/*` is wrapped to map Better Auth routes
  to auth events; the email is read from the request body, never the password.
- `src/server/routes/superadmin.ts` — member-management events, plus the
  `GET /api/superadmin/logs` route.
- `src/server/billing/renewals.ts`, `changes.ts`, `trials.ts` — charge,
  plan-change, cancel and subscribe events.
- `src/server/mcp/server.ts` — provider calls that throw are logged
  (the MCP transport turns a throw into a tool error result, so it would
  otherwise be invisible outside the per-org audit log).
- `worker/index.ts` — MCP auth failures (401/402) and cron runs.

## Redaction

`detail_json` is scrubbed before it is stored. Keys matching
`password|secret|token|authorization|cookie|api_key|cvv|card_number|pan` are
replaced with `[redacted]`. Objects are walked up to depth 4, arrays are
capped at 20 entries, and strings are truncated. Request bodies, provider
payloads, and PAN/CVV are never stored.

## Failure handling

`writeAppLog` never throws. A D1 failure is reported on the console and
swallowed — logging must never break the request it is observing.

## Retention

The daily Cron (`0 3 * * *`) deletes rows older than the retention window.
The hourly tick does not. Both are identified by `controller.cron`.

## Operations

Apply the migration before deploying the code that reads the table, otherwise
`GET /api/superadmin/logs` fails:

```bash
npm run db:migrate:local    # local D1
npm run db:migrate:prod     # production D1 (Actions → Migrate production D1)
```
