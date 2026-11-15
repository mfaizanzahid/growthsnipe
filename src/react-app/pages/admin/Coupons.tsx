import { useEffect, useState } from "react";
import {
  CalendarDaysIcon,
  PencilIcon,
  PowerIcon,
} from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { formatMoney } from "../../lib/money";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Checkbox } from "../../components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { DataTable, RowAction, type DataColumn } from "../../components/DataTable";
import { api } from "../../components/billing/shared";
import { AdminDenied, AdminLoading, useAdminGuard } from "./guard";
import { couponExpiryFromDays } from "../../../lib/credit-coupon";

type Coupon = Record<string, unknown>;

const EMPTY_FORM = {
  code: "",
  kind: "percent",
  value: "",
  duration: "once",
  cycles: "3",
  maxRedemptions: "",
  validUntil: "",
  appliesToSetup: false,
};

function expiryLabel(value: unknown): string {
  const seconds = Number(value);
  if (!value || !Number.isFinite(seconds) || seconds <= 0) return "No expiry";
  return new Date(seconds * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function dateInputValue(value: unknown): string {
  const seconds = Number(value);
  if (!value || !Number.isFinite(seconds) || seconds <= 0) return "";
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

function dateInputSeconds(value: string): number | null {
  return value ? Math.floor(new Date(`${value}T23:59:59Z`).getTime() / 1000) : null;
}

function durationLabel(coupon: Coupon): string {
  const duration = String(coupon.duration);
  if (duration === "repeating") return `Repeating (${String(coupon.durationCycles ?? "?")} cycles)`;
  return duration.charAt(0).toUpperCase() + duration.slice(1);
}

function extendExpiry(coupon: Coupon, days: number) {
  const current = Number(coupon.validUntil);
  const anchorMs =
    Number.isFinite(current) && current > 0
      ? Math.max(current * 1000, Date.now())
      : Date.now();
  const validUntil = couponExpiryFromDays(anchorMs, days);
  return api(`/api/superadmin/coupons/${String(coupon.id)}`, {
    method: "PATCH",
    body: JSON.stringify({ validUntil }),
  });
}

export function AdminCoupons() {
  const allowed = useAdminGuard();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const [editCoupon, setEditCoupon] = useState<Coupon | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editForm, setEditForm] = useState({ validUntil: "", maxRedemptions: "", durationCycles: "" });

  async function load() {
    try {
      const cp = await api("/api/superadmin/coupons");
      setCoupons(((cp as { coupons?: Coupon[] }).coupons ?? []) as Coupon[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load coupons");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (allowed) void load();
  }, [allowed]);

  async function run(fn: () => Promise<unknown>, ok: string, key: string) {
    if (busyAction) return;
    setBusyAction(key);
    try {
      await fn();
      toast.success(ok);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusyAction(null);
    }
  }

  async function create() {
    if (creating) return;
    setCreating(true);
    try {
      await api("/api/superadmin/coupons", {
        method: "POST",
        body: JSON.stringify({
          code: form.code.trim().toUpperCase(),
          kind: form.kind,
          ...(form.kind === "percent"
            ? { percentOff: Number(form.value) }
            : { amountOffMinor: Math.round(Number(form.value) * 100) }),
          duration: form.duration,
          ...(form.duration === "repeating" ? { durationCycles: Number(form.cycles) } : {}),
          ...(form.maxRedemptions.trim() ? { maxRedemptions: Number(form.maxRedemptions) } : {}),
          validUntil: dateInputSeconds(form.validUntil),
          appliesToSetup: form.appliesToSetup ? 1 : 0,
        }),
      });
      toast.success("Coupon created");
      setCreateOpen(false);
      setForm({ ...EMPTY_FORM });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setCreating(false);
    }
  }

  function openEdit(coupon: Coupon) {
    setEditCoupon(coupon);
    setEditForm({
      validUntil: dateInputValue(coupon.validUntil),
      maxRedemptions: coupon.maxRedemptions ? String(coupon.maxRedemptions) : "",
      durationCycles: coupon.durationCycles ? String(coupon.durationCycles) : "",
    });
  }

  async function saveEdit() {
    if (!editCoupon || savingEdit) return;
    setSavingEdit(true);
    try {
      await api(`/api/superadmin/coupons/${String(editCoupon.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          validUntil: dateInputSeconds(editForm.validUntil),
          maxRedemptions: editForm.maxRedemptions.trim() ? Number(editForm.maxRedemptions) : null,
          ...(String(editCoupon.duration) === "repeating"
            ? { durationCycles: editForm.durationCycles.trim() ? Number(editForm.durationCycles) : null }
            : {}),
        }),
      });
      toast.success("Coupon updated");
      setEditCoupon(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSavingEdit(false);
    }
  }

  const createValid =
    form.code.trim() !== "" &&
    Number(form.value) > 0 &&
    (form.kind !== "percent" || Number(form.value) <= 100) &&
    (form.duration !== "repeating" || (Number.isInteger(Number(form.cycles)) && Number(form.cycles) > 0)) &&
    (form.maxRedemptions.trim() === "" ||
      (Number.isInteger(Number(form.maxRedemptions)) && Number(form.maxRedemptions) > 0));

  const editValid =
    (editForm.maxRedemptions.trim() === "" ||
      (Number.isInteger(Number(editForm.maxRedemptions)) && Number(editForm.maxRedemptions) > 0)) &&
    (!editCoupon ||
      String(editCoupon.duration) !== "repeating" ||
      (Number.isInteger(Number(editForm.durationCycles)) && Number(editForm.durationCycles) > 0));

  const columns: DataColumn<Coupon>[] = [
    {
      key: "code",
      header: "Code",
      sortable: true,
      render: (c) => (
        <div>
          <span className="font-medium">{String(c.code)}</span>
          {c.restrictedEmail ? (
            <div className="text-xs text-muted-foreground">{String(c.restrictedEmail)}</div>
          ) : null}
          {c.oneTimeProductSlug ? (
            <div className="text-xs text-muted-foreground">{String(c.oneTimeProductSlug)}</div>
          ) : null}
        </div>
      ),
      sortValue: (c) => String(c.code),
      searchValue: (c) => `${String(c.code)} ${String(c.restrictedEmail ?? "")} ${String(c.oneTimeProductSlug ?? "")}`,
    },
    {
      key: "discount",
      header: "Discount",
      sortable: true,
      render: (c) =>
        c.kind === "percent" ? `${String(c.percentOff)}%` : formatMoney(Number(c.amountOffMinor)),
      sortValue: (c) => (c.kind === "percent" ? Number(c.percentOff) : Number(c.amountOffMinor)),
      searchValue: (c) => (c.kind === "percent" ? `${String(c.percentOff)}%` : String(c.amountOffMinor)),
    },
    {
      key: "duration",
      header: "Duration",
      sortable: true,
      render: (c) => durationLabel(c),
      sortValue: (c) => String(c.duration),
    },
    {
      key: "redemptions",
      header: "Redemptions",
      sortable: true,
      render: (c) =>
        `${String(c.redeemedCount ?? 0)}${c.maxRedemptions ? ` / ${String(c.maxRedemptions)}` : ""}`,
      sortValue: (c) => Number(c.redeemedCount ?? 0),
    },
    {
      key: "expires",
      header: "Expires",
      sortable: true,
      render: (c) => <span className="whitespace-nowrap">{expiryLabel(c.validUntil)}</span>,
      sortValue: (c) => Number(c.validUntil) || 0,
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (c) => (
        <div className="flex flex-wrap gap-1">
          <Badge variant={Number(c.active) === 1 ? "success" : "secondary"}>
            {Number(c.active) === 1 ? "active" : "inactive"}
          </Badge>
          {c.sourceOrderId ? <Badge variant="outline">credit</Badge> : null}
        </div>
      ),
      sortValue: (c) => Number(c.active),
    },
    {
      key: "actions",
      header: "Actions",
      render: (c) => {
        const id = String(c.id);
        const active = Number(c.active) === 1;
        return (
          <div className="flex justify-start gap-0.5">
            <RowAction label="Edit coupon" onClick={() => openEdit(c)} disabled={busyAction !== null}>
              <PencilIcon className="size-4" />
            </RowAction>
            <RowAction
              label="Extend expiry by 30 days"
              onClick={() => void run(() => extendExpiry(c, 30), "Expiry extended", `extend:${id}`)}
              loading={busyAction === `extend:${id}`}
              disabled={busyAction !== null}
            >
              <CalendarDaysIcon className="size-4" />
            </RowAction>
            <RowAction
              label={active ? "Deactivate coupon" : "Activate coupon"}
              onClick={() =>
                void run(
                  () =>
                    api(`/api/superadmin/coupons/${id}`, {
                      method: "PATCH",
                      body: JSON.stringify({ active: active ? 0 : 1 }),
                    }),
                  "Coupon updated",
                  `active:${id}`,
                )
              }
              loading={busyAction === `active:${id}`}
              disabled={busyAction !== null}
            >
              <PowerIcon className="size-4" />
            </RowAction>
          </div>
        );
      },
    },
  ];

  if (allowed === null || (allowed && loading)) return <AdminLoading />;
  if (allowed === false) return <AdminDenied />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Coupons</h1>
          <p className="text-sm text-muted-foreground">
            Percent or fixed discounts with durations and caps.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>Add new coupon</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Coupons</CardTitle>
          <CardDescription>
            {coupons.length} total. Credit coupons are issued automatically and can be extended here.
          </CardDescription>
          <CardAction className="w-full sm:w-64">
            <Input
              aria-label="Search coupons"
              placeholder="Search code, email, or product…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full"
            />
          </CardAction>
        </CardHeader>
        <CardContent>
          <DataTable
            rows={coupons}
            columns={columns}
            rowId={(c) => String(c.id)}
            search={search}
            onSearchChange={setSearch}
            hideSearch
            pageSize={50}
            empty="No coupons yet."
          />
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={(open) => !open && !creating && setCreateOpen(false)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add new coupon</DialogTitle>
            <DialogDescription>
              Percent or fixed discount, applied to all active plans unless restricted later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="coupon-code">Code</Label>
              <Input
                id="coupon-code"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="LAUNCH20"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="coupon-kind">Type</Label>
                <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
                  <SelectTrigger id="coupon-kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Percent off</SelectItem>
                    <SelectItem value="fixed">Fixed USD off</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="coupon-value">{form.kind === "percent" ? "Percent (1-100)" : "Amount (USD)"}</Label>
                <Input
                  id="coupon-value"
                  inputMode="decimal"
                  placeholder={form.kind === "percent" ? "20" : "50.00"}
                  value={form.value}
                  onChange={(e) => setForm({ ...form, value: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="coupon-duration">Duration</Label>
                <Select value={form.duration} onValueChange={(v) => setForm({ ...form, duration: v })}>
                  <SelectTrigger id="coupon-duration">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="once">Once</SelectItem>
                    <SelectItem value="repeating">Repeating</SelectItem>
                    <SelectItem value="forever">Forever</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.duration === "repeating" ? (
                <div className="space-y-2">
                  <Label htmlFor="coupon-cycles">Cycles</Label>
                  <Input
                    id="coupon-cycles"
                    inputMode="numeric"
                    value={form.cycles}
                    onChange={(e) => setForm({ ...form, cycles: e.target.value })}
                  />
                </div>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="coupon-max">Max redemptions (optional)</Label>
                <Input
                  id="coupon-max"
                  inputMode="numeric"
                  placeholder="Unlimited"
                  value={form.maxRedemptions}
                  onChange={(e) => setForm({ ...form, maxRedemptions: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="coupon-expiry">Expiry (optional)</Label>
                <Input
                  id="coupon-expiry"
                  type="date"
                  value={form.validUntil}
                  onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.appliesToSetup}
                onCheckedChange={(v) => setForm({ ...form, appliesToSetup: v === true })}
              />
              Also discount the setup fee
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={() => void create()} loading={creating} loadingText="Creating…" disabled={!createValid}>
              Create coupon
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editCoupon !== null} onOpenChange={(open) => !open && !savingEdit && setEditCoupon(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit coupon {editCoupon ? String(editCoupon.code) : ""}</DialogTitle>
            <DialogDescription>
              Change the expiry, redemption cap, or repeating cycles. Deactivate to stop new redemptions.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="edit-coupon-expiry">Expiry</Label>
              <Input
                id="edit-coupon-expiry"
                type="date"
                value={editForm.validUntil}
                onChange={(e) => setEditForm({ ...editForm, validUntil: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-coupon-max">Max redemptions (blank = unlimited)</Label>
              <Input
                id="edit-coupon-max"
                inputMode="numeric"
                value={editForm.maxRedemptions}
                onChange={(e) => setEditForm({ ...editForm, maxRedemptions: e.target.value })}
              />
            </div>
            {editCoupon && String(editCoupon.duration) === "repeating" ? (
              <div className="space-y-2">
                <Label htmlFor="edit-coupon-cycles">Repeating cycles</Label>
                <Input
                  id="edit-coupon-cycles"
                  inputMode="numeric"
                  value={editForm.durationCycles}
                  onChange={(e) => setEditForm({ ...editForm, durationCycles: e.target.value })}
                />
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditCoupon(null)} disabled={savingEdit}>
              Cancel
            </Button>
            <Button onClick={() => void saveEdit()} loading={savingEdit} loadingText="Saving…" disabled={!editValid}>
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
