import { useEffect, useState } from "react";
import { toast } from "sonner";
import { authClient } from "../lib/auth-client";
import { api } from "../lib/sidekick";
import { Badge } from "../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";

interface AuditEvent {
  id: string;
  principalType: string;
  principalId: string;
  provider: string;
  tool: string;
  targetType: string | null;
  targetId: string | null;
  status: string;
  correlationId: string;
  createdAt: string;
}

/** Write/action audit log (org admins). */
export function AuditLog() {
  const { data: activeOrg } = authClient.useActiveOrganization();
  const orgId = activeOrg?.id ?? null;
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api<{ events: AuditEvent[] }>(`/api/sidekick/audit?orgId=${orgId}&limit=100`)
      .then((d) => setEvents(d.events))
      .catch((err) => {
        if (err instanceof Error && /forbidden/i.test(err.message)) setDenied(true);
        else toast.error(err instanceof Error ? err.message : "Could not load audit log");
      })
      .finally(() => setLoading(false));
  }, [orgId]);

  if (!orgId) return <p className="text-sm text-muted-foreground">Select a workspace to view its audit log.</p>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit log</h1>
        <p className="text-sm text-muted-foreground">Every provider write attempted through MCP, with actor and outcome.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Write events</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-12 w-full" />
          ) : denied ? (
            <p className="text-sm text-muted-foreground">Only org admins can view the audit log.</p>
          ) : events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No write actions recorded yet. Data-tool reads are not logged.</p>
          ) : (
            <ul className="space-y-2">
              {events.map((e) => (
                <li key={e.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={e.status === "success" ? "success" : "destructive"}>{e.status}</Badge>
                    <span className="font-medium">{e.tool}</span>
                    <span className="text-muted-foreground">
                      {e.provider} · {e.principalType} · {new Date(e.createdAt).toLocaleString()}
                    </span>
                  </div>
                  {e.targetId && <div className="mt-1 text-xs text-muted-foreground">Target: {e.targetType ?? "-"} {e.targetId}</div>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
