# Safepay Payment Gateway — Verified API Contract Reference

Research deliverable for the HighLevel custom payment provider (Cloudflare Workers adapter).
Purpose: pin down the exact Safepay HTTP contracts for the 10 integration operations before implementation.
No code in this document. Every assertion is labeled.

## Legend

- **VERIFIED** — observed directly in official Safepay docs (safepay-docs.netlify.app), official SDK source (getsafepay/node-core, safepay-node, sfpy-php), or the official dashboard URLs.
- **UNVERIFIED** — not yet confirmed by any primary source; must be confirmed before implementation.
- **DISCREPANCY** — primary sources disagree or a source contradicts itself; resolve before relying on it.

## Sources consulted

| Source | Status |
|---|---|
| https://safepay-docs.netlify.app/ (all sections used) | VERIFIED, primary |
| https://apidocs.getsafepay.com/ | UNVERIFIED — Stoplight SPA, not scrapable; `openapi.json` 404; SDK examples link the raw OpenAPI to `#7fcfa13f-…` operation anchors |
| https://api-docs.getsafepay.com/ | UNVERIFIED — transport error (unreachable) |
| https://github.com/getsafepay/node-core | VERIFIED — `src/RequestSender.ts`, `src/resources.ts`, `src/resources/*.ts`, `src/Checkout.ts` |
| https://github.com/getsafepay/sfpy-php | VERIFIED — `lib/ApiRequestor.php`, `lib/Service/{PlanService,SubscriptionService,AbstractService}.php`, `examples/sdk/public/customers-payment-{ucof,cof}.php`, `examples/sdk/public/manage-subscriptions.php` |
| https://github.com/getsafepay/safepay-node | VERIFIED — `src/resources/{subscription,payments}.ts` (older SDK generation) |

## Environments and base URLs (VERIFIED)

- Sandbox: `https://sandbox.api.getsafepay.com`
- Production: `https://api.getsafepay.com`
- Dev/beta (non-standard, documented in PHP SDK): `https://dev.api.getsafepay.com`
- Test dashboard: `https://sandbox.api.getsafepay.com/dashboard/login`
- Live dashboard: `https://getsafepay.com/dashboard/login`
- Embedded Checkout builders: `https://sandbox.api.getsafepay.com/embedded/`, `https://dev.api.getsafepay.com/embedded/`, `https://getsafepay.com/embedded/`
- Each store/account requires separate KYC/approval; sandbox and live are separate accounts.

## Token prefixes (VERIFIED — observed in payloads/examples)

`cus_` customer (merchant-managed), `guest_` guest shopper, `pm_` payment method (also `method_` in some docs — DISCREPANCY), `track_` payment tracker, `ch_` charge, `auth_` authorization, `cap_` capture, `txn_` transaction, `sub_` subscription, `plan_` plan, `evt_` webhook event, `sec_` merchant API key.

---

## 1. Authentication (VERIFIED)

Server-to-server API auth is header-based, identical in both current SDKs:

- **Default (`authType: "secret"`)**: header `X-SFPY-MERCHANT-SECRET: <merchant secret key>`
- **Alternative (`authType: "jwt"`)**: header `Authorization: Bearer <jwt>`
- Standard headers on every request: `Content-Type: application/json`, `Accept: application/json`
- The public (per-request) merchant key `sec_…` is also passed **in the request body** as `merchant_api_key` for order setup.
- Public/unauthenticated paths (sfpy-php `ApiRequestor._prepareRequest`): `/user/v2/` and `/auth/v2/user/login` — any other path without a key raises an auth error client-side.
- HTTP status mapping in SDKs: 4xx body carries `status.errors`; 401 → authentication, 400 → invalid request, 404 → not found, 409 → conflict, 403 → invalid request.

DISCREPANCY: docs request examples for the Order API reuse `Authorization: Bearer <api key>` with `merchant_api_key` in body; the SDKs send `X-SFPY-MERCHANT-SECRET` for the same calls. Treat the SDK header as authoritative for server-to-server, confirm against the dashboard-generated key before relying on either.

Implication for the Worker adapter: authenticate every Safepay-bound request with `X-SFPY-MERCHANT-SECRET` from an environment binding; never expose it to the browser.

---

## 2. Customer creation (VERIFIED)

- Create: `POST /user/customers/v1/`
  - Body fields observed: `first_name`, `last_name`, `email`, `phone_number`, `country`, `is_guest`
  - **REQUIRED (VERIFIED against sandbox 2026-08-28): `country` and `phone_number`.** Without them the API returns 400 (`country: country code unrecognized or not supported; phone_number: the phone number supplied is not a number.`). Example that works: `{ "country": "PK", "phone_number": "3001234567" }` → 201 `{ "data": { "token": "cus_…" } }`.
  - Guest create `POST /user/v1/guest/` (also `/user/v2/…` guest variants) also demands a phone number (417 without it).
  - Response: `data.token` (format `cus_…`)
- Retrieve: `GET /user/customers/v1/{customer}` (customer = `cus_…` token)
- Update: `PUT /user/customers/v1/{customer}`
- Delete: `DELETE /user/customers/v1/{customer}`
- List: `GET /user/customers/v1/`
- UNVERIFIED: whether create accepts/returns additional fields (e.g. is_account_verification is only relevant at payment-setup).

---

## 3. Save a reusable payment method / card setup (VERIFIED core, UNVERIFIED vault payload)

Flow is check-verified: create a **Vault session**, render Safepay (client-side) tokenization using the session, then store the returned payment-method token; the method is stored in the customer's wallet.

- `POST /order/vault/v1/session`
- `POST /order/vault/v1/card`
- Vault session returns `401 "missing time based token"` when called server-to-server without a client time-based one-time token (VERIFIED against sandbox 2026-08-27). Tokenization is therefore browser-driven via the embedded Checkout/Vault; the Worker must keep card setup in the client/iframe layer (R003).
- Saved-method management (nodes: `Customer/PaymentMethods.ts`, `User/Cards.ts`):
  - `GET /user/customers/v1/{customer}/wallet/` — list
  - `GET /user/customers/v1/{customer}/wallet/{paymentMethod}` — get one
  - `DELETE /user/customers/v1/{customer}/wallet/{paymentMethod}` — remove
  - `GET /user/wallets/v1/`, `GET /user/wallets/v1/{instrument}`, `DELETE /user/wallets/v1/{instrument}` — alternate wallet namespace
- DISCREPANCY: docs manage-tokens page shows list/get **without** `/user` but delete **with** `/user`; the SDK uses `/user` everywhere. SDK is authoritative.
- Card-setup/hosted variant: create a payment session with `mode: "instrument"` and render the embedded Checkout; card token lands in the customer wallet.
- Account verification without charging is supported at payment-setup via `is_account_verification: true` (VERIFIED field name).
- UNVERIFIED: the exact HighLevel `verify` → Safepay mapping given the `is_account_verification` flag is a setup-time field, not a dedicated endpoint.

---

## 4. Card-on-file / instrument payment (saved method, customer may authenticate) (VERIFIED)

From official PHP SDK example `customers-payment-cof.php`; request bodies shown as passed to `order.setup` / `order.charge`:

1. Setup session: `POST /order/payments/v3/`
   ```json
   {
     "user": "cus_…",
     "merchant_api_key": "sec_…",
     "intent": "CYBERSOURCE",
     "mode": "payment",
     "entry_mode": "tms",
     "currency": "PKR",
     "amount": 600000
   }
   ```
   Response contains `tracker.token` (`track_…`).
2. Optional 3rd-party order metadata: `POST /order/payments/v3/{tracker}/metadata`
   ```json
   { "data": { "source": "your-app", "order_id": "Order-123456" } }
   ```
3. Charge (selected saved card): tracker action `POST /order/payments/v3/{tracker}`
   ```json
   { "payload": { "payment_method": { "tokenized_card": { "token": "pm_…" } } } }
   ```
4. If 3DS is required (encrypted/enrolled cards): authorize-only first with
   ```json
   { "payload": { "authorization": { "do_capture": false }, "authentication_setup": { "success_url": "…", "failure_url": "…", "device_fingerprint_session_id": "…" } } }
   ```
   A `device_fingerprint_session_id` must be supplied or the 3DS challenge will not trigger. If `veres_enrolled` is `U` (card not enrolled), the flow should halt.
5. Then authorize: `{ "payload": { "authorization": { "do_capture": false } } }` and finally capture with an empty payload (`{ "payload": {} }`, i.e. `new stdClass()`).

Note: `entry_mode: "tms"` is what identifies the transaction as using a saved payment method (token-based).

---

## 5. `unscheduled_cof` (merchant-initiated wallet top-up) (VERIFIED)

From official PHP SDK example `customers-payment-ucof.php` — this is the exact contract the HighLevel `charge_payment` maps to:

1. Setup session: `POST /order/payments/v3/`
   ```json
   {
     "user": "cus_…",
     "merchant_api_key": "sec_…",
     "intent": "CYBERSOURCE",
     "mode": "unscheduled_cof",
     "currency": "PKR",
     "amount": 600000
   }
   ```
   Response contains `tracker.token` (`track_…`).
2. Optional metadata: `POST /order/payments/v3/{tracker}/metadata` with `{ "data": { "source": "…", "order_id": "…" } }`.
3. Charge the saved card: `POST /order/payments/v3/{tracker}`
   ```json
   { "payload": { "payment_method": { "tokenized_card": { "token": "pm_…" } } } }
   ```
4. Post-payment: void (`…/{tracker}/void`) if < 24 h and not settled; else refund (`…/{tracker}/refund`).

No `entry_mode` is sent for `unscheduled_cof`; the mode itself signals merchant-initiation. `amount` is in lowest denomination (e.g. paisas; `600000` PKR example = 6000.00 PKR).

---

## 6. Native recurring subscription (creation and management)

### Creation — key finding (VERIFIED: no direct API; UNVERIFIED: exact setup fields for `mode: "subscription"`)

Neither current SDK exposes a server-to-server "create subscription" method:

- sfpy-php `SubscriptionService`: only `retrieve`, `all`, `update`, `resume`, `cancel`.
- Safepay docs: a subscription is started when the customer subscribes via Safepay Checkout (customer-facing flow), not by a direct API call.

Implication for the provider: the Worker cannot create a Safepay subscription from HighLevel `create_subscription` directly; it must (a) have a Plan, and (b) drive a checkout/subscription flow (embedded or redirect) so Safepay becomes the owner of the recurring schedule. The `subscription.created` webhook confirms creation.

- UNVERIFIED: exact `mode: "subscription"` setup request contract (setup session + which Checkout mode/`next_actions` yield the `sub_` object). Must be captured before implementing `create_subscription`.

### Plans (VERIFIED — sfpy-php `PlanService`)

- `POST /client/plans/v1/` — create
- `PUT /client/plans/v1/{planId}` — update
- `GET /client/plans/v1/{planId}` — retrieve
- `GET /client/plans/v1/search` — list
- `DELETE /client/plans/v1/{planId}` — archive (one-way; archived plans hidden from search)
- Plan behavior: `active: false` blocks new subscriptions but existing ones keep charging; `trial_period_days` only affects new subscriptions. Fields observed elsewhere: `amount` (string), `currency`, `interval` (e.g. MONTH/DAY), `type` (e.g. RECURRING), `interval_count`, `product`, `active`.

### Subscription object (VERIFIED via live sandbox `search`/`retrieve` 2026-08-27)

- Fields: `token` (`sub_…`), `plan_id` (`plan_…`), `instrument_id`, `status` (uppercase `INCOMPLETE | ACTIVE | TRAILING | PAUSED | CANCELED | UNPAID | ENDED`), `price_amount` (string), `price_currency`, `balance` (string), `transaction_id` (`txn_…`), `billing_cycle_anchor`, `current_period_start_date`, `current_period_end_date`, `canceled_at`, `created_at`, `updated_at`.

### Management endpoints (VERIFIED — sfpy-php `SubscriptionService`)

- `GET /client/subscriptions/v1/{id}` — retrieve
- `GET /client/subscriptions/v1/search` — list/filter
- `PUT /client/subscriptions/v1/{id}` — update (e.g. `billing_cycle_anchor`, `trial_end`, `pause_collection.payment_collection_behavior` to pause; cancelling vs pausing semantics: paused is resumable, cancelled is terminal)
- `PUT /client/subscriptions/v1/{id}/resumption` — resume (may create a proration/resumption transaction that must be paid before the subscription unpauses)
- `POST /client/subscriptions/v1/{id}/cancel` — cancel; only allowed from `TRAILING | INCOMPLETE | ACTIVE`; Safepay then stops automatic collection of finalized payments for the customer.

DISCREPANCY: the older `safepay-node` SDK used `POST /subscriptions/v1/{id}/cancel`, `PUT /subscriptions/v1/{id}`, `PUT /subscriptions/v1/{id}/resumption` with an `X-SFPY-MERCHANT-SECRET` header. Current path is under `/client/subscriptions/v1/` — use the current one. Verify cancellation webhook sync (`subscription.canceled`).

---

## 7. Refund / reversal / void (VERIFIED)

On the payment tracker:

- `POST /order/payments/v3/{tracker}/refund` — body: `{ "currency": "…", "amount": … }`
- `POST /order/payments/v3/{tracker}/reversal` — reverse an authorization
- `POST /order/payments/v3/{tracker}/void` — void a not-yet-settled payment (< 24 h) or a refund
- Refund webhooks: `payment.refunded` (fields `refund_amount`, `balance`, `currency`); voids emit `void.succeeded` with `void_type` and `voided_charge_id` (`cap_…`).
- UNVERIFIED: whether the HighLevel `refund` operation needs the returned (settled) `track_…` id only, or also a payment/charge id. Map from the stored transaction record.

---

## 8. `charge_payment` → client-facing checkout groundwork (implicit)

The HLC `charge_payment` operation including pre-authorize/capture/3DS is covered by the COF contract in §4 and the UCOF contract in §5. For an interactive checkout with a new card, setup uses stored-card mode + the embedded Checkout builder; its exact `setup_initiate_props` / iframe event mapping to Safepay is implementation-phase work, not a Safepay API contract.

---

## 9. Webhooks (VERIFIED)

### Signature verification

- Header: **`X-SFPY-SIGNATURE`**
- Algorithm: `HMAC-SHA512` over the **raw JSON body**, hex digest:
  `crypto.createHmac("sha512", sharedSecret).update(rawBodyJsonBuf).digest("hex")` → compare with the header value.
- The shared secret is the **dashboard "shared secret"** (Developers → Endpoints → View shared secret) — it is NOT the merchant secret key (VERIFIED against sandbox 2026-08-27: only the dashboard shared secret reproduced the received signature; R006). Store it in the `SAFEPAY_WEBHOOK_SECRET` binding.
- Replay/retry signals: the envelope carries `delivery_attempts` and `next_attempt_at` (retry timestamp). Implement idempotent handling keyed on `token` (`evt_…`).

### Envelope (VERIFIED)

`{ "token": "evt_…", "version": "2.0.0", "merchant_api_key": "sec_…", "type": "…", "endpoint": "…", "data": {…}, "created_at": {seconds, nanos} }`

### Event types (VERIFIED list)

- Payment: `payment.succeeded`, `payment.failed`, `payment.refunded`, `authorization.succeeded`, `authorization.reversed`, `void.succeeded`
- Subscription: `subscription.created`, `subscription.canceled`, `subscription.ended`, `subscription.paused`, `subscription.resumed`, `subscription.payment.succeeded`, `subscription.payment.failed`

### Notable data fields (VERIFIED from official samples)

- `payment.succeeded`: `tracker`, `intent`, `state` (e.g. `TRACKER_ENDED`), `net`, `fee`, `amount`, `currency`, `customer_email`, `metadata`, `charged_at`
- `payment.failed`: `tracker`, `state`, `category` (e.g. `PAYMENT_METHOD_ERROR`), `code`, `message`, `failed_at`
- `payfault.refunded`: `tracker`, `balance`, `currency`, `refund_amount`, `refunded_at`
- `subscription.payment.succeeded`: `id` (`sub_…`), `plan_id`, `status`, `amount`, `currency`, `transaction_id` (`txn_…`), `transaction_status: "COMPLETE"` — this is the signal to sync a successful recurring charge back to HighLevel.
- `subscription.payment.failed`: same shape with `transaction_status: "FAILED"`, `transaction_error_code`, `transaction_error_message`.

DISCREPANCY (RESOLVED by live capture 2026-08-27, U008/R005): the documented `subscription.canceled` example payload contains a copy-pasted `"type": "subscription.created"`. A real sandbox `subscription.canceled` delivery (verified) carries the envelope `type: "subscription.canceled"` and `data`: `id` (`sub_…`), `plan_id`, `customer_email`, `status` (UPPERCASE `CANCELED`), `amount` (int minor units), `currency`, `balance` (string), `canceled_at`/`updated_at`/`created_at` (protobuf `{seconds,…}`). `transaction_id` is ABSENT on this event type (present only on `.payment.succeeded/.failed`).

---

## 10. Sandbox test cards (VERIFIED — safepay-docs `Test Card Numbers`)

CVV/expiry values are not published on that page (UNVERIFIED).

| Scenario | Visa | Mastercard | ECI | Action |
|---|---|---|---|---|
| Successful frictionless auth | 4456 5300 0000 1005 | 5200 0000 0000 1005 | 05 | Proceed |
| Unsuccessful frictionless auth | 4456 5300 0000 1013 | 5200 0000 0000 1013 | 07 | Don't proceed |
| Attempts processing frictionless | 4456 5300 0000 1021 | 5200 0000 0000 1021 | 06 | Proceed |
| Unavailable frictionless | 4456 5300 0000 1039 | 5200 0000 0000 1039 | 07 | Proceed, no liability shift |
| Rejected frictionless | 4456 5300 0000 1047 | 5200 0000 0000 1047 | 07 | Don't proceed |
| Auth not available on lookup | 4456 5300 0000 1054 | 5200 0000 0000 1054 | — | Proceed, no liability shift |
| Enrollment check error | 4456 5300 0000 1062 | 5200 0000 0000 1062 | — | Proceed, no liability shift |
| Time-out | 4456 5300 0000 1070 | 5200 0000 0000 1070 | 07 | Proceed, no liability shift |
| Bypassed authentication | 4456 5300 0000 1088 | 5200 0000 0000 1088 | — | Proceed, no liability shift |
| Successful step-up (3DS) | 4000 0000 0000 2503, 4456 5300 0000 1096 | 5200 0000 0000 1096 | 05 | Proceed |
| Unsuccessful step-up | 4456 5300 0000 1104 | 5200 0000 0000 1104 | 07 | Don't proceed |
| Unavailable step-up | 4456 5300 0000 1112 | 5200 0000 0000 1112 | 07 | Retry or no liability shift |

---

## Open uncertainties (UNVERIFIED — log entries in `docs/decision-log.md`)

1. ~~Vault session/card payloads~~ — RESOLVED (R003): Vault requires a browser time-based token; tokenization is client-side. UNVERIFIED only the full embedded-Checkout `setup_initiate_props` field mapping (implementation-phase).
2. ~~`mode: "subscription"` setup contract~~ — RESOLVED (R002/R004): no server-side subscription-create; a subscription is created via customer-facing Checkout and confirmed by `subscription.created`. Exact `next_actions` returned to the iframe remain implementation-phase.
3. Whether `intent` accepts values other than `CYBERSOURCE`/`KLICK` and how `KLICK` differs.
4. ~~Test card CVV/expiry / webhook secret~~ — RESOLVED (R006): the webhook shared secret is the dashboard shared secret; test-card CVV/expiry still unpublished (U004/U020).
5. ~~`method_` vs `pm_` token prefix~~ — REVISED (R002 + R035): customers are `cus_…`; the **customer wallet list returns payment methods as `pm_<uuid>` tokens** (observed live on the sandbox), not `inst_…`. The charge action object also exposes the token as `card_<uuid>` (`action.payment_method.token`); the `pm_` wallet token is the value passed to `tokenized_card.token` for `unscheduled_cof`.
6. ~~Order API authentication~~ — RESOLVED (R001/R006): `X-SFPY-MERCHANT-SECRET` is authoritative for API calls; webhooks use the dashboard shared secret.
7. HighLevel `refund` needs `track_` only, or also a charge id — still OPEN (map from stored transaction record).
8. `PayerAuthentication` rendering inside HighLevel's iframe + post-3DS terminal semantics (U016) — OPEN until live E2E.
9. ~~`do_card_on_file` cards appearing in the wallet as usable tokens~~ — RESOLVED (R035, live sandbox): setup/saved cards DO appear in the customer wallet as `pm_…` tokens with `cybersource` metadata, and charging one via `unscheduled_cof` (`tokenized_card.token = pm_…`) settles to `TRACKER_ENDED` with an authorization. This unlocks wallet auto-recharge and `addCardOnFileSupported`. See "Wallet list — VERIFIED R035" in the appendix.

## Appendix — 2026-08-28 sandbox session probing (VERIFIED against `https://sandbox.api.getsafepay.com`)

Session creation and the Atoms client flow were probed live. All shapes below were observed on the wire.

### Session create (`POST /order/payments/v3/`) — response envelope

Status 201. The tracker lives under **`data.tracker`** (this differs from the older doc examples that show top-level `tracker.token`):

```json
{
  "data": {
    "tracker": {
      "token": "track_…",
      "environment": "sandbox",
      "state": "TRACKER_STARTED",
      "next_actions": { "CYBERSOURCE": { "kind": "PAYER_AUTH_SETUP" } },
      "purchase_totals": { "quote_amount": { "currency": "USD", "amount": 19999 } }
    }
  },
  "status": { "errors": [], "message": "success" }
}
```

Observed `amount` is an integer in minor units (19999 = 199.99 USD). The adapter parses `data.tracker.token` first and tolerates the legacy top-level shape (`tracker.token`) as a fallback. Accepts: `mode: "payment" | "unscheduled_cof" | "instrument"`, `entry_mode: "raw" | "tms"`, `is_account_verification: true` (setup), and `metadata` (echoed back under `metadata.data`).

### Tracker retrieval — reporter endpoint, NOT the payments path

`GET /order/payments/v3/{tracker}` → **405** (that path is POST-only; POSTing an empty body → 400 "malformed request: EOF"). The correct status read is:

```
GET /reporter/api/v1/payments/{tracker}   → 200
{ "ok": true, "data": { "token": "track_…", "state": "TRACKER_ENDED", "intent": "CYBERSOURCE", "mode": "payment", "entry_mode": "raw", "client": …, "customer": …, "next_actions": …, "purchase_totals": …, "payment_method_kind": …, "is_routed": … } }
```

State mapping used by the adapter: `TRACKER_ENDED`/`TRACKER_CHARGED` → succeeded; `TRACKER_FAILED`/`TRACKER_CANCELED` → failed; otherwise pending.

### Client auth token (`POST /client/passport/v1/token`)

No request body required. Status 200:

```json
{ "data": "<base64 time-based token>" }
```

This value is handed to Atoms `CardCapture` as the client token. The Worker mints it only after the publishable key check, and never exposes secret keys to the browser.

### Customer create requirements (merged into §2 above)

`country` + `phone_number` are mandatory. `/payments/session` surfaces 422 with an actionable message when the HighLevel contact lacks either.

### Wallet list + saved-method charge — VERIFIED R035 (2026-08-30 live sandbox)

Probed against `https://sandbox.api.getsafepay.com` using a real sandbox merchant and a saved test card (last4 4242) created through the `do_card_on_file` setup flow.

**List saved methods** — `GET /user/customers/v1/{customer}/wallet/` with header `X-SFPY-MERCHANT-SECRET` → 200:

```json
{
  "data": {
    "count": 1,
    "wallet": [
      {
        "token": "pm_<uuid>",
        "customer": "cus_<uuid>",
        "kind": 1,
        "is_deleted": false,
        "billing_address": { "token": "address_<uuid>", "country": "PK", "city": "…", "street1": "…", "is_default": false },
        "cybersource": {
          "token": "tms_<uuid>",
          "customer_payment_method": "pm_<uuid>",
          "scheme": 1,
          "bin": "424242",
          "last_four": "4242",
          "expiry_month": "11",
          "expiry_year": "2030"
        },
        "usage_count": 0,
        "expires_at": { "seconds": … }
      }
    ]
  },
  "status": { "errors": [], "message": "success" }
}
```

Key facts (R035):
- Saved methods are **`pm_<uuid>`** tokens (NOT `inst_…`). Each carries the card metadata under `cybersource` (`bin`, `last_four`, `expiry_month`, `expiry_year`, `scheme`) and a `billing_address`.
- `customer`/`customer_payment_method` reference the owning `cus_…` customer.
- The `pm_` token is directly usable as the payment-method token for charging.

**Charge a saved method** — the verified `unscheduled_cof` flow with the `pm_` token:

1. `POST /order/payments/v3/` with `{ user: cus_…, merchant_api_key: <public key>, intent: "CYBERSOURCE", mode: "unscheduled_cof", currency: "USD", amount: <minor>, entry_mode: "tms" }` → 201, `data.tracker.token = track_<uuid>`, `state: TRACKER_STARTED`.
2. `POST /order/payments/v3/{tracker}` with `{ payload: { payment_method: { tokenized_card: { token: "pm_<uuid>" } } } }` → 200, `state: TRACKER_ENDED`, with `data.authorization` (token `auth_<uuid>`, `cybersource_rid`, totals) and `data.action.payment_method` exposing the card as `card_<uuid>` + `bin_number`/`last_four`/`card_type`.

The adapter's `chargeSavedMethod`/`unscheduled_cof` path is therefore verified end-to-end: SAVE (card lands in wallet) → LIST (wallet returns `pm_` + metadata) → CHARGE (`unscheduled_cof` settles). This is the contract the `save-card` persistence step will read and store.

## Cross-cutting notes for the adapter

- Monetary values: integer lowest-denomination (minor units, e.g. paisas). Store currency with every amount; no silent currency conversion.
- `amount` currently appears in some Plan docs as a string; payment amounts are integers in examples — keep currencies + units explicit at the boundary.
- No PAN/CVV anywhere. Only gateway tokens stored, encrypted at rest.