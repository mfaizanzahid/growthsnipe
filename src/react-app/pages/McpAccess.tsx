import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { PlusIcon } from "@heroicons/react/24/outline";
import { authClient } from "../lib/auth-client";
import { api, type McpToken, type OAuthGrant, type SidekickConnection } from "../lib/sidekick";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Checkbox } from "../components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Skeleton } from "../components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../components/ui/tooltip";

const WRITABLE_ACTIONS = [
  "create_client", "update_client", "delete_client",
  "create_order", "update_order", "cancel_order", "delete_order", "reschedule_order",
  "create_agent", "update_agent", "delete_agent",
  "send_message",
] as const;

type AiClient = "claude" | "chatgpt" | "gemini" | "others";

const AI_CLIENT_LABELS: Record<AiClient, string> = {
  claude: "Claude",
  chatgpt: "ChatGPT",
  gemini: "Gemini",
  others: "Others",
};

const AI_CLIENT_STEPS: Record<AiClient, { title: string; steps: string[]; fallback?: string }> = {
  claude: {
    title: "Connect Claude",
    steps: [
      "Copy the MCP server URL above.",
      "In Claude, go to Settings → Connectors → Add custom connector.",
      "For authentication, choose OAuth (or “Required when the server asks” — the server answers with OAuth discovery).",
      "Paste the MCP server URL as the server URL and continue.",
      "Complete the browser sign-in when prompted: pick the workspace (organization) to authorize, then approve.",
      "Ask Claude something like “How did my business perform recently?” to confirm live data is flowing.",
    ],
  },
  chatgpt: {
    title: "Connect ChatGPT",
    steps: [
      "Copy the MCP server URL above.",
      "In ChatGPT, open Settings → Connected apps (or Apps / MCP servers, depending on your plan) → Add a custom MCP server.",
      "Choose OAuth / sign-in authentication when asked.",
      "Paste the MCP server URL as the server URL and continue.",
      "Complete the browser sign-in when prompted: pick the workspace (organization) to authorize, then approve.",
      "Start a new chat and ask about your business to confirm the connection works.",
    ],
  },
  gemini: {
    title: "Connect Gemini",
    steps: [
      "Copy the MCP server URL above.",
      "In Gemini, open Settings → Extensions / Connected apps (or MCP servers, depending on availability) → Add a custom server.",
      "Choose OAuth / sign-in authentication when asked.",
      "Paste the MCP server URL as the server URL and continue.",
      "Complete the browser sign-in when prompted: pick the workspace (organization) to authorize, then approve.",
      "Ask Gemini about a recent job or client to confirm live data is flowing.",
    ],
  },
  others: {
    title: "Connect another AI client",
    steps: [
      "Copy the MCP server URL above.",
      "In your AI client, find the MCP / integrations / connected-apps setting and add a custom MCP server (Streamable HTTP).",
      "Choose OAuth / sign-in authentication — the server answers with OAuth discovery automatically.",
      "Paste the MCP server URL as the server URL and continue.",
      "Complete the browser sign-in when prompted: pick the workspace (organization) to authorize, then approve.",
    ],
    fallback: "If your client does not support OAuth sign-in, create a token below and connect with an Authorization: Bearer header (or the ?apiKey= connector URL shown once after creation).",
  },
};

/** MCP access: organization-scoped connection hub for AI clients. */
export function McpAccess() {
  const { data: activeOrg } = authClient.useActiveOrganization();
  const orgId = activeOrg?.id ?? null;
  const [tokens, setTokens] = useState<McpToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [grants, setGrants] = useState<OAuthGrant[]>([]);
  const [grantsLoading, setGrantsLoading] = useState(true);
  const [connections, setConnections] = useState<SidekickConnection[] | null>(null);
  const [connectionsLoading, setConnectionsLoading] = useState(true);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [tokenModalOpen, setTokenModalOpen] = useState(false);
  const [guideClient, setGuideClient] = useState<AiClient | null>(null);

  const mcpUrl = typeof window !== "undefined" ? `${window.location.origin}/mcp` : "/mcp";

  async function load(id: string) {
    setLoading(true);
    try {
      const data = await api<{ tokens: McpToken[] }>(`/api/sidekick/mcp-tokens?orgId=${id}`);
      setTokens(data.tokens);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load tokens");
    } finally {
      setLoading(false);
    }
  }

  async function loadConnections(id: string) {
    setConnectionsLoading(true);
    try {
      const data = await api<{ connections: SidekickConnection[] }>(
        `/api/sidekick/connections?orgId=${id}`,
      );
      setConnections(data.connections);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load connections");
      setConnections(null);
    } finally {
      setConnectionsLoading(false);
    }
  }

  async function loadGrants(id: string) {
    setGrantsLoading(true);
    try {
      const data = await api<{ grants: OAuthGrant[] }>(`/api/sidekick/oauth-grants?orgId=${id}`);
      setGrants(data.grants);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load connected apps");
    } finally {
      setGrantsLoading(false);
    }
  }

  useEffect(() => {
    if (orgId) {
      void load(orgId);
      void loadConnections(orgId);
      void loadGrants(orgId);
    }
  }, [orgId]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setCreating(true);
    try {
      const data = await api<{ id: string; token: string }>(`/api/sidekick/mcp-tokens`, {
        method: "POST",
        body: JSON.stringify({ orgId, name }),
      });
      setFreshToken(data.token);
      setName("");
      setTokenModalOpen(false);
      await load(orgId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create token");
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    if (!orgId || !confirm("Revoke this token? Connected AI clients will lose access immediately.")) return;
    try {
      await api(`/api/sidekick/mcp-tokens/${id}/revoke?orgId=${orgId}`, { method: "POST", body: "{}" });
      toast.success("Token revoked");
      await load(orgId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not revoke token");
    }
  }

  async function revokeGrant(grant: OAuthGrant) {
    if (!orgId || !confirm(`Disconnect ${grant.name}? It will lose access to this workspace immediately.`)) return;
    try {
      await api(`/api/sidekick/oauth-grants/${grant.clientId}/revoke?orgId=${orgId}`, { method: "POST", body: "{}" });
      toast.success(`${grant.name} disconnected`);
      await loadGrants(orgId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not disconnect app");
    }
  }

  if (!orgId) return <p className="text-sm text-muted-foreground">Select a workspace to manage AI access.</p>;

  if (connectionsLoading) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AI access</h1>
          <p className="text-sm text-muted-foreground">Connect your AI client to your business data through GrowthSnipe.</p>
        </div>
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (connections !== null && connections.length === 0) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AI access</h1>
          <p className="text-sm text-muted-foreground">Connect your AI client to your business data through GrowthSnipe.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Connect a platform first</CardTitle>
            <CardDescription>
              AI access needs a connected platform before your AI can read your business data.
              Connect Spectora or ISN first, then come back here to connect your AI.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/connections">Connect platform</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const guide = guideClient ? AI_CLIENT_STEPS[guideClient] : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">AI access</h1>
        <p className="text-sm text-muted-foreground">Connect your AI client to your business data through GrowthSnipe.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>How to connect your AI</CardTitle>
          <CardDescription>
            This is the MCP server URL — it is required to connect any AI. Paste it into your AI client when adding a
            custom MCP server. It uses OAuth by default: sign in with your GrowthSnipe account and pick the workspace
            to authorize.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>MCP server URL</Label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <code className="block flex-1 rounded bg-muted p-3 text-xs break-all">{mcpUrl}</code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(mcpUrl).then(
                    () => toast.success("Copied"),
                    () => toast.error("Copy failed"),
                  );
                }}
              >
                Copy URL
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ai-client-select">Learn how to connect your AI client</Label>
            <Select
              value={guideClient ?? ""}
              onValueChange={(v) => setGuideClient(v as AiClient)}
            >
              <SelectTrigger id="ai-client-select" className="w-full sm:max-w-xs">
                <SelectValue placeholder="Select your AI client" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(AI_CLIENT_LABELS) as AiClient[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {AI_CLIENT_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {freshToken && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle>Copy your token now</CardTitle>
            <CardDescription>It will never be shown again. Keep the URL out of repos and shared logs — the key is in it.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <code className="block rounded bg-muted p-3 text-xs break-all">{freshToken}</code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(freshToken).then(
                  () => toast.success("Copied"),
                  () => toast.error("Copy failed"),
                );
              }}
            >
              Copy token
            </Button>
            <div className="space-y-1">
              <p className="text-sm font-medium">“No sign-in” connector URL (for clients without OAuth)</p>
              <code className="block rounded bg-muted p-3 text-xs break-all">
                {typeof window !== "undefined" ? `${window.location.origin}/mcp?apiKey=${freshToken}` : ""}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(`${window.location.origin}/mcp?apiKey=${freshToken}`).then(
                    () => toast.success("Copied"),
                    () => toast.error("Copy failed"),
                  );
                }}
              >
                Copy connector URL
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div className="space-y-1.5">
            <CardTitle>Tokens</CardTitle>
            <CardDescription>
              A token can be used for an AI client where OAuth is not supported. Create one, then connect with an
              Authorization bearer header (or the connector URL shown once after creation).
            </CardDescription>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="default"
                  size="icon-sm"
                  aria-label="New token"
                  onClick={() => setTokenModalOpen(true)}
                >
                  <PlusIcon className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>New token</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-12 w-full" />
          ) : tokens.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tokens yet — use the + button above to create one.</p>
          ) : (
            <ul className="space-y-2">
              {tokens.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 rounded-lg border p-3">
                  <div>
                    <div className="flex items-center gap-2 font-medium">
                      {t.name}
                      {t.revokedAt ? <Badge variant="destructive">revoked</Badge> : <Badge variant="success">active</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Prefix {t.tokenPrefix} · Last used {t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleString() : "never"}
                    </div>
                  </div>
                  {!t.revokedAt && (
                    <Button variant="outline" size="sm" onClick={() => void revoke(t.id)}>
                      Revoke
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connected AI apps</CardTitle>
          <CardDescription>
            AI apps connected via OAuth sign-in. Disconnecting revokes their access immediately — the app will ask to sign in again next time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {grantsLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : grants.length === 0 ? (
            <p className="text-sm text-muted-foreground">No AI apps connected via OAuth yet — connect one above with your MCP server URL.</p>
          ) : (
            <ul className="space-y-2">
              {grants.map((g) => (
                <li key={g.clientId} className="flex items-center justify-between gap-2 rounded-lg border p-3">
                  <div>
                    <div className="flex items-center gap-2 font-medium">
                      {g.name}
                      <Badge variant="success">connected</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Connected {g.connectedAt ? new Date(g.connectedAt).toLocaleString() : "recently"}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => void revokeGrant(g)}>
                    Disconnect
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={tokenModalOpen} onOpenChange={setTokenModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New token</DialogTitle>
            <DialogDescription>Requires an org admin. Name it after the client, e.g. “Claude desktop”.</DialogDescription>
          </DialogHeader>
          <form onSubmit={create} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="token-name">Token name</Label>
              <Input id="token-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={creating || !name.trim()}>
                {creating ? "Creating…" : "Create token"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={guide !== null} onOpenChange={(open) => { if (!open) setGuideClient(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{guide?.title ?? ""}</DialogTitle>
            <DialogDescription>
              Step-by-step setup using the MCP server URL (<code className="rounded bg-muted px-1">{mcpUrl}</code>).
              OAuth sign-in is the default path.
            </DialogDescription>
          </DialogHeader>
          {guide && (
            <ol className="list-decimal space-y-2 pl-5 text-sm">
              {guide.steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          )}
          {guide?.fallback && <p className="text-sm text-muted-foreground">{guide.fallback}</p>}
          <DialogFooter showCloseButton>
            <Button
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(mcpUrl).then(
                  () => toast.success("Copied"),
                  () => toast.error("Copy failed"),
                );
              }}
            >
              Copy MCP server URL
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <WritePolicyCard orgId={orgId} />
    </div>
  );
}

function WritePolicyCard({ orgId }: { orgId: string }) {
  const [permission, setPermission] = useState<"READ" | "SUGGEST" | "EXECUTE">("READ");
  const [allowed, setAllowed] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<{ policy: { writePermission: string; allowedActions: string[] } }>(
      `/api/sidekick/policy?orgId=${orgId}`,
    )
      .then((d) => {
        setPermission(d.policy.writePermission as "READ" | "SUGGEST" | "EXECUTE");
        setAllowed(d.policy.allowedActions);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Could not load policy"))
      .finally(() => setLoading(false));
  }, [orgId]);

  function toggle(action: string, on: boolean) {
    setAllowed((prev) => (on ? [...prev, action] : prev.filter((a) => a !== action)));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/sidekick/policy", {
        method: "PATCH",
        body: JSON.stringify({ orgId, writePermission: permission, allowedActions: allowed }),
      });
      toast.success("Write policy saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save policy");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Write policy</CardTitle>
        <CardDescription>
          Which write tools AI clients may use. READ exposes data tools only; SUGGEST returns proposals without acting; EXECUTE performs provider-confirmed actions with audit. Unsupported actions answer “not currently supported”.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-12 w-full" />
        ) : (
          <form onSubmit={save} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="write-permission">Permission level</Label>
              <Select value={permission} onValueChange={(v) => setPermission(v as "READ" | "SUGGEST" | "EXECUTE")}>
                <SelectTrigger id="write-permission"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="READ">READ — data tools only</SelectItem>
                  <SelectItem value="SUGGEST">SUGGEST — proposals, no actions</SelectItem>
                  <SelectItem value="EXECUTE">EXECUTE — audited actions</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {permission === "EXECUTE" && (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Allowed actions</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {WRITABLE_ACTIONS.map((a) => (
                    <label key={a} className="flex cursor-pointer items-center gap-2 text-sm">
                      <Checkbox checked={allowed.includes(a)} onCheckedChange={(v) => toggle(a, v === true)} />
                      <code className="rounded bg-muted px-1">{a}</code>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save policy"}</Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
