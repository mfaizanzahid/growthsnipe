import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";

export interface BusinessProfileValues {
  businessName: string;
  trade: string;
  serviceArea: string;
  ownerName: string;
  teamSize: string;
  servicesMain: string;
  servicesHighValue: string;
  servicesRecurring: string;
}

export const EMPTY_PROFILE: BusinessProfileValues = {
  businessName: "",
  trade: "",
  serviceArea: "",
  ownerName: "",
  teamSize: "",
  servicesMain: "",
  servicesHighValue: "",
  servicesRecurring: "",
};

/** Shared business-profile fields (onboarding step + profile page). */
export function BusinessProfileForm({
  value,
  onChange,
  idPrefix = "bp",
}: {
  value: BusinessProfileValues;
  onChange: (v: BusinessProfileValues) => void;
  idPrefix?: string;
}) {
  const set = (k: keyof BusinessProfileValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange({ ...value, [k]: e.target.value });
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-name`}>Business name *</Label>
          <Input id={`${idPrefix}-name`} value={value.businessName} onChange={set("businessName")} required maxLength={200} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-trade`}>Trade *</Label>
          <Input id={`${idPrefix}-trade`} placeholder="Home inspection" value={value.trade} onChange={set("trade")} required maxLength={120} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-area`}>Primary service area</Label>
          <Input id={`${idPrefix}-area`} placeholder="Austin, TX" value={value.serviceArea} onChange={set("serviceArea")} maxLength={300} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-owner`}>Owner</Label>
            <Input id={`${idPrefix}-owner`} value={value.ownerName} onChange={set("ownerName")} maxLength={200} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-team`}>Team size</Label>
            <Input id={`${idPrefix}-team`} placeholder="3" value={value.teamSize} onChange={set("teamSize")} maxLength={60} />
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-services`}>Main services</Label>
        <Textarea id={`${idPrefix}-services`} placeholder="One per line or comma-separated" value={value.servicesMain} onChange={set("servicesMain")} rows={2} maxLength={2000} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-highvalue`}>Highest-value services</Label>
          <Textarea id={`${idPrefix}-highvalue`} value={value.servicesHighValue} onChange={set("servicesHighValue")} rows={2} maxLength={2000} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-recurring`}>Recurring services</Label>
          <Textarea id={`${idPrefix}-recurring`} value={value.servicesRecurring} onChange={set("servicesRecurring")} rows={2} maxLength={2000} />
        </div>
      </div>
    </div>
  );
}
