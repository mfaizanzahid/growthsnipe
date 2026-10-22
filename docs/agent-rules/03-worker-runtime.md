# Worker runtime

Write code for Cloudflare Workers.

Prefer:
- fetch
- Web Crypto
- URL
- Request/Response
- Hono
- D1
- Drizzle

Avoid Node built-ins unless explicitly supported by the current Workers runtime and the dependency has been tested in this project. Do not use `Buffer` in Worker runtime code — use `Uint8Array` + Web Crypto helpers in `src/server/lib/crypto.ts`.

Any SDK compatibility claim must be verified by:
- bundling
- local Wrangler execution
- a real test call against Safepay Sandbox where safe
