# ISN contract (authoritative local reference)

Sources: `docs/isn.yaml` (ISN REST API, v8665 — vendored spec, read the file before writing ISN code) and `https://developer.inspectionsupport.com/reference/`. Never invent ISN fields, paths, or params. When this doc and the yaml disagree, the yaml wins; record the gap in `docs/decision-log.md`.

Spec surface: **107 paths, 137 operations** (62 GET, 49 POST, 6 PUT, 20 DELETE) across 22 tags. Component schemas: `Agency`, `Agent`, `Client`, `Contact`, `ContactType`, `EscrowOffice`, `EscrowOfficer`, `Fee`, `FoundationType`, `Office`, `Order`, `OrderFee`, `OrderType`, `User`. Customer-facing surface only — ISN-internal, partner-specific and deprecated endpoints are excluded by the spec authors.

## Connection

- Base URL: `https://{host}/{companyKey}/rest` (`servers` in yaml). White-label customers use their own domain (e.g. `goisn.net`). **Host and company key are both compulsory and configurable** — never hard-code or default them (a wrong default would point credentials at the wrong tenant).
- Auth: HTTP Basic (`basicAuth` security scheme). Username = access key, password = secret access key (ISN *Settings → My Access Keys*, `/{companyKey}/access-keys`).
- Access keys **do not expire** and carry the **full privileges of the owning user** (no per-key scoping). Treat them as highly sensitive: encrypted at rest, never logged, never returned by APIs. Issue them from an account whose privileges match what the integration needs.
- Credentials may also be passed as `username`/`password` query parameters. That path still works but is **deprecated**, logs a server-side warning, and leaks credentials into access logs / browser history. **Do not use it.**
- Connection form needs ISN-shaped fields (`companyKey`, `host`, `accessKey`, `secretKey`) — the current generic form (apiKey/oauth/endpoint) does not fit ISN. Do not shoehorn; extend the form when the adapter lands.

## Sending data (content type is not uniform — getting it wrong fails quietly)

| Verb | Accepts |
|---|---|
| `GET` | query string |
| `POST` | `application/json` **or** `application/x-www-form-urlencoded`; fields may also be passed as query parameters. Reads a JSON body only when `Content-Type` begins with `application/json`, otherwise reads form fields. |
| `PUT`, `DELETE` | `application/x-www-form-urlencoded` **only**. Send JSON and every field arrives empty with a `200` rather than an error. |

- The report and attachment upload endpoints are the exception: they take the raw file as the body.
- Every `requestBody` in the spec is `required: false`; a `400` lists the required fields you left out.
- Ids in paths accept a UUID; some endpoints also accept the numeric id (`Identifier — accepts a UUID; some endpoints also accept the numeric id`).

## Responses (no single envelope)

There is **no guaranteed envelope**. Convention is a JSON object with `status: ok | error` plus a payload key named after the resource (`orders`, `order`, `clients`, `agent`, …) and a `message` string (empty on success), but several endpoints deviate — each operation documents its own shape. **Always check `status` before reading payloads**; `error` + `message` is a failure, not data.

Known deviations / notable shapes (all from the yaml):

- `GET /calendarevents` → `{events[], message, status}`, not `calendarevents`.
- `POST /agent/recalculateeagentsstats` → `{agents[], message, status}`.
- `GET /me` → `{me, …}`; `GET /time` → `{client, time}`; `GET /build` → `{build}`; `GET /companykey` → `{companykey}`.
- `GET /orderfiles` → `{files}` with `start?`/`end?` filters; `GET /propertyphotos` → `{photos}`; `GET /propertyphoto` → `{url}`.
- `GET /availableslots` → `{count, daysahead, offset, services, slots, zip, …}`.
- `POST /order/complete` → `{message, reportnumber, status}`; `GET /completeorder` / `POST /completeorder` take `{id?, uuid?, reportnumber?}`.
- `POST /order` (create) returns `{controls_errors, convenience_fee, coupons, id, modified, oid, packages, status, …}`, not the full order. `POST /order/{id}` (update) returns `{controls, coupons, id, modified, oid, packages, status, …}`.
- `PUT /attachmentupload`, `PUT /reportupload/{id}` return `{bin, file, id, key, size, message, status}`.
- `PUT /orders/addreporturl` returns `{id, message, status, url}`.
- `DELETE /report/{id}` returns `{message, status, uuid}`.
- Error `400` on single-record GETs (e.g. `GET /agent/{id}`, `GET /order/{id}`) returns `{status: error, message, agent: {} / order: {} / events: {} + sql: {}}` — empty-object payload, not the resource schema.

## Errors

- Unrecognised endpoint returns **405**, not 404 — do not use 404 to probe for a path's existence (`NoAction` response).
- `400` = invalid request; body lists missing required fields.
- `401` = missing/invalid credentials. `403` = credentials accepted but the owning account lacks the privilege the endpoint needs. `500` = server error.
- All error bodies carry `status: error` + `message`.

## Rate limiting / polling

- The API is **not** rate limited. Be considerate anyway: poll on a sensible interval, use the `after` filter to fetch only what changed, back off on error.
- Incremental polling: list endpoints echo `after` (`GET /agencies`, `/agents`, `/clients`, `/orders` take `after?`; `/agents` and `/clients` also take `real_last_change?` and `uuids?`; `/orders` also takes `agentuuid?`, `completed?`, `datetimeafter?`, `datetimebefore?`, `insuranceagentuuid?`, `uuids?`). Responses echo `after` and return `count` (records returned). Cursor semantics against canonical `cursor` are **not yet mapped** — verify against live responses before claiming production-grade paging.

## Path precedence

Some paths overlap (`/order/complete` vs `/order/{id}`). Named segments always win over the parameter form, so `/order/complete` is the complete-order action, never an order with id `complete`. Same pattern applies to `/agent/lookup`, `/client/lookup`, `/contact/lookup`, `/escrowofficer/lookup`, `/orders/search`, `/orders/footprint(s)`, etc.

## Two read surfaces: `/rest` (index) vs `/json` (full detail)

The credential base path is `https://{host}/{companyKey}/`. Two prefixes hang off it, with **different payloads for the same resource**:

- **`/rest/...`** — the documented catalog above. `/rest/orders` returns *index* rows (identifiers, status, minimal fields; no money, no `*_display` names). Bare `/rest/orders` returns the **whole collection** (probed 2026-10-17: 45,782 rows, ~7 MB), so a date filter is mandatory for anything but a toy tenant. `/rest/orders` filters on `datetimeafter`/`datetimebefore` (whole days) and `completed` (global, not window-scoped); it IGNORES `start`/`end`.
- **`/json/...`** — full-detail order reads, live-probed 2026-10-18.

### `GET /json/orders` (live-probed 2026-10-18)

| Property | Verified behaviour |
|---|---|
| Required params | **Both `start` and `end`**, ISO 8601 (`YYYY-MM-DDTHH:MM:SS`). Missing/garbage → `400 {message}`. |
| Params ignored | `completed`, `canceled`, `limit`, `after`, … are all **ignored** — every variant returned the identical full window. Filter client-side; no pagination needed. |
| Response | A **bare top-level JSON array** (keys `"0","1","2",…`). **No `{status,count,after,orders}` envelope** — do NOT run `checkEnvelope` here. |
| Money | **`total_fee`** (dollar float, e.g. `140.33`). Minor units = `Math.round(total_fee * 100)`. (`totalfee` is a different field, only on `/rest/order/{id}`.) |
| Names | `client_display`, `agent_display`, `agency_display`, `inspector1_display`…`inspector10_display` (+ matching `inspectorN_requested`) carry **real names**, not identifiers. |
| Deletion | `show: "yes" | "no"`. `"no"` = soft-deleted (probed: 57 of 502 in a 30-day window) — drop these. |
| Cancellation | `canceled: "yes" | "no"` + `canceled_date`. This IS an explicit per-row flag → cancellation counts are exact. |
| Completion | **Not present.** No `complete`, `completeddatetime`, `paid`, `invoicenumber`, `fees[]`, `services`, `packages`, or `ordertype` on `/json`. Derive completion from the scheduled `datetime` (past + not canceled ⇒ completed). |
| `datetime` | Scheduled time, **no timezone** (`2026-09-18T08:00:00`). Parsed as Worker-local (UTC); windows are day-aligned so boundary skew is documented. |
| `report_number` | Present on **both** active and canceled rows → **not** a completion signal. |
| Other fields | `id`, `oid`, `modified`, `address`/`address1`/`address2`/`city`/`state`/`postal_code`, `square_feet`, `year_built`, `client_email`/`client_mobile`, `agent_email`/`agent_mobile`, `agency_id`/`agency_name`. |

Sampled 30-day window (`start=2026-09-18T00:00:00&end=2026-10-18T00:00:00`, org "Guardian"): **502 rows → 445 `show:"yes"`, 57 `show:"no"`; 101 `canceled:"yes"` → 344 active**; revenue sum $184,419.33, avg ticket $536.10, 4 zero-fee orders.

Windowed reads therefore use `/json/orders`; un-windowed listing (public MCP `search_orders` with no `from`/`to`) keeps `/rest/orders`. See `src/server/providers/isn/{client,adapter,mapper}.ts`.


## Privileges

- Many mutations require the **OWNER** privilege (39 ops): all `POST /agency`, `/agent`, `/contact`, `/contacttype`, `/coupon`, `/escrowoffice(r)`, `/fee`, `/foundationtype`, `/office`, `/ordertype`, `/referreason`, `/service`, `/user` creates/updates, plus `POST /calculateservicequote`, `POST /calendarevent(/ {id})`, `POST /cancelreason(/ {id})`, `POST /agent/recalculateeagentsstats`, `GET /offices`, `GET /orderfiles`, `GET /propertyphotos`, `DELETE /service/{id}`, `GET /user/{id}`. A non-owner key gets `403`.
- `POST /order` (create) requires "a specific account privilege" (spec wording — do not assume which; probe live).
- Assume nothing else about required fields: `400` is the source of truth at runtime.

## Read catalog (complete, per yaml tags)

Conventions: `q?` = free-text search; `after?` = incremental filter; `{id}` = UUID (some accept numeric). Response key is the payload alongside `status`/`message`/`count`.

Pagination: no list endpoint takes limit/page/size params — a read returns the whole matching collection and the canonical MCP `limit` is ignored by ISN. The adapter retains it under a client-side memory backstop (50,000, env `ISN_SAFETY_LIMIT`) and surfaces the pre-slice mapped length as `totalEstimate` (capped by the vendor `count` when present, so rows the mapper deliberately drops — soft-deleted orders — never read as truncation), so if the backstop ever binds the shortfall shows up as truncation (count beyond returned items with no cursor → narrow filters/windows) instead of a silently smaller total.

### Orders (order-native — no vocabulary translation, unlike Spectora)

| Method + path | Params | Response |
|---|---|---|
| `GET /orders` | `after?`, `agentuuid?`, `completed?` (bool), `datetimeafter?`, `datetimebefore?`, `insuranceagentuuid?`, `uuids?`. Extra path segments ignored. | `{orders: Order[], count, after?, status}` |
| `GET /orders/search` | `address1?`, `datetime?`, `reportnumber?`, `year?` | `{orders: Order[], count, status}` |
| `GET /order/{id}` | path `id`; query `withallcontrols?` (bool), `withpropertyphoto?` (bool) | `{order: Order, message, status}` |
| `GET /order/fees/{id}` | path `id` | order-fees payload |
| `GET /orderfees/{id}` | path `id` | order-fees payload (second path form) |
| `GET /order/history/{id}` | path `id` | history payload |
| `GET /order/notes/{id}` | path `id` | notes payload |
| `GET /order/webdelivery/{id}` | path `id`, query `to?` | web-delivery URL payload |
| `GET /orders/footprints` | — | footprints payload |
| `GET /orderfiles` | `start?`, `end?`. Requires OWNER. | `{files, …}` |
| `GET /completeorder` | `uuid?` | complete-order payload |
| `GET /computeordernumber` | `uuid?` | computed order-number payload |

### Clients / Contacts (buyer/seller-side people)

| Method + path | Params | Response |
|---|---|---|
| `GET /clients` | `after?`, `real_last_change?`, `uuids?`. Extra segments ignored. | `{clients: Client[], count, after?, status}` |
| `GET /clients/search` | `q?` | `{clients, count, q, status}` |
| `GET /client/{id}` | path `id` | `{client, status}` |
| `GET /client/lookup` | Summary "by email address" but **no parameters documented in spec** — verify live before use. | `{client, message, status}` |
| `GET /contacts/search` | `q?` | contacts payload |
| `GET /contacts/{id}` | path `id` + query `after?`, `uuids?` (as documented) | contacts payload |
| `GET /contact/{id}` | path `id` | `{contact, …}` |
| `GET /contact/lookup` | "by email address", no params documented — verify live. | contact payload |
| `GET /contacttypes` | — | `{contacttypes}` |

### Agents / Agencies (referral side)

| Method + path | Params | Response |
|---|---|---|
| `GET /agents` | `after?`, `real_last_change?`, `uuids?`. Extra segments ignored. | `{agents: Agent[], count, after?, status}` |
| `GET /agents/search` | `q?` | `{agents, count, q, status}` |
| `GET /agent/{id}` | path `id` | `{agent, message, status}` |
| `GET /agent/lookup` | "by email address", no params documented — verify live. | `{agent, message, status}` |
| `GET /agencies` | `after?`, `real_last_change?`. Extra segments ignored. | `{agencies: Agency[], count, after?, status}` |
| `GET /agencies/search` | `q?` | `{agencies, count, q, status}` |
| `GET /agency` | No params documented (singular retrieve). | `{agency, message, status}` |
| `GET /escrowofficers` | — | escrow-officers payload |
| `GET /escrowofficers/search` | `q?` | escrow-officers payload |
| `GET /escrowofficer/{id}` | path `id` | escrow-officer payload |
| `GET /escrowofficer/lookup` | "by email address", no params documented — verify live. | escrow-officer payload |
| `GET /escrowoffices` | — | escrow-offices payload |
| `GET /escrowoffices/search` | `q?` | escrow-offices payload |
| `GET /escrowoffice` | No params documented (singular retrieve). | escrow-office payload |

### Calendar & availability

| Method + path | Params | Response |
|---|---|---|
| `GET /calendarevents` | `after?`, `start?`, `end?`, `noorderevents?` | `{events[], message, status}` |
| `GET /availableslots` | `daysahead?`, `inspector?`, `office?`, `offset?`, `services?`, `zip?` | `{slots, count, daysahead, offset, services, zip, …}` |

### Reference / catalog data

| Method + path | Response |
|---|---|
| `GET /ordertypes` | `{ordertypes}` |
| `GET /services` | `{services}` (`after?`, `office?`, `perceptionist?`, `withAssociations?`, `withLabels?`, `withShow?`) |
| `GET /packages` | `{packages}` (`after?`, `office?`, `withModified?`) |
| `GET /fees` | `{fees}` |
| `GET /fee/{id}` | single fee |
| `GET /coupons` | coupons (`after?`) |
| `GET /offices` | `{offices}` (requires OWNER) |
| `GET /office/{id}` | single office |
| `GET /cancelreasons` | cancel reasons |
| `GET /foundationtypes` | foundation types (`perceptionist?`) |
| `GET /referreasons` | refer reasons (`after?`) |
| `GET /costcenters` | cost centers |
| `GET /users` | users list |
| `GET /users/search` | `{users, count, q}` (`q?`) |
| `GET /user/{id}` | single user (requires OWNER) |
| `GET /emailtemplates` / `GET /emailtemplate/{id}` | templates / single template |
| `GET /emailcontainers` / `GET /emailcontainer/{id}` | containers / single container |
| `GET /propertyphotos` (requires OWNER) / `GET /propertyphoto` | `{photos}` / `{url}` |

### Utility

| Method + path | Notes |
|---|---|
| `GET /me` | Current key/user identity. |
| `GET /time` | Server time (`{client, time}`). |
| `GET /build` | Build number (`{build}`). |
| `GET /companykey` | Company-key echo (`{companykey}`). |
| `POST /calculateservicequote` | Quote engine; requires OWNER. Body: `address1?, address2?, city?, foundationtype?, office?, order?, ordertype?, package?, questions?, services?, squarefeet?, state?, yearbuilt?, zip?`. |

## Write catalog (complete per spec — OUT OF V1 SCOPE, fail-closed)

The adapter stays a **fail-closed stub until the read model is live-probed**. Every write below additionally requires provider capability + org policy + approval per the standard write rules (READ → SUGGEST → EXECUTE, audit writes, never claim success without provider confirmation). Never enable a write from spec-reading alone. `POST` accepts JSON or form (or query); `PUT`/`DELETE` accept **form only** (JSON arrives empty with `200`).

### Orders (25 ops — the order is the core entity)

- `POST /order` create (specific privilege required). Body family (~113 fields in yaml — addresses, parties `clientuuid`/`buyersagentuuid`/`sellersagentuuid`/`contacts`, scheduling `datetime`/`duration`/`officeuuid`/`ordertypeuuid`, inspectors `inspector1uuid…inspector10uuid` + `…requested` flags, property `squarefeet`/`yearbuilt`/`foundationtypeuuid`/`salesprice`, pricing `fees`/`packages`/`services`/`coupons`/`controls`/`controls-v2`/`conveniencefee`/`donotcalculateservicefees`, comms `sendemailevents`/`sendsmsevents`, delivery `ignoresignaturefordelivery`/`ignoresignaturepaymentfordelivery`/`ignorespaymentfordelivery`, notes `cs2*note` family, state flags `canceled`/`completed`/`confirmed`/`scheduled`/`inprogress`/`deleted` + `…by` actors). Full list: `docs/isn.yaml#/paths/~1order/post`.
- `POST /order/{id}` update (same body family). Returns `{controls, coupons, id, modified, oid, packages, status}`.
- `DELETE /order` (form-only, body `{uuid?}`) → `{id, message, modified, status}`.
- `POST /order/complete` + `POST /completeorder` — complete order. Body `{id?, uuid?, reportnumber?}` → `{message, reportnumber?, status}`.
- `POST /order/fee` — update one fee: `{feeid?, orderid?, value?}`.
- `POST /order/fees` — bulk update: `{orderfees?}`.
- `POST /order/reportnumber/{id}` — `{reportnumber?}`.
- `POST /order/{id}/timestamp` — `{timestamp?}`.
- `DELETE /orders/footprint` remove footprint (form-only); `POST /createfootprint` create footprint.
- `PUT /orders/addreporturl` (form-only): `{id?, public? (bool), title?, url?, uuid?}`.
- `PUT /orders/uploadattachment` (form-only): `{filename?, id?, mimetype?, public?, title?, uuid?}`.
- `PUT /orders/uploadreport/{id}` (form-only): `{filename?, id?, mimetype?, title?, url?, uuid?}`.

### People (client / contact / agent / agency / escrow)

- `POST /client` create, `POST /client/{id}` update, `DELETE /client/{id}` (form-only). Body: address (`address1/2`, `city`, `state`, `zip`, `latitude`, `longitude`), names (`first`/`firstname`, `last`/`lastname`, `display`, `displayname`), comms (`email`/`emailaddress`, `cellphone`/`mobilephone`/`homephone`/`workphone`, `homefax`/`workfax`), opt-outs (`emailevent-optout`, `maillist-optout`, `sendsms-optout`), misc (`birthdayday/month`, `notes`, `privatenotes`, `show?` bool, `url`).
- `POST /contact`, `POST /contact/{id}`, `DELETE /contact/{id}` — same family + `pager`.
- `POST /agent` (OWNER), `POST /agent/{id}` (OWNER), `DELETE /agent/{id}` — same family + `agency`/`agencyuuid`, `bio`, `linkagencyaddress`.
- `POST /agent/recalculateeagentsstats` (OWNER): `{agents?}` → `{agents[], message, status}`.
- `POST /agency` (OWNER), `POST /agency/{id}` (OWNER), `DELETE /agency/{id}` — agency body: `name`, `displayname`, `office`, `address1/2`, `city/state/zip`, `phone`, `brokername/phone/email`, `emailaddress`, `fax`, `url`, `notes`, `latitude/longitude`, `show?`.
- `POST /escrowofficer` (OWNER), `POST /escrowofficer/{id}` (OWNER), `DELETE /escrowofficer/{id}`; `POST /escrowoffice`, `POST /escrowoffice/{id}`, `DELETE /escrowoffice/{id}`.

### Calendar

- `POST /calendarevent` create (OWNER): `{uuid?, created?, createdbyid?, cs2id?, end?, googleaccount?, googlecalendarid?, ownerid?, recurring?, recurringtype?, show?, start?, title?, where?}`.
- `POST /calendarevent/{id}` update (OWNER): same + `deleted?`, `deletedbyid?`.
- `DELETE /calendarevent` (form-only, `{uuid?}`).

### Catalog / reference writes (mostly OWNER)

- `POST /ordertype` (OWNER) / `POST /ordertype/{id}` (OWNER) / `DELETE /ordertype/{id}`: `{name?, office?, publicdescription?, sequence?, show?}`.
- `POST /service` (OWNER) / `POST /service/{id}` (OWNER) / `DELETE /service/{id}` (OWNER).
- `POST /fee` (OWNER) / `POST /fee/{id}` (OWNER) / `DELETE /fee` (form `{uuid?}`): fee body `{basefee?, county?, coupon?, defaultvalue?, foundation?, mileage?, name?, ordertype?, propertyage?, reinspection?, salesprice?, sequence?, servicedescription?, show?, taxable?, zipcode?}`.
- `POST /coupon` (OWNER) / `POST /coupon/{id}` (OWNER) / `DELETE /coupon` (form-only).
- `POST /office` (OWNER) / `POST /office/{id}` (OWNER).
- `POST /user` (OWNER) / `POST /user/{id}` (OWNER).
- `POST /contacttype` (OWNER) / `POST /contacttype/{id}` (OWNER).
- `POST /cancelreason` (OWNER) / `POST /cancelreason/{id}` (OWNER) / `DELETE /cancelreason` (form-only).
- `POST /foundationtype` (OWNER) / `POST /foundationtype/{id}` (OWNER) / `DELETE /foundationtype` (form-only).
- `POST /referreason` (OWNER) / `POST /referreason/{id}` (OWNER) / `DELETE /referreason` (form-only).
- Email: `POST /emailtemplate`, `POST /emailtemplate/{id}`, `DELETE /emailtemplate/{id}`; `POST /emailcontainer`, `POST /emailcontainer/{id}`, `DELETE /emailcontainer/{id}`.

### Files & uploads

- `PUT /attachmentupload` (form-only: `{filename?, id?, mimetype?, public?, title?, uuid?}`) → `{bin, file, id, key, size, status}`.
- `PUT /reportupload/{id}` (form-only, same fields) → same shape.
- `PUT /propertyphotoupload` (form-only: `{id?, uuid?}`).
- `DELETE /attachment/{id}` (form-only) → `{id, message, status}`; `DELETE /report/{id}` (form-only) → `{message, status, uuid}`.

## V1 read → canonical mapping

| ISN endpoint | Shape | Canonical |
|---|---|---|
| `GET /orders` (+ `after?`, `agentuuid?`, `completed?`, `datetimeafter?`, `datetimebefore?`, `uuids?`) | `{orders[], count, after?, status}` | orders |
| `GET /orders/search` (`address1?`, `datetime?`, `reportnumber?`, `year?`) | `{orders[], count, status}` | orders (search) |
| `GET /order/{id}` (`withallcontrols?`, `withpropertyphoto?`; id = UUID, some endpoints numeric too) | `{order, message, status}` | order |
| `GET /clients` (`after?`, `real_last_change?`, `uuids?`) | `{clients[], count, after?, status}` | clients (list) |
| `GET /clients/search?q=` | `{clients[], count, q, status}` | clients |
| `GET /client/{id}` | `{client?, message?, status}` | client |
| `GET /agents` (`after?`, `real_last_change?`, `uuids?`) | `{agents[], count, after?, status}` | agents (list) |
| `GET /agents/search?q=` | `{agents[], count, q, status}` | agents |
| `GET /agent/{id}` | `{agent?, message?, status}` | agent |
| `GET /calendarevents` (`after?`, `start?`, `end?`, `noorderevents?`) | `{events[], message, status}` | events |

ISN is order-native already (`/orders`, `/order/{id}`) — no vocabulary translation needed, unlike Spectora.

## Pagination / polling (unverified)

List responses return `count` (records returned). `/clients`, `/agents`, `/orders`, `/agencies` echo an `after` filter for incremental polling (plus `real_last_change`/`uuids` on people lists, datetime/agent filters on orders). Cursor semantics against canonical `cursor` are **not yet mapped** — verify against live responses before claiming production-grade paging.

## V1 scope — writes are documented, not enabled

The spec includes the full mutating surface above (`POST /order`, `POST /order/{id}`, deletes, fee/report/timestamp writes, people/agency/escrow writes, catalog writes, uploads). The ISN adapter stays a fail-closed stub until the read model is live-probed; write actions additionally require provider capability + org policy + approval per the standard write rules. Never enable a write from spec-reading alone.

## Do not assume

- Field-level record mapping (Client/Order/Agent schemas in `docs/isn.yaml#/components/schemas/*`) is unread until a live probe returns real payloads. Map fields only from observed responses. Many schema fields are `Type varies; check a sample response` or `May be returned as more than one type` — do not hard-code types.
- Lookup endpoints (`/agent/lookup`, `/client/lookup`, `/contact/lookup`, `/escrowofficer/lookup`) say "by email address" but document **no query parameters** — verify the actual param live before wiring `search_*` to them.
- Company-key scoping, white-label hosts, and key-privilege implications when designing multi-tenant storage.
- `POST /order` requires "a specific account privilege" (spec does not name it) — probe, do not guess.
- `GET /agency` and `GET /escrowoffice` document no id param — confirm whether they read query state or are spec gaps before using.
