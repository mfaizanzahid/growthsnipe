import { useCallback, useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney } from "../../lib/money";
import { api } from "../../components/billing/shared";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { AdminDenied, AdminLoading, useAdminGuard } from "./guard";
import { cn } from "../../lib/utils";

interface Analytics {
  range: { from: string; to: string };
  kpis: {
    mrrMinor: number;
    activeSubscriptions: number;
    trialingSubscriptions: number;
    pastDueSubscriptions: number;
    revenueCollectedMinor: number;
    refundsMinor: number;
    netRevenueMinor: number;
    newSubscriptions: number;
    newOrgs: number;
    canceledCount: number;
    openArMinor: number;
    openInvoiceCount: number;
  };
  revenueByDay: Array<{ date: string; collectedMinor: number; refundedMinor: number }>;
  signupsByDay: Array<{ date: string; orgs: number; subscriptions: number }>;
  subsByPlan: Array<{ planId: string; name: string; active: number; trialing: number; pastDue: number }>;
  revenueByMonth: Array<{ month: string; collectedMinor: number }>;
}

type Preset = "7d" | "30d" | "90d" | "12m" | "custom";

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function presetRange(p: Exclude<Preset, "custom">): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  const days = p === "7d" ? 6 : p === "30d" ? 29 : p === "90d" ? 89 : 364;
  from.setDate(to.getDate() - days);
  return { from: toISODate(from), to: toISODate(to) };
}

/** Compact axis labels, e.g. $1.2k. Input is minor units. */
function moneyAxis(minor: number): string {
  const dollars = minor / 100;
  if (dollars >= 1000) return `$${(dollars / 1000).toFixed(dollars >= 10000 ? 0 : 1)}k`;
  return `$${Math.round(dollars)}`;
}

const tooltipStyle = {
  backgroundColor: "var(--popover)",
  borderColor: "var(--border)",
  borderRadius: 8,
  color: "var(--popover-foreground)",
  fontSize: 12,
} as const;

const tickProps = { fontSize: 12, fill: "currentColor" } as const;

export function AdminDashboard() {
  const allowed = useAdminGuard();
  const [preset, setPreset] = useState<Preset>("30d");
  const [custom, setCustom] = useState(() => presetRange("30d"));
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  const range = preset === "custom" ? custom : presetRange(preset);

  const load = useCallback(async (from: string, to: string) => {
    setLoading(true);
    try {
      setData((await api(`/api/superadmin/analytics?from=${from}&to=${to}`)) as unknown as Analytics);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (allowed) void load(range.from, range.to);
  }, [allowed, preset]);

  if (allowed === null) return <AdminLoading />;
  if (allowed === false) return <AdminDenied />;

  const k = data?.kpis;
  const cards: Array<{ label: string; value: string; sub?: string }> = k
    ? [
        { label: "MRR", value: formatMoney(k.mrrMinor) },
        { label: "Collected", value: formatMoney(k.revenueCollectedMinor), sub: "in range" },
        { label: "Net revenue", value: formatMoney(k.netRevenueMinor), sub: "after refunds" },
        { label: "Refunds", value: formatMoney(k.refundsMinor), sub: "in range" },
        { label: "Active subs", value: String(k.activeSubscriptions) },
        { label: "Trialing", value: String(k.trialingSubscriptions) },
        { label: "Past due", value: String(k.pastDueSubscriptions), sub: `${formatMoney(k.openArMinor)} open` },
        { label: "New subs", value: String(k.newSubscriptions), sub: "in range" },
        { label: "New orgs", value: String(k.newOrgs), sub: "in range" },
        { label: "Canceled", value: String(k.canceledCount), sub: "in range" },
        { label: "Open invoices", value: String(k.openInvoiceCount), sub: `${formatMoney(k.openArMinor)} AR` },
      ]
    : [];

  const presets: Array<{ id: Preset; label: string }> = [
    { id: "7d", label: "7D" },
    { id: "30d", label: "30D" },
    { id: "90d", label: "90D" },
    { id: "12m", label: "12M" },
    { id: "custom", label: "Custom" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Platform overview</h1>
          <p className="text-sm text-muted-foreground">System-wide subscriptions and revenue.</p>
        </div>
        <div className="flex flex-wrap items-center gap-1 rounded-lg border p-1">
          {presets.map((p) => (
            <Button
              key={p.id}
              variant={preset === p.id ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setPreset(p.id)}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      {preset === "custom" && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ar-from">From</Label>
            <Input
              id="ar-from"
              type="date"
              value={custom.from}
              onChange={(e) => setCustom({ ...custom, from: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ar-to">To</Label>
            <Input
              id="ar-to"
              type="date"
              value={custom.to}
              onChange={(e) => setCustom({ ...custom, to: e.target.value })}
            />
          </div>
          <Button
            variant="outline"
            disabled={!custom.from || !custom.to}
            onClick={() => void load(custom.from, custom.to)}
          >
            Apply
          </Button>
        </div>
      )}

      {loading || !data || !k ? (
        <AdminLoading />
      ) : (
        <>
          <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4")}>
            {cards.map((c) => (
              <Card key={c.label}>
                <CardContent className="pt-4">
                  <div className="text-xs font-medium text-muted-foreground">{c.label}</div>
                  <div className="mt-1 text-2xl font-bold tracking-tight">{c.value}</div>
                  {c.sub && <div className="text-xs text-muted-foreground">{c.sub}</div>}
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Revenue</CardTitle>
              <CardDescription>Collected vs refunded per day, {range.from} → {range.to}.</CardDescription>
            </CardHeader>
            <CardContent className="text-muted-foreground">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.revenueByDay} margin={{ left: 8, right: 8 }}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      tick={tickProps}
                      minTickGap={28}
                      tickFormatter={(d: string) => d.slice(5)}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={tickProps}
                      tickFormatter={(v: number) => moneyAxis(v)}
                      width={56}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      labelFormatter={(d) => (typeof d === "string" ? d : String(d ?? ""))}
                      formatter={(v) => formatMoney(Number(v ?? 0))}
                    />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="collectedMinor"
                      name="Collected"
                      stroke="var(--chart-1)"
                      fill="var(--chart-1)"
                      fillOpacity={0.25}
                    />
                    <Area
                      type="monotone"
                      dataKey="refundedMinor"
                      name="Refunded"
                      stroke="var(--destructive)"
                      fill="var(--destructive)"
                      fillOpacity={0.2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Growth</CardTitle>
                <CardDescription>New workspaces and subscriptions per day.</CardDescription>
              </CardHeader>
              <CardContent className="text-muted-foreground">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.signupsByDay} margin={{ left: 8, right: 8 }}>
                      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tickLine={false}
                        axisLine={false}
                        tick={tickProps}
                        minTickGap={28}
                        tickFormatter={(d: string) => d.slice(5)}
                      />
                      <YAxis tickLine={false} axisLine={false} tick={tickProps} allowDecimals={false} width={32} />
                      <Tooltip contentStyle={tooltipStyle} labelFormatter={(d) => (typeof d === "string" ? d : String(d ?? ""))} />
                      <Legend />
                      <Bar dataKey="orgs" name="Workspaces" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="subscriptions" name="Subscriptions" fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Subscriptions by plan</CardTitle>
                <CardDescription>Current snapshot across all tenants.</CardDescription>
              </CardHeader>
              <CardContent className="text-muted-foreground">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.subsByPlan} layout="vertical" margin={{ left: 8, right: 8 }}>
                      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tickLine={false} axisLine={false} tick={tickProps} allowDecimals={false} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tickLine={false}
                        axisLine={false}
                        tick={tickProps}
                        width={90}
                      />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend />
                      <Bar dataKey="active" name="Active" stackId="s" fill="var(--chart-1)" />
                      <Bar dataKey="trialing" name="Trialing" stackId="s" fill="var(--chart-3)" />
                      <Bar
                        dataKey="pastDue"
                        name="Past due"
                        stackId="s"
                        fill="var(--destructive)"
                        radius={[0, 4, 4, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Monthly revenue</CardTitle>
              <CardDescription>Collected revenue, trailing 12 months.</CardDescription>
            </CardHeader>
            <CardContent className="text-muted-foreground">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.revenueByMonth} margin={{ left: 8, right: 8 }}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} tick={tickProps} tickFormatter={(m: string) => m.slice(2)} />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={tickProps}
                      tickFormatter={(v: number) => moneyAxis(v)}
                      width={56}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      labelFormatter={(m) => (typeof m === "string" ? m : String(m ?? ""))}
                      formatter={(v) => formatMoney(Number(v ?? 0))}
                    />
                    <Bar dataKey="collectedMinor" name="Collected" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

