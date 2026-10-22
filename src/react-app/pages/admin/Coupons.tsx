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

export function AdminCoupons() {
  const allowed = useAdminGuard();
  const [coupons, setCoupons] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [couponForm, setCouponForm] = useState({ code: "", kind: "percent", value: "", duration: "once", cycles: "3" });

  async function load() {
    try {
      const cp = await api("/api/superadmin/coupons");
      setCoupons(((cp as { coupons?: Array<Record<string, unknown>> }).coupons ?? []) as Array<Record<string, unknown>>);
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
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
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
          <CardDescription>Percent or fixed discounts with durations and caps.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {coupons.map((c) => (
            <div key={String(c.id)} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
              <div>
                <span className="font-medium">{String(c.code)}</span>{" "}
                <span className="text-muted-foreground">
                  {String(c.kind)} {c.kind === "percent" ? `${String(c.percentOff)}%` : formatMoney(Number(c.amountOffMinor))} ·{" "}
                  {String(c.duration)} · redeemed {String(c.redeemedCount)}
                  {c.maxRedemptions ? `/${String(c.maxRedemptions)}` : ""}
                </span>{" "}
                {Number(c.active) !== 1 && <Badge>inactive</Badge>}
              </div>
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
