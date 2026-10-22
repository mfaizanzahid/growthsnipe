import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PlusIcon } from "@heroicons/react/24/outline";
import { authClient } from "../lib/auth-client";
import { api, type SidekickConnection } from "../lib/sidekick";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Skeleton } from "../components/ui/skeleton";
import { ConnectPlatformForm } from "../components/ConnectPlatformForm";

/** Provider connections: Spectora (API key/OAuth) + ISN (company key + access keys). Secrets never render. */
export function Connections() {
  const { data: activeOrg } = authClient.useActiveOrganization();
  const orgId = activeOrg?.id ?? null;
  const [connections, setConnections] = useState<SidekickConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectOpen, setConnectOpen] = useState(false);

  async function load(id: string) {
    setLoading(true);
    try {
      const data = await api<{ connections: SidekickConnection[] }>(
        `/api/sidekick/connections?orgId=${id}`,
      );
      setConnections(data.connections);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load connections");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (orgId) void load(orgId);
  }, [orgId]);

  async function remove(id: string) {
    if (!orgId || !confirm("Disconnect this provider? Scheduled briefings will stop working.")) return;
    try {
      await api(`/api/sidekick/connections/${id}?orgId=${orgId}`, { method: "DELETE" });
      toast.success("Disconnected");
      await load(orgId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not disconnect");
    }
  }

  if (!orgId) return <p className="text-sm text-muted-foreground">Select a workspace to manage connections.</p>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Connections</h1>
        <p className="text-sm text-muted-foreground">Link your field-service platform. Credentials are encrypted at rest and never shown again.</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div className="space-y-1.5">
            <CardTitle>Connected platforms</CardTitle>
            <CardDescription>
              One platform per workspace. Credentials are encrypted at rest and never shown again.
            </CardDescription>
          </div>
          <Button
            variant="default"
            size="sm"
            onClick={() => setConnectOpen(true)}
          >
            <PlusIcon className="size-4" />
            Connect a platform
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
          ) : connections.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing connected yet. Connect your first platform with the button above.</p>
          ) : (
            <ul className="space-y-2">
              {connections.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg border p-3">
                  <div>
                    <div className="flex items-center gap-2 font-medium capitalize">
                      {c.provider} <Badge variant={c.status === "connected" ? "success" : "default"}>{c.status}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Updated {new Date(c.updatedAt).toLocaleString()}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => void remove(c.id)}>
                    Disconnect
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect a platform</DialogTitle>
            <DialogDescription>
              One platform per workspace. Spectora connects with an API key. ISN connects with your
              company key, host, and access keys (Settings → My Access Keys in ISN).
            </DialogDescription>
          </DialogHeader>
          {connections.length > 0 ? (
            <p className="text-sm text-muted-foreground">
              This workspace is already connected. Disconnect it above to switch platforms.
            </p>
          ) : (
            <ConnectPlatformForm
              orgId={orgId}
              onConnected={() => {
                setConnectOpen(false);
                void load(orgId);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
