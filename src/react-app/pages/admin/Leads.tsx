import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../../components/billing/shared";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { AdminDenied, AdminLoading, useAdminGuard } from "./guard";

interface Lead {
  id: string;
  email: string;
  firstName: string;
  businessName: string;
  trade: string;
  unsubscribedAt: number | null;
  createdAt: number;
}

interface SendRow {
  id: string;
  sequence: string;
  stepKey: string;
  dueAt: number;
  sentAt: number | null;
  status: string;
  attempts: number;
}

export function AdminLeads() {
  const allowed = useAdminGuard();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [sends, setSends] = useState<Record<string, SendRow[]>>({});
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerKind, setBuyerKind] = useState("diagnostic");
  const [buyerDate, setBuyerDate] = useState("");

  async function load() {
    try {
      const data = await api("/api/superadmin/loop-leads");
      setLeads(((data as { leads?: Lead[] }).leads ?? []) as Lead[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load leads");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (allowed) void load();
  }, [allowed]);

  async function openLead(id: string) {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    if (sends[id]) return;
    try {
      const data = await api(`/api/superadmin/loop-leads/${id}`);
      setSends((s) => ({ ...s, [id]: ((data as { sends?: SendRow[] }).sends ?? []) as SendRow[] }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load sends");
    }
  }

  async function doResend(leadId: string, sendId: string) {
    setBusy(true);
    try {
      await api("/api/superadmin/loop-leads/resend", { method: "POST", body: JSON.stringify({ sendId }) });
      toast.success("Step re-queued for sending");
      const data = await api(`/api/superadmin/loop-leads/${leadId}`);
      setSends((s) => ({ ...s, [leadId]: ((data as { sends?: SendRow[] }).sends ?? []) as SendRow[] }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Resend failed");
    } finally {
      setBusy(false);
    }
  }

  async function doBuyerTrigger(e: React.FormEvent) {
    e.preventDefault();
    if (!buyerEmail.trim() || !buyerDate) return;
    setBusy(true);
    try {
      await api("/api/superadmin/buyer-reminders", {
        method: "POST",
        body: JSON.stringify({ email: buyerEmail, kind: buyerKind, anchorDate: buyerDate }),
      });
      toast.success("Buyer reminders scheduled");
      setBuyerEmail("");
      setBuyerDate("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not schedule reminders");
    } finally {
      setBusy(false);
    }
  }

  if (allowed === null || (allowed && loading)) return <AdminLoading />;
  if (allowed === false) return <AdminDenied />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Leads</h1>
        <p className="text-sm text-muted-foreground">SNIPE Loops™ captures and buyer reminder sequences.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>SNIPE Loops™ leads</CardTitle>
          <CardDescription>Select a row to see its email ledger.</CardDescription>
        </CardHeader>
        <CardContent>
          {leads.length === 0 ? (
            <p className="text-sm text-muted-foreground">No leads yet.</p>
          ) : (
            <ul className="space-y-2">
              {leads.map((l) => (
                <li key={l.id} className="rounded-lg border">
                  <button className="flex w-full flex-wrap items-center justify-between gap-2 p-3 text-left text-sm" onClick={() => void openLead(l.id)}>
                    <span>
                      <span className="font-medium">{l.email}</span>{" "}
                      <span className="text-muted-foreground">{l.firstName} · {l.businessName} · {l.trade}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {l.unsubscribedAt ? "unsubscribed" : "subscribed"} · {new Date(l.createdAt).toLocaleDateString()}
                    </span>
                  </button>
                  {openId === l.id && (
                    <div className="space-y-1 border-t p-3">
                      {(sends[l.id] ?? []).length === 0 && <p className="text-xs text-muted-foreground">Loading…</p>}
                      {(sends[l.id] ?? []).map((s) => (
                        <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="font-mono">{s.sequence}/{s.stepKey}</span>
                          <span className="text-muted-foreground">
                            {s.status}{s.sentAt ? ` · sent ${new Date(s.sentAt).toLocaleDateString()}` : ` · due ${new Date(s.dueAt).toLocaleDateString()}`}
                            {s.attempts > 0 ? ` · ${s.attempts} attempts` : ""}
                          </span>
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => void doResend(l.id, s.id)}>
                            Resend
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Buyer reminders</CardTitle>
          <CardDescription>Schedule Diagnostic or Blueprint credit reminders anchored at the readout or presentation date.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={doBuyerTrigger} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="space-y-1">
              <Label htmlFor="buyer-email">Email</Label>
              <Input id="buyer-email" type="email" value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="buyer-kind">Sequence</Label>
              <Select value={buyerKind} onValueChange={setBuyerKind}>
                <SelectTrigger id="buyer-kind"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="diagnostic">Diagnostic credit</SelectItem>
                  <SelectItem value="blueprint">Blueprint credit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="buyer-date">Anchor date</Label>
              <Input id="buyer-date" type="date" value={buyerDate} onChange={(e) => setBuyerDate(e.target.value)} required />
            </div>
            <Button type="submit" disabled={busy || !buyerEmail.trim() || !buyerDate}>
              {busy ? "Scheduling…" : "Schedule"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
