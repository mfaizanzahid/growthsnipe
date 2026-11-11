import { useEffect, useState } from "react";
import { toast } from "sonner";
import { formatMoney } from "../../lib/money";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { api } from "../../components/billing/shared";
import { AdminDenied, AdminLoading, useAdminGuard } from "./guard";
import { couponExpiryFromDays } from "../../../lib/credit-coupon";

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

export function AdminCoupons() {
  const allowed = useAdminGuard();
  const [coupons, setCoupons] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [expiryDrafts, setExpiryDrafts] = useState<Record<string, string>>({});
  const [couponForm, setCouponForm] = useState({ code: "", kind: "percent", value: "", duration: "once", cycles: "3" });

  async function load() {
    try {
      const cp = await api("/api/superadmin/coupons");
      const list = ((cp as { coupons?: Array<Record<string, unknown>> }).coupons ?? []) as Array<Record<string, unknown>>;
      setCoupons(list);
      setExpiryDrafts((prev) => {
        const next = { ...prev };
        for (const coupon of list) {
          const id = String(coupon.id);
          if (!(id in next)) next[id] = dateInputValue(coupon.validUntil);
        }
        return next;
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load coupons");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (allowed) void load();
  }, [allowed]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      toast.success(ok);
      setExpiryDrafts({});
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  function setExpiry(coupon: Record<string, unknown>, value: string) {
    const validUntil = value
      ? Math.floor(new Date(`${value}T23:59:59Z`).getTime() / 1000)
      : null;
    return api(`/api/superadmin/coupons/${String(coupon.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ validUntil }),
    });
  }

  function extendExpiry(coupon: Record<string, unknown>, days: number) {
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

  if (allowed === null || (allowed && loading)) return <AdminLoading />;
  if (allowed === false) return <AdminDenied />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Coupons</h1>
        <p className="text-sm text-muted-foreground">Percent or fixed discounts with durations and caps.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Coupons</CardTitle>
          <CardDescription>
            Percent or fixed discounts with durations and caps. Credit coupons are issued automatically and can be extended here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {coupons.map((c) => (
            <div key={String(c.id)} className="flex flex-wrap items-start justify-between gap-3 rounded-md border p-3 text-sm">
              <div className="space-y-1">
                <div>
                  <span className="font-medium">{String(c.code)}</span>{" "}
                  <span className="text-muted-foreground">
                    {String(c.kind)} {c.kind === "percent" ? `${String(c.percentOff)}%` : formatMoney(Number(c.amountOffMinor))} ·{" "}
                    {String(c.duration)} · redeemed {String(c.redeemedCount)}
                    {c.maxRedemptions ? `/${String(c.maxRedemptions)}` : ""}
                  </span>{" "}
                  {Number(c.active) !== 1 && <Badge>inactive</Badge>}
                  {c.sourceOrderId ? <Badge variant="outline">credit</Badge> : null}
                </div>
                <div className="text-xs text-muted-foreground">
                  Expires {expiryLabel(c.validUntil)}
                  {c.restrictedEmail ? ` · ${String(c.restrictedEmail)}` : ""}
                  {c.oneTimeProductSlug ? ` · ${String(c.oneTimeProductSlug)}` : ""}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="date"
                  className="w-40"
                  value={expiryDrafts[String(c.id)] ?? ""}
                  onChange={(e) =>
                    setExpiryDrafts((prev) => ({ ...prev, [String(c.id)]: e.target.value }))
                  }
                  aria-label={`Expiry date for ${String(c.code)}`}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    run(
                      () => setExpiry(c, expiryDrafts[String(c.id)] ?? ""),
                      "Expiry updated",
                    )
                  }
                >
                  Set expiry
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => run(() => extendExpiry(c, 30), "Expiry extended")}
                >
                  +30 days
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    run(async () => {
                      await api(`/api/superadmin/coupons/${String(c.id)}`, {
                        method: "PATCH",
                        body: JSON.stringify({ active: Number(c.active) === 1 ? 0 : 1 }),
                      });
                    }, "Coupon updated")
                  }
                >
                  {Number(c.active) === 1 ? "Deactivate" : "Activate"}
                </Button>
              </div>
            </div>
          ))}
          <div className="grid gap-3 rounded-md border p-4">
            <div className="font-medium">New coupon</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input placeholder="CODE" value={couponForm.code} onChange={(e) => setCouponForm({ ...couponForm, code: e.target.value.toUpperCase() })} />
              <Select value={couponForm.kind} onValueChange={(v) => setCouponForm({ ...couponForm, kind: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">Percent off</SelectItem>
                  <SelectItem value="fixed">Fixed USD off</SelectItem>
                </SelectContent>
              </Select>
              <Input placeholder={couponForm.kind === "percent" ? "20" : "50.00"} value={couponForm.value} onChange={(e) => setCouponForm({ ...couponForm, value: e.target.value })} />
              <Select value={couponForm.duration} onValueChange={(v) => setCouponForm({ ...couponForm, duration: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="once">Once</SelectItem>
                  <SelectItem value="repeating">Repeating</SelectItem>
                  <SelectItem value="forever">Forever</SelectItem>
                </SelectContent>
              </Select>
              {couponForm.duration === "repeating" && (
                <Input placeholder="Cycles" value={couponForm.cycles} onChange={(e) => setCouponForm({ ...couponForm, cycles: e.target.value })} />
              )}
            </div>
            <Button
              onClick={() =>
                run(async () => {
                  await api("/api/superadmin/coupons", {
                    method: "POST",
                    body: JSON.stringify({
                      code: couponForm.code,
                      kind: couponForm.kind,
                      ...(couponForm.kind === "percent"
                        ? { percentOff: Number(couponForm.value) }
                        : { amountOffMinor: Math.round(Number(couponForm.value) * 100) }),
                      duration: couponForm.duration,
                      ...(couponForm.duration === "repeating" ? { durationCycles: Number(couponForm.cycles) } : {}),
                    }),
                  });
                  setCouponForm({ code: "", kind: "percent", value: "", duration: "once", cycles: "3" });
                }, "Coupon created")
              }
            >
              Create coupon
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
