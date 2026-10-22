import { useState } from "react";
import { toast } from "sonner";
import { api, type SidekickConnection } from "../lib/sidekick";
import { PLATFORM_OPTIONS } from "../lib/platforms";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

/**
 * Connect-a-platform form (Spectora API key or ISN company/host/access keys).
 * Shared by the Connections page and the onboarding connect step. Secrets are
 * posted to the server and never rendered back.
 */
export function ConnectPlatformForm({
  orgId,
  onConnected,
  submitLabel = "Save connection",
}: {
  orgId: string;
  onConnected?: (connection: SidekickConnection) => void;
  submitLabel?: string;
}) {
  const [provider, setProvider] = useState<string>("spectora");
  const [apiKey, setApiKey] = useState("");
  const [companyKey, setCompanyKey] = useState("");
  const [host, setHost] = useState("");
  const [accessKey, setAccessKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [saving, setSaving] = useState(false);

  const canSave =
    provider === "spectora"
      ? Boolean(apiKey)
      : Boolean(companyKey && host && accessKey && secretKey);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setSaving(true);
    try {
      const body =
        provider === "spectora"
          ? {
              orgId,
              provider,
              apiKey: apiKey || undefined,
            }
          : {
              orgId,
              provider,
              companyKey: companyKey || undefined,
              host: host || undefined,
              accessKey: accessKey || undefined,
              secretKey: secretKey || undefined,
            };
      const data = await api<{ connection: SidekickConnection }>("/api/sidekick/connections", {
        method: "POST",
        body: JSON.stringify(body),
      });
      toast.success(`${data.connection.provider} connected`);
      setApiKey("");
      setCompanyKey("");
      setHost("");
      setAccessKey("");
      setSecretKey("");
      onConnected?.(data.connection);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save connection");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="platform-provider">Platform</Label>
        <Select value={provider} onValueChange={setProvider}>
          <SelectTrigger id="platform-provider"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PLATFORM_OPTIONS.map((p) => (
              <SelectItem key={p.key} value={p.key} disabled={p.status === "coming-soon"}>
                {p.label}{p.status === "coming-soon" ? " (coming soon)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {provider === "spectora" ? (
        <div className="space-y-2">
          <Label htmlFor="platform-api-key">API key</Label>
          <Input id="platform-api-key" type="password" autoComplete="off" placeholder="Spectora API key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor="platform-isn-company">Company key</Label>
            <Input id="platform-isn-company" autoComplete="off" placeholder="Your ISN company key" value={companyKey} onChange={(e) => setCompanyKey(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="platform-isn-host">ISN host</Label>
            <Input id="platform-isn-host" autoComplete="off" inputMode="url" required placeholder="inspectionsupport.com or your white-label domain" value={host} onChange={(e) => setHost(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="platform-isn-access">Access key</Label>
            <Input id="platform-isn-access" autoComplete="off" placeholder="ISN access key (Basic-auth username)" value={accessKey} onChange={(e) => setAccessKey(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="platform-isn-secret">Secret key</Label>
            <Input id="platform-isn-secret" type="password" autoComplete="off" placeholder="ISN secret access key (never shown again)" value={secretKey} onChange={(e) => setSecretKey(e.target.value)} />
          </div>
        </>
      )}
      <Button type="submit" disabled={saving || !canSave}>
        {saving ? "Connecting…" : submitLabel}
      </Button>
    </form>
  );
}
