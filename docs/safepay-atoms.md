# Safepay Atoms

## Purpose

Safepay Atoms is a modular payment-component library for web applications. It provides Web Components and React components for secure card capture and payer authentication.

This file is the implementation guide for coding agents working in a Safepay Atoms integration or repository.

## Core Integration Rules

- Use `@sfpy/atoms` for Safepay card capture and payer authentication.
- The supported environments are `development`, `production`, `sandbox`, and `local`.
- Keep `authToken` and other credentials out of source control; examples below use placeholders only.
- HTML attributes are string-only. Use JavaScript properties / React props for objects, callbacks, booleans, and other non-string values.
- `inputStyle` must be assigned as a JavaScript property / React prop; do not stringify it into an HTML attribute.
- Do not treat payer-auth lifecycle callbacks as interchangeable. In particular, `onPayerAuthenticationRequired` is informational and is not a completion callback.
- In the combined card + authentication flow, validate card input first, confirm validity, then submit. Only initialize/open payer authentication after `onProceedToAuthentication` supplies the required session data.
- When card capture supplies a `discountBody`, forward that object to payer authentication.
- `bin_discount` and `promo_discount` are mutually exclusive within one `DiscountBody`.

## Installation

### npm

```bash
npm install @sfpy/atoms
```

### yarn

```bash
yarn add @sfpy/atoms
```

### CDN / plain HTML

```html
<script src="https://cdn.jsdelivr.net/npm/@sfpy/atoms@latest/dist/components/index.global.js"></script>
```

An alternative CDN URL used by the plain HTML example is:

```html
<script src="https://unpkg.com/@sfpy/atoms@latest/dist/components/index.global.js"></script>
```

## React Styles

Import the bundled styles when using React components:

```tsx
import '@sfpy/atoms/styles';
```

## Web Components

### Card Capture

Element:

```html
<safepay-card-atom></safepay-card-atom>
```

Example setup:

```html
<safepay-card-atom id="card-atom" environment="sandbox"></safepay-card-atom>
<script type="module">
  const cardAtom = document.getElementById('card-atom');
  cardAtom.authToken = 'your-auth-token';
  cardAtom.tracker = 'your-tracker';
  cardAtom.validationEvent = 'submit';
  cardAtom.inputStyle = {
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: '16px',
    color: '#111827',
  };
</script>
```

### Card Capture HTML Attributes

Use attributes only for string values:

| Attribute | Type | Notes |
|---|---|---|
| `environment` | `'development' \| 'production' \| 'sandbox' \| 'local'` | Environment setting |
| `authToken` | `string` | Authentication token |
| `tracker` | `string` | Tracking identifier |
| `validationEvent` | `'submit' \| 'change' \| 'keydown' \| 'none'` | Defaults to `submit` |

### Card Capture JavaScript Properties

| Property | Type | Notes |
|---|---|---|
| `environment` | environment string | Environment setting |
| `authToken` | `string` | Authentication token |
| `tracker` | `string` | Tracking identifier |
| `validationEvent` | validation event | Defaults to `submit` |
| `inputStyle` | `InputStyle` | Styles forwarded to secure iframe inputs |
| `promoCode` | `string` | Optional promo code, auto-applied after discount offers load |
| `forcePromoCode` | `boolean` | When true and `promoCode` is set, ignore BIN-based scheme discounts |
| `onReady` | `function` | Embedded iframe ready callback |
| `onError` | `function` | Error callback |
| `onValidated` | `(data) => void` | Receives `bin`, `lastFour`, and optional `cardType` |
| `onDiscountApplied` | `function` | Discount applied callback; includes `discountBody` |
| `onProceedToAuthentication` | `function` | Called when authentication should begin |
| `imperativeRef` | `CardCaptureImperativeRef` | Optional imperative ref |

### Card Capture Methods

```ts
submit(): void
validate(): void
fetchValidity(): Promise<boolean>
clear(): void
```

Typical sequence:

```ts
cardAtom.validate();
const isValid = await cardAtom.fetchValidity();
if (isValid) {
  cardAtom.submit();
}
```

### Payer Authentication

Element:

```html
<safepay-payer-authentication
  environment="sandbox"
  auth-token="your-auth-token"
  tracker="your-tracker"
></safepay-payer-authentication>
```

Structured values must be assigned as properties:

```js
const el = document.querySelector('safepay-payer-authentication');

el.billing = {
  street_1: '123 Main Street',
  street_2: 'Suite 500',
  city: 'Berlin',
  state: 'BE',
  country: 'DE',
  postal_code: '10115',
};

el.discountBody = {
  dry_run: true,
  bin_discount: { cardscheme_id: 'visa', bin: '411111' },
};
```

### Payer Authentication HTML Attributes

| Attribute | Type | Notes |
|---|---|---|
| `environment` | environment string | Environment setting |
| `tracker` | `string` | Tracking identifier |
| `authToken` | `string` | Authentication token |
| `user` | `string` | User identifier forwarded with authentication requests |
| `deviceDataCollectionJWT` | `string` | Device data collection JWT |
| `deviceDataCollectionURL` | `string` | Device data collection URL |

### Payer Authentication JavaScript Properties

| Property | Type | Notes |
|---|---|---|
| `environment` | environment string | Environment setting |
| `tracker` | `string` | Tracking identifier |
| `authToken` | `string` | Authentication token |
| `user` | `string` | User identifier |
| `billing` | `Billing` | Billing information |
| `deviceDataCollectionJWT` | `string` | Device data collection JWT |
| `deviceDataCollectionURL` | `string` | Device data collection URL |
| `discountBody` | `DiscountBody` | Discount context sent to Safepay |
| `authorizationOptions` | `AuthorizationOptions` | Authorization configuration |
| `onPayerAuthenticationFailure` | `function` | Challenge-based 3DS failure |
| `onPayerAuthenticationSuccess` | `function` | Challenge-based 3DS success; not used for frictionless auth |
| `onPayerAuthenticationRequired` | `function` | Informational step-up-required event |
| `onPayerAuthenticationFrictionless` | `function` | Terminal success for frictionless authentication |
| `onPayerAuthenticationUnavailable` | `function` | Pre-success/pre-challenge terminal failure |
| `onSafepayError` | `function` | General Safepay iframe/application error |
| `imperativeRef` | `PayerAuthenticationImperativeRef` | Optional ref |

## Payer Authentication Callback Semantics

Treat these events as distinct lifecycle states:

- `onPayerAuthenticationRequired`: enrollment determined that a 3DS challenge is needed. Use for analytics/UI state only. It is not a completion callback, and the challenge iframe may render immediately afterward.
- `onPayerAuthenticationFrictionless`: authentication completed successfully without a challenge. This is terminal success for the frictionless path.
- `onPayerAuthenticationSuccess`: challenge-based 3DS completed successfully after entering the challenge flow. It does not run for frictionless auth.
- `onPayerAuthenticationFailure`: challenge-based 3DS failed after the user entered the challenge flow.
- `onPayerAuthenticationUnavailable`: the flow failed before a successful challenge flow could be reached, including enrollment/setup failures and other pre-challenge terminal states.
- `onSafepayError`: catch-all for general Safepay iframe/application errors outside the normal authentication lifecycle.

Recommended terminal callback set:

```ts
onPayerAuthenticationFrictionless
onPayerAuthenticationSuccess
onPayerAuthenticationFailure
onPayerAuthenticationUnavailable
onSafepayError
```

`onPayerAuthenticationRequired` is normally optional.

## React Components

### CardCapture

```tsx
import { Suspense, useRef } from 'react';
import { CardCapture, Environment } from '@sfpy/atoms';

function PaymentForm() {
  const cardRef = useRef(null);

  return (
    <Suspense fallback={<div>Loading card capture...</div>}>
      <CardCapture
        environment={Environment.Sandbox}
        authToken="your-auth-token"
        tracker="your-tracker"
        validationEvent="change"
        inputStyle={{
          fontFamily: '"Courier New", ui-monospace, monospace',
          fontSize: '18px',
          color: '#111827',
        }}
        imperativeRef={cardRef}
      />
    </Suspense>
  );
}
```

### CardCapture props

Required:

| Prop | Type |
|---|---|
| `environment` | `Environment` or case-insensitive environment string |
| `authToken` | `string` |
| `tracker` | `string` |
| `validationEvent` | `'submit' \| 'change' \| 'keydown' \| 'none'` |
| `imperativeRef` | `React.MutableRefObject<any>` |

Optional:

| Prop | Type |
|---|---|
| `inputStyle` | `React.CSSProperties` |
| `promoCode` | `string` |
| `forcePromoCode` | `boolean` |
| `onReady` | `() => void` |
| `onProceedToAuthentication` | `(data: any) => void` |
| `onValidated` | `(data: CardValidatedData) => void` |
| `onDiscountApplied` | `(data: any) => void` |
| `onError` | `(error: string) => void` |

Card imperative ref shape:

```ts
type CardCaptureImperativeRef = {
  current: null | {
    submit: () => void;
    validate: () => void;
    fetchValidity: () => Promise<boolean>;
    clear: () => void;
  };
};
```

### PayerAuthentication

```tsx
import { Suspense, useRef } from 'react';
import { PayerAuthentication, Environment } from '@sfpy/atoms';

function AuthenticationForm() {
  const authRef = useRef(null);

  return (
    <Suspense fallback={<div>Loading authentication...</div>}>
      <PayerAuthentication
        environment={Environment.Sandbox}
        tracker="your-tracker"
        authToken="your-auth-token"
        deviceDataCollectionJWT="your-device-jwt"
        deviceDataCollectionURL="https://your-collection-url"
        billing={{
          street_1: '123 Main Street',
          street_2: 'Suite 500',
          city: 'Berlin',
          state: 'BE',
          country: 'DE',
          postal_code: '10115',
        }}
        authorizationOptions={{
          do_capture: true,
          do_card_on_file: true,
        }}
        imperativeRef={authRef}
      />
    </Suspense>
  );
}
```

### PayerAuthentication props

Required:

| Prop | Type |
|---|---|
| `environment` | `Environment` or case-insensitive environment string |
| `tracker` | `string` |
| `authToken` | `string` |
| `deviceDataCollectionJWT` | `string` |
| `deviceDataCollectionURL` | `string` |
| `imperativeRef` | `React.MutableRefObject<any>` |

Optional:

| Prop | Type |
|---|---|
| `discountBody` | `DiscountBody` |
| `user` | `string` |
| `billing` | `Billing` |
| `authorizationOptions` | `AuthorizationOptions` |
| `onPayerAuthenticationFailure` | `(data: PayerAuthErrorData) => void` |
| `onPayerAuthenticationSuccess` | `(data: PayerAuthSuccessData) => void` |
| `onPayerAuthenticationRequired` | `(data: PayerAuthData) => void` |
| `onPayerAuthenticationFrictionless` | `(data: PayerAuthData) => void` |
| `onPayerAuthenticationUnavailable` | `(data: PayerAuthData) => void` |
| `onSafepayError` | `(data: SafepayError) => void` |

## Combined Card + 3DS Flow

Use this flow when both card capture and payer authentication are required.

1. Render `CardCapture`.
2. On submit, call `validate()`.
3. Await `fetchValidity()`.
4. Call `submit()` only when the card is valid.
5. When `onDiscountApplied` returns a `discountBody`, store it and pass it to `PayerAuthentication`.
6. When `onProceedToAuthentication` fires, capture `accessToken` and `deviceDataCollectionURL` from the callback data.
7. Render/open the payer-authentication UI using those values.
8. Pass billing and authorization options to payer authentication.
9. Treat `onPayerAuthenticationFrictionless` and `onPayerAuthenticationSuccess` as success paths.
10. Treat `onPayerAuthenticationFailure`, `onPayerAuthenticationUnavailable`, and `onSafepayError` as failure/error terminal paths.

Representative React pattern:

```tsx
const [payerAuthSession, setPayerAuthSession] = React.useState<{
  accessToken: string;
  deviceDataCollectionURL: string;
} | null>(null);

const [discountBody, setDiscountBody] = React.useState<DiscountBody | undefined>();

const handleSubmit = React.useCallback(async () => {
  cardRef.current?.validate();
  const isValid = await cardRef.current?.fetchValidity();

  if (isValid) {
    await cardRef.current?.submit();
  }
}, []);

// CardCapture
onDiscountApplied={(data) => {
  if (data?.discountBody) {
    setDiscountBody(data.discountBody);
  }
}}

onProceedToAuthentication={(data) => {
  setPayerAuthSession({
    accessToken: data.accessToken,
    deviceDataCollectionURL: data.deviceDataCollectionURL,
  });
}}

// PayerAuthentication
<PayerAuthentication
  environment={DEMO_ENVIRONMENT}
  authToken={DEMO_AUTH_TOKEN}
  tracker={DEMO_TRACKER}
  deviceDataCollectionJWT={payerAuthSession.accessToken}
  deviceDataCollectionURL={payerAuthSession.deviceDataCollectionURL}
  billing={BILLING}
  discountBody={discountBody}
  authorizationOptions={{
    do_capture: true,
    do_card_on_file: true,
  }}
  onPayerAuthenticationFailure={closeModal}
  onPayerAuthenticationSuccess={closeModal}
  onPayerAuthenticationFrictionless={closeModal}
  onPayerAuthenticationUnavailable={closeModal}
  onSafepayError={closeModal}
/>
```

## Object Shapes

### InputStyle

```ts
type InputStyle = Record<string, string | number>;
```

Example:

```ts
const inputStyle = {
  fontFamily: '"Courier New", ui-monospace, monospace',
  fontSize: '18px',
  color: '#111827',
};
```

### Billing

`street_2`, `state`, and `postal_code` are optional.

```ts
type Billing = {
  street_1: string;
  street_2?: string;
  city: string;
  state?: string;
  country: string;
  postal_code?: string;
};
```

### AuthorizationOptions

```ts
type AuthorizationOptions = {
  do_capture?: boolean;
  do_card_on_file?: boolean;
};
```

### DiscountBody

Pass this as an object; do not stringify it.

```ts
type DiscountBody = {
  dry_run: boolean;
  bin_discount?: {
    cardscheme_id: string;
    bin: string;
  };
  promo_discount?: {
    code: string;
  };
};
```

BIN-based discount example:

```ts
const binDiscountBody = {
  dry_run: true,
  bin_discount: {
    cardscheme_id: 'visa',
    bin: '411111',
  },
};
```

Promo discount example:

```ts
const promoDiscountBody = {
  dry_run: true,
  promo_discount: {
    code: 'SAVE10',
  },
};
```

Discount rules:

- `bin` is the first six digits of the card number, without spaces.
- `dry_run` evaluates the discount without committing application when the flow supports it.
- `bin_discount` and `promo_discount` are mutually exclusive in one request.

### Imperative refs

```ts
type CardCaptureImperativeRef = {
  current: null | {
    submit: () => void;
    validate: () => void;
    fetchValidity: () => Promise<boolean>;
    clear: () => void;
  };
};

type PayerAuthenticationImperativeRef = {
  current: null | Record<string, never>;
};
```

## Environment Handling

In React, either use the `Environment` enum or a string such as `"SANDBOX"` / `"sandbox"`.

String environment values are matched case-insensitively. Invalid values throw an exception to surface a configuration error.

Preferred form:

```tsx
import { Environment } from '@sfpy/atoms';

<CardCapture environment={Environment.Sandbox} /* ... */ />
```

## Repository / Development Commands

The repository uses `pnpm`.

Install dependencies:

```bash
pnpm install
```

Build:

```bash
pnpm run build
```

## Repository Structure

```text
.
├── README.md
├── examples
│   ├── card-links-demo.html
│   └── device-metrics-demo.html
├── pnpm-lock.yaml
├── package.json
├── postcss.config.cjs
├── src
│   ├── atoms
│   │   ├── CardCaptureIframe
│   │   │   ├── iframe.tsx
│   │   │   └── index.tsx
│   │   ├── PayerAuthenticationIframe
│   │   │   ├── iframe.tsx
│   │   │   ├── index.tsx
│   │   │   └── types.ts
│   │   ├── hooks
│   │   │   ├── index.ts
│   │   │   └── useFunctionQueue.ts
│   │   └── index.ts
│   ├── bridge
│   │   ├── CardAtom.tsx
│   │   ├── PayerAuthentication.tsx
│   │   └── index.tsx
│   ├── elements
│   │   ├── CardCaptureAtom
│   │   │   └── index.ts
│   │   ├── PayerAuthenticationAtom
│   │   │   └── index.ts
│   │   └── index.ts
│   ├── errors.ts
│   ├── index.ts
│   ├── styles
│   │   ├── css
│   │   │   ├── card-link.css
│   │   │   ├── index.css
│   │   │   ├── payer-auth.css
│   │   │   └── seamless-iframe.css
│   │   ├── hooks
│   │   │   ├── index.ts
│   │   │   └── useStyles.ts
│   │   ├── index.css
│   │   ├── index.ts
│   │   └── loaders
│   │       ├── index.ts
│   │       ├── load-all.ts
│   │       ├── load-card-link.ts
│   │       ├── load-index.ts
│   │       ├── load-payer-auth.ts
│   │       └── load-seamless-iframe.ts
│   ├── types
│   │   ├── atoms.ts
│   │   ├── index.ts
│   │   └── safepay.ts
│   ├── utils
│   │   ├── funcs
│   │   │   ├── base64.ts
│   │   │   ├── defineReactiveProperties.ts
│   │   │   ├── generateUUID.ts
│   │   │   ├── isObject.ts
│   │   │   ├── isString.ts
│   │   │   ├── resolveBaseUrl.ts
│   │   │   └── toCamelCase.ts
│   │   └── index.ts
│   └── utils.ts
├── tsconfig.json
├── tsconfig.react.json
└── types
    ├── atoms
    │   ├── index.d.ts
    │   └── models.d.ts
    ├── index.d.ts
    └── models.d.ts
```

## Agent Checklist

Before changing an integration, verify:

- The package is installed as `@sfpy/atoms`.
- The correct Safepay environment is configured.
- `authToken` and `tracker` are supplied.
- `inputStyle` is passed as an object/property, not a string attribute.
- Card validation happens before submission.
- `fetchValidity()` is awaited before calling `submit()`.
- `onProceedToAuthentication` data is used to initialize payer authentication.
- `deviceDataCollectionJWT` receives the returned `accessToken`.
- `deviceDataCollectionURL` receives the returned URL.
- `discountBody` is forwarded as an object when applicable.
- Frictionless success is handled separately from challenge success.
- Pre-challenge failures and generic Safepay errors are handled.
- Sensitive tokens are not hard-coded in production code.
- `pnpm install` and `pnpm run build` remain valid for repository changes.

## Source Notes

This agent guide is derived from the supplied Safepay Atoms documentation. It intentionally preserves the documented component names, props, callback semantics, object shapes, examples, installation commands, development commands, and project structure rather than introducing undocumented behavior.
