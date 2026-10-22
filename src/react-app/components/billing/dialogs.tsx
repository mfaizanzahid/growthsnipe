import { useEffect, useState } from "react";
import { CheckIcon, ChevronDownIcon } from "@heroicons/react/24/outline";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../ui/command";
import { Skeleton } from "../ui/skeleton";
import { formatMoney, formatWholeMoney } from "../../lib/money";

export interface PreviewInvoice {
  id: string;
  number: string | null;
  type: string;
  status: string;
  amountMinor: number;
  currency: string;
  description: string | null;
}

export interface PreviewLine {
  description: string;
  amountMinor: number;
  currency: string;
}

export function statusBadge(status: string) {
  if (status === "paid" || status === "active" || status === "trialing") {
    return <Badge variant="success">{status.replace("_", " ")}</Badge>;
  }
  const variant = status === "failed" || status === "past_due" || status === "unpaid" || status === "expired" ? "destructive" : "default";
  return <Badge variant={variant}>{status.replace("_", " ")}</Badge>;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Tenant-scoped fetch URL (already includes orgId) or superadmin detail item. */
  invoice: (PreviewInvoice & { orgId?: string }) | null;
  items: PreviewLine[] | null;
  loading: boolean;
}

/** HTML invoice preview (the PDF route serves the downloadable copy). */
export function InvoicePreviewDialog({ open, onClose, invoice, items, loading }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Invoice {invoice?.number ?? ""}</DialogTitle>
          <DialogDescription>HTML preview: use PDF for the downloadable copy.</DialogDescription>
        </DialogHeader>
        {loading || !invoice ? (
          <div className="space-y-2 py-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">{invoice.number}</span>
              {statusBadge(invoice.status)}
            </div>
            {invoice.description && <p className="text-muted-foreground">{invoice.description}</p>}
            <div className="divide-y rounded-md border">
              {(items ?? []).map((line, i) => (
                <div key={i} className="flex justify-between px-3 py-2">
                  <span>{line.description}</span>
                  <span className={line.amountMinor < 0 ? "text-green-700" : ""}>
                    {formatMoney(line.amountMinor, line.currency)}
                  </span>
                </div>
              ))}
              <div className="flex justify-between bg-muted/50 px-3 py-2 font-semibold">
                <span>Total</span>
                <span>{formatMoney(invoice.amountMinor, invoice.currency)}</span>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export interface PlanOption {
  id: string;
  name: string;
  monthlyMinor: number;
  annualMinor: number;
  currency: string;
}

export function ChangePlanDialog({
  open,
  onClose,
  plans,
  currentPlanId,
  currentInterval,
  currentPrice,
  onSubmit,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  plans: PlanOption[];
  currentPlanId: string;
  currentInterval: string;
  currentPrice: number;
  onSubmit: (planId: string, interval: "month" | "year") => void;
  busy: boolean;
}) {
  const [planId, setPlanId] = useState("");
  const [interval, setInterval] = useState<"month" | "year">("month");
  useEffect(() => {
    if (open) {
      setPlanId("");
      setInterval("month");
    }
  }, [open ]);
  const target = plans.find((p) => p.id === planId) ?? null;
  const targetPrice = target ? (interval === "month" ? target.monthlyMinor : target.annualMinor) : 0;
  const kind = !target ? null : targetPrice > currentPrice ? "upgrade" : targetPrice < currentPrice ? "downgrade" : "same";
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change plan</DialogTitle>
          <DialogDescription>Upgrades charge immediately (prorated); downgrades apply next cycle.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Plan</Label>
            <Select value={planId} onValueChange={setPlanId}>
              <SelectTrigger>
                <SelectValue placeholder="Select plan…" />
              </SelectTrigger>
              <SelectContent>
                {plans.map((p) => {
                  const disabled = p.id === currentPlanId && interval === currentInterval;
                  return (
                    <SelectItem key={p.id} value={p.id} disabled={disabled}>
                      {p.name}
                      {disabled ? " (current)" : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Billing</Label>
            <Select value={interval} onValueChange={(v) => setInterval(v as "month" | "year")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Monthly</SelectItem>
                <SelectItem value="year">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {target && (
            <p className="text-sm text-muted-foreground">
              {target.name} ({interval === "month" ? "monthly" : "yearly"}): {formatWholeMoney(targetPrice, target.currency)}
              {kind === "upgrade" && ": charged immediately, prorated for the remaining cycle."}
              {kind === "downgrade" && ": takes effect from the next billing cycle."}
              {kind === "same" && ": no change."}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Back
          </Button>
          <Button disabled={!target || kind === "same" || busy} onClick={() => target && onSubmit(target.id, interval)}>
            {busy ? "Applying…" : "Apply change"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel = "Confirm",
  destructive = false,
  busy = false,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Back
          </Button>
          <Button variant={destructive ? "destructive" : "default"} disabled={busy} onClick={onConfirm}>
            {busy ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ChargeDialog({
  open,
  onClose,
  orgName,
  busy,
  onSubmit,
  orgPicker,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  orgName: string;
  busy: boolean;
  onSubmit: (amountMinor: number, description: string) => void;
  orgPicker?: {
    orgs: Array<{ id: string; name: string }>;
    value: string;
    onChange: (id: string) => void;
  };
  initial?: { amount: string; description: string };
}) {
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [pickerOpen, setPickerOpen] = useState(false);
  useEffect(() => {
    if (open) {
      setAmount(initial?.amount ?? "");
      setDescription(initial?.description ?? "");
    }
  }, [open, initial?.amount, initial?.description ]);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New charge: {orgName}</DialogTitle>
          <DialogDescription>Creates an invoice and charges the default card now.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {orgPicker && (
            <div className="space-y-2">
              <Label>Organization</Label>
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={pickerOpen}
                    className="w-full justify-between font-normal"
                  >
                    <span className="truncate">
                      {orgPicker.orgs.find((o) => o.id === orgPicker.value)?.name ?? "Select organization…"}
                    </span>
                    <ChevronDownIcon className="size-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search organizations…" />
                    <CommandList>
                      <CommandEmpty>No organization found.</CommandEmpty>
                      <CommandGroup>
                        {orgPicker.orgs.map((o) => (
                          <CommandItem
                            key={o.id}
                            value={`${o.name} ${o.id}`}
                            onSelect={() => {
                              orgPicker.onChange(o.id);
                              setPickerOpen(false);
                            }}
                          >
                            <CheckIcon
                              className={
                                o.id === orgPicker.value ? "size-4 shrink-0 opacity-100" : "size-4 shrink-0 opacity-0"
                              }
                            />
                            <span className="truncate">{o.name}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          )}
          <div className="space-y-2">
            <Label>Amount (USD)</Label>
            <Input placeholder="25.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Input placeholder="Extra seats: September" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Back
          </Button>
          <Button
            disabled={busy || !amount || !description.trim() || (orgPicker && !orgPicker.value)}
            onClick={() => onSubmit(Math.round(Number(amount) * 100), description.trim())}
          >
            {busy ? "Charging…" : "Create + charge now"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export interface RetryMethod {
  id: string;
  brand: string | null;
  last4: string | null;
  isDefault: boolean;
  status: string;
}

export function RetryDialog({
  open,
  onClose,
  invoiceLabel,
  methods,
  busy,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  invoiceLabel: string;
  methods: RetryMethod[];
  busy: boolean;
  onSubmit: (methodId?: string) => void;
}) {
  const def = methods.find((m) => m.isDefault && m.status === "active") ?? methods.find((m) => m.status === "active") ?? null;
  const [methodId, setMethodId] = useState<string>("");
  useEffect(() => {
    if (open) setMethodId(def?.id ?? "");
  }, [open, def?.id ]);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Retry payment</DialogTitle>
          <DialogDescription>
            {invoiceLabel}: charges one attempt on the selected card.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Card</Label>
          <Select value={methodId} onValueChange={setMethodId}>
            <SelectTrigger>
              <SelectValue placeholder="Select card…" />
            </SelectTrigger>
            <SelectContent>
              {methods
                .filter((m) => m.status === "active")
                .map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.brand ?? "Card"} •••• {m.last4 ?? "••••"}
                    {m.isDefault ? " (default)" : ""}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Back
          </Button>
          <Button disabled={busy || !methodId} onClick={() => onSubmit(methodId || undefined)}>
            {busy ? "Charging…" : "Retry now"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RefundDialog({
  open,
  onClose,
  invoiceLabel,
  maxMinor,
  currency,
  busy,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  invoiceLabel: string;
  maxMinor: number;
  currency: string;
  busy: boolean;
  onSubmit: (amountMinor?: number) => void;
}) {
  const [amount, setAmount] = useState("");
  useEffect(() => {
    if (open) setAmount("");
  }, [open ]);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Issue refund</DialogTitle>
          <DialogDescription>
            {invoiceLabel}. Blank amount refunds in full. No credit balances.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Amount USD (blank = full{maxMinor > 0 ? ` ${formatMoney(maxMinor, currency)}` : ""})</Label>
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="10.00" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Back
          </Button>
          <Button
            disabled={busy}
            onClick={() => onSubmit(amount ? Math.round(Number(amount) * 100) : undefined)}
          >
            {busy ? "Issuing…" : "Issue refund"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Bulk refund across invoices: one amount applies to every selected invoice
 * (each capped by its own total server-side), blank refunds each in full.
 */
export function BulkRefundDialog({
  open,
  onClose,
  count,
  busy,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  count: number;
  busy: boolean;
  onSubmit: (amountMinor?: number) => void;
}) {
  const [amount, setAmount] = useState("");
  useEffect(() => {
    if (open) setAmount("");
  }, [open ]);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Refund {count} invoice{count === 1 ? "" : "s"}?
          </DialogTitle>
          <DialogDescription>
            One amount applies to every selected invoice (each capped at its own total). Blank
            refunds each in full. No credit balances.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Amount USD per invoice (blank = full)</Label>
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="10.00" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Back
          </Button>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() => onSubmit(amount ? Math.round(Number(amount) * 100) : undefined)}
          >
            {busy ? "Issuing…" : "Issue refunds"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
