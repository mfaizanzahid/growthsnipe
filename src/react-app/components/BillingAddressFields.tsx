import { Input } from "./ui/input";
import { Label } from "./ui/label";

/**
 * Billing address for card payments (pass-through browser → Safepay only,
 * never persisted server-side). Cybersource rejects the payer-authentication
 * step when street/city/state are blank, so every card-input surface must
 * collect them before starting payment.
 */
export interface BillingAddress {
  street: string;
  city: string;
  state: string;
}

export const EMPTY_BILLING_ADDRESS: BillingAddress = { street: "", city: "", state: "" };

/** US states + Canadian provinces are 2-letter codes — enforced only for US/CA. */
export function requiresStateCode(countryCode: string): boolean {
  const code = countryCode.trim().toUpperCase();
  return code === "US" || code === "CA";
}

export function billingAddressValid(a: BillingAddress, countryCode?: string): boolean {
  if (a.street.trim() === "" || a.city.trim() === "") return false;
  const state = a.state.trim();
  if (state === "") return false;
  if (countryCode !== undefined && requiresStateCode(countryCode)) {
    return /^[A-Za-z]{2}$/.test(state);
  }
  return true;
}

export function BillingAddressFields({
  value,
  onChange,
  idPrefix,
  countryCode = "",
  layout = "stacked",
  showRequired = false,
}: {
  value: BillingAddress;
  onChange: (next: BillingAddress) => void;
  idPrefix: string;
  /** ISO country: US/CA get a 2-letter state code field, others free text. */
  countryCode?: string;
  /** `inline` puts street, city, and state on one row at sm and above. */
  layout?: "stacked" | "inline";
  /** Mark street, city, and state with the required asterisk (public checkout). */
  showRequired?: boolean;
}) {
  const codeOnly = requiresStateCode(countryCode);
  const setState = (raw: string) => {
    // Keep US/CA codes uppercase + capped while typing.
    const next = codeOnly ? raw.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 2) : raw;
    onChange({ ...value, state: next });
  };

  const streetField = (
    <div className="space-y-2">
      <Label htmlFor={`${idPrefix}-street`} required={showRequired}>Street address</Label>
      <Input
        id={`${idPrefix}-street`}
        placeholder="123 Main Street"
        value={value.street}
        onChange={(e) => onChange({ ...value, street: e.target.value })}
        required
      />
    </div>
  );
  const cityField = (
    <div className="space-y-2">
      <Label htmlFor={`${idPrefix}-city`} required={showRequired}>City</Label>
      <Input
        id={`${idPrefix}-city`}
        placeholder="Austin"
        value={value.city}
        onChange={(e) => onChange({ ...value, city: e.target.value })}
        required
      />
    </div>
  );
  const stateField = (
    <div className="space-y-2">
      <Label htmlFor={`${idPrefix}-state`} required={showRequired}>State</Label>
      <Input
        id={`${idPrefix}-state`}
        placeholder={codeOnly ? "TX" : "Texas"}
        value={value.state}
        onChange={(e) => setState(e.target.value)}
        maxLength={codeOnly ? 2 : undefined}
        required
      />
    </div>
  );

  if (layout === "inline") {
    return (
      <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr]">
        {streetField}
        {cityField}
        {stateField}
      </div>
    );
  }

  return (
    <>
      {streetField}
      <div className="grid grid-cols-2 gap-2">
        {cityField}
        {stateField}
      </div>
    </>
  );
}
