import { useEffect, useMemo, useState } from "react";
import {
  ArrowPathIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  NoSymbolIcon,
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
import { SearchInput } from "../../components/ui/search-input";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { DataTable, RowAction, type DataColumn } from "../../components/DataTable";
import { api, runBulk, toastBulk } from "../../components/billing/shared";
import { AdminDenied, AdminLoading, useAdminGuard } from "./guard";
import { usePersistentState } from "../../hooks/usePersistentState";
import { couponExpiryFromDays } from "../../../lib/credit-coupon";

type Coupon = Record<string, unknown>;
type CouponStatusFilter = "all" | "active" | "inactive" | "expired" | "credit";

const COUPON_STATUSES: CouponStatusFilter[] = ["all", "active", "inactive", "expired", "credit"];

function isCouponStatusFilter(value: unknown): value is CouponStatusFilter {
  return typeof value === "string" && (COUPON_STATUSES as string[]).includes(value);
}

function isExpired(coupon: Coupon): boolean {
  const validUntil = Number(coupon.validUntil);
  return Number.isFinite(validUntil) && validUntil > 0 && validUntil * 1000 < Date.now();
}

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
  const [status, setStatus] = usePersistentState<CouponStatusFilter>(
    "growthsnipe:coupons:filter",
    "all",
    isCouponStatusFilter,
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState<"activate" | "deactivate" | "extend" | null>(null);

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

  const visibleCoupons = useMemo(() => {
    const now = Date.now();
    return coupons.filter((coupon) => {
      if (status === "active") return Number(coupon.active) === 1;
      if (status === "inactive") return Number(coupon.active) !== 1;
      if (status === "expired") {
        const validUntil = Number(coupon.validUntil);
        return Number.isFinite(validUntil) && validUntil > 0 && validUntil * 1000 < now;
      }
      if (status === "credit") return Boolean(coupon.sourceOrderId);
      return true;
    });
  }, [coupons, status]);

  function changeSearch(value: string) {
    setSearch(value);
    setSelected([]);
  }

  function changeStatus(value: string) {
    setStatus(value as CouponStatusFilter);
    setSelected([]);
  }

  const hasActiveFilters = search.trim() !== "" || status !== "all";

  function resetFilters() {
    setSearch("");
    setStatus("all");
    setSelected([]);
  }

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

  async function bulk(action: "activate" | "deactivate" | "extend") {
    if (bulkBusy || selected.length === 0) return;
    const chosen = coupons.filter((coupon) => selected.includes(String(coupon.id)));
    if (chosen.length === 0) return;
    if (
      action === "deactivate" &&
      !confirm(`Deactivate ${chosen.length} coupon${chosen.length === 1 ? "" : "s"}?`)
    ) {
      return;
    }
    setBulkBusy(action);
    try {
      const result = await runBulk(chosen, (coupon) => String(coupon.code), async (coupon) => {
        const id = String(coupon.id);
        if (action === "extend") {
          await extendExpiry(coupon, 30);
          return;
        }
        await api(`/api/superadmin/coupons/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ active: action === "activate" ? 1 : 0 }),
        });
      });
      toastBulk(action === "extend" ? "Extended" : action === "activate" ? "Activated" : "Deactivated", result);
      setSelected([]);
      await load();
    } finally {
      setBulkBusy(null);
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
          {isExpired(c) ? <Badge variant="destructive">expired</Badge> : null}
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
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>Coupons</CardTitle>
            {selected.length > 0 && (
              <>
                <span className="text-sm font-normal text-muted-foreground">
                  [{selected.length} selected]
                </span>
                <div className="flex items-center gap-1">
                  <RowAction
                    label={`Activate ${selected.length} selected coupon${selected.length === 1 ? "" : "s"}`}
                    onClick={() => void bulk("activate")}
                    loading={bulkBusy === "activate"}
                    disabled={bulkBusy !== null}
                  >
                    <CheckCircleIcon className="size-4" />
                  </RowAction>
                  <RowAction
                    label={`Deactivate ${selected.length} selected coupon${selected.length === 1 ? "" : "s"}`}
                    onClick={() => void bulk("deactivate")}
                    loading={bulkBusy === "deactivate"}
                    disabled={bulkBusy !== null}
                  >
                    <NoSymbolIcon className="size-4" />
                  </RowAction>
                  <RowAction
                    label={`Extend ${selected.length} selected coupon${selected.length === 1 ? "" : "s"} by 30 days`}
                    onClick={() => void bulk("extend")}
                    loading={bulkBusy === "extend"}
                    disabled={bulkBusy !== null}
                  >
                    <CalendarDaysIcon className="size-4" />
                  </RowAction>
                </div>
              </>
            )}
          </div>
          <CardDescription>
            {visibleCoupons.length} total. Credit coupons are issued automatically and can be extended here.
          </CardDescription>
          <CardAction className="w-full sm:w-auto">
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
              <SearchInput
                ariaLabel="Search coupons"
                placeholder="Search code, email, or product…"
                value={search}
                onChange={changeSearch}
                className="w-full sm:w-64"
              />
              <Select value={status} onValueChange={changeStatus}>
                <SelectTrigger className="w-full sm:w-40" aria-label="Filter coupons by status">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="credit">Credit</SelectItem>
                </SelectContent>
              </Select>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Reset filters"
                    disabled={!hasActiveFilters}
                    onClick={resetFilters}
                  >
                    <ArrowPathIcon className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Reset filters</TooltipContent>
              </Tooltip>
            </div>
          </CardAction>
        </CardHeader>
        <CardContent>
          <DataTable
            rows={visibleCoupons}
            columns={columns}
            rowId={(c) => String(c.id)}
            selectable
            selected={selected}
            onSelect={setSelected}
            hideSelectionBar
            search={search}
            onSearchChange={changeSearch}
            hideSearch
            pageSize={50}
            pageResetKey={status}
            onPageChange={() => setSelected([])}
            storageKey="growthsnipe:coupons:sort"
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
