# Payment safety

Payment code is high-risk.

Rules:
- No raw card data (no PAN/CVV). Only gateway tokens (`cus_`, `pm_`, `track_`, `ch_`).
- No secrets in frontend bundles (Safepay secret, webhook secret, Resend key, auth secrets stay server-side).
- All payment mutation endpoints require idempotency (idempotency table + unique invoice/payment keys).
- Webhooks are verified (HMAC-SHA512, constant-time compare, `evt_` replay protection) before state mutation.
- Treat async gateway success as untrusted until the tracker/webhook confirms it.
- Use integer minor units for monetary values at provider boundaries.
- Store currency with every money value. USD only — do not silently convert.
- Cron advances `nextCharge` only after a successful charge (failed charges stay retryable).
