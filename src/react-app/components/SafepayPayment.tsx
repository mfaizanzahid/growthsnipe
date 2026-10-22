import { Suspense, useCallback, useRef, useState } from "react";
import { CardCapture, PayerAuthentication, Environment } from "@sfpy/atoms";
import { Button } from "./ui/button";
import { Alert, AlertDescription } from "./ui/alert";
import type { BillingAddress } from "./BillingAddressFields";

interface PayerAuthSession {
  accessToken: string;
  deviceDataCollectionURL: string;
}

interface Props {
  tracker: string;
  clientToken: string;
  environment: string;
  /** "payment" charges the card; "setup" saves it without charging. */
  mode: "payment" | "setup";
  /** Billing street/city/state, collected on the parent form (Cybersource requires all three). */
  billingAddress: BillingAddress;
  /** ISO country for payer authentication billing (from the phone/country inputs). */
  country: string;
  submitLabel: string;
  onSuccess: (tracker: string) => void;
  onError: (message: string) => void;
  onCancel?: () => void;
}

function toEnvironment(env: string) {
  const lower = env.toLowerCase();
  if (lower === "live" || lower === "production") return Environment.Production;
  return Environment.Sandbox;
}

/**
 * Safepay Atoms combined card + 3DS flow (see docs/safepay-atoms.md):
 * validate → fetchValidity → submit → payer authentication → terminal outcome.
 */
export function SafepayPayment({ tracker, clientToken, environment, billingAddress, country, submitLabel, onSuccess, onError, onCancel }: Props) {
  const cardRef = useRef<{ submit: () => void; validate: () => void; fetchValidity: () => Promise<boolean>; clear: () => void } | null>(null);
  const [authSession, setAuthSession] = useState<PayerAuthSession | null>(null);
  const [fieldsReady, setFieldsReady] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [discountBody, setDiscountBody] = useState<Record<string, unknown> | undefined>();
  const [busy, setBusy] = useState(false);
  const done = useRef(false);

  const finish = useCallback(
    (ok: boolean, message?: string) => {
      if (done.current) return;
      done.current = true;
      setBusy(false);
      if (ok) onSuccess(tracker);
      else onError(message ?? "Payment failed");
    },
    [onSuccess, onError, tracker],
  );

  const failSoft = useCallback((message: string) => {
    // Recoverable problem: show it inline and keep the form open for retry.
    setBusy(false);
    setFormError(message);
    setAuthSession(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    setFormError(null);
    setBusy(true);
    try {
      cardRef.current?.validate();
      const valid = await cardRef.current?.fetchValidity();
      if (valid) {
        await cardRef.current?.submit();
      } else {
        failSoft("Please check your card details. A field is incomplete or invalid.");
      }
    } catch {
      failSoft("Card capture failed. Please try again.");
    }
  }, [failSoft]);

  return (
    <div className="space-y-4">
      {formError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      <Suspense fallback={<div className="text-sm text-gray-500">Loading secure card form…</div>}>
        {!authSession ? (
          <div className="relative">
            <CardCapture
              environment={toEnvironment(environment)}
              authToken={clientToken}
              tracker={tracker}
              validationEvent="submit"
              inputStyle={{ fontSize: "16px", color: "#111827" }}
              imperativeRef={cardRef as React.MutableRefObject<unknown>}
              onReady={() => setFieldsReady(true)}
              onDiscountApplied={(data: { discountBody?: Record<string, unknown> }) => {
                if (data?.discountBody) setDiscountBody(data.discountBody);
              }}
              onProceedToAuthentication={(data: { accessToken: string; deviceDataCollectionURL: string }) => {
                setFormError(null);
                setAuthSession({
                  accessToken: data.accessToken,
                  deviceDataCollectionURL: data.deviceDataCollectionURL,
                });
              }}
              onError={(message: string) => failSoft(message || "Card details could not be read.")}
            />
            {!fieldsReady && (
              <div
                className="absolute inset-0 flex items-center justify-center gap-3 rounded-md bg-background/80 text-sm text-muted-foreground backdrop-blur-[1px]"
                role="status"
                aria-live="polite"
              >
                <span className="size-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
                Loading secure payment form...
              </div>
            )}
          </div>
        ) : (
          <PayerAuthentication
            environment={toEnvironment(environment)}
            tracker={tracker}
            authToken={clientToken}
            deviceDataCollectionJWT={authSession.accessToken}
            deviceDataCollectionURL={authSession.deviceDataCollectionURL}
            billing={{
              street_1: billingAddress.street.trim(),
              city: billingAddress.city.trim(),
              state: billingAddress.state.trim(),
              country,
            }}
            discountBody={discountBody as never}
            authorizationOptions={{
              do_capture: true,
              do_card_on_file: true,
            }}
            imperativeRef={{ current: null }}
            onPayerAuthenticationFrictionless={() => finish(true)}
            onPayerAuthenticationSuccess={() => finish(true)}
            onPayerAuthenticationFailure={() => failSoft("Card authentication failed. Check the details and try again.")}
            onPayerAuthenticationUnavailable={() => failSoft("Card authentication is unavailable for this card. Try another card.")}
            onSafepayError={() => failSoft("Payment gateway error. Please try again.")}
          />
        )}
      </Suspense>
      {!authSession && (
        <div className="flex gap-2">
          {onCancel && (
            <Button variant="outline" className="flex-1" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
          )}
          <Button
            onClick={handleSubmit}
            disabled={busy || !fieldsReady}
            className="flex-1"
          >
            {busy ? "Processing…" : submitLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
