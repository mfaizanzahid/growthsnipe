import type { PreviewInvoice } from "../../components/billing/dialogs";

export interface AdminClient {
  orgId: string;
  name: string;
  slug: string | null;
  ownerEmail: string | null;
  subscriptionStatus: string | null;
  openAmountMinor: number;
}

export interface AdminInvoice extends PreviewInvoice {
  orgId: string;
  orgName: string | null;
  currency: string;
  description: string | null;
}
