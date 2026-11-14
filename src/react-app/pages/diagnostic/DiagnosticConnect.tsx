import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { PasswordInput } from "../../components/PasswordInput";
import { CredentialHelpLink } from "../../components/CredentialHelp";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";

export function DiagnosticConnect() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [provider, setProvider] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [companyKey, setCompanyKey] = useState("");
  const [host, setHost] = useState("");
  const [accessKey, setAccessKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const canSave =
    provider === "spectora"
      ? Boolean(apiKey)
      : provider === "isn"
        ? Boolean(companyKey && host && accessKey && secretKey)
        : false;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !canSave) return;
    setSaving(true);
    try {
      const credentials =
        provider === "spectora"
          ? { apiKey }
          : { companyKey, host, accessKey, secretKey };
      const res = await fetch("/api/diagnostic/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, provider, credentials }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not connect your platform");
      setApiKey("");
      setCompanyKey("");
      setHost("");
      setAccessKey("");
      setSecretKey("");
      setDone(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not connect your platform");
    } finally {
      setSaving(false);
    }
  }

  return (
    <MarketingLayout>
      <section className="mx-auto w-full max-w-2xl px-4 py-14">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">SNIPE Diagnostic™</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Connect your booking software</h1>
        <p className="mt-4 text-muted-foreground">
          Connect your field service and booking management software so we can review your last 12
          months of jobs, revenue, referrals, and service mix. The credentials are encrypted, used
          only for this Diagnostic, and removed once your report is ready.
        </p>

        {!token ? (
          <Card className="mt-8">
            <CardHeader>
              <CardTitle>This link is missing or invalid</CardTitle>
              <CardDescription>Open the connect link from your purchase email, or contact us for a fresh one.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline"><Link to="/contact">Contact support</Link></Button>
            </CardContent>
          </Card>
        ) : done ? (
          <Card className="mt-8">
            <CardHeader>
              <CardTitle>Connected. We are pulling your data.</CardTitle>
              <CardDescription>
                The 12-month review has started. We will email your report when it is ready. You
                can also watch progress and download it here.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild><Link to={`/diagnostic/status?token=${encodeURIComponent(token)}`}>View progress</Link></Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="mt-8">
            <CardHeader>
              <CardTitle>Your platform</CardTitle>
              <CardDescription>Choose where your jobs and revenue live. Secrets are never shown again.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={submit} className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="diag-provider">Platform</Label>
                    <CredentialHelpLink provider={provider} />
                  </div>
                  <Select value={provider || undefined} onValueChange={setProvider}>
                    <SelectTrigger id="diag-provider"><SelectValue placeholder="Select a platform" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="spectora">Spectora</SelectItem>
                      <SelectItem value="isn">ISN</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {provider === "spectora" && (
                  <div className="space-y-2">
                    <Label htmlFor="diag-api-key">Spectora API key</Label>
                    <PasswordInput
                      id="diag-api-key"
                      autoComplete="off"
                      placeholder="Spectora API key"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                    />
                  </div>
                )}
                {provider === "isn" && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="diag-company">Company key</Label>
                      <Input id="diag-company" autoComplete="off" placeholder="Your ISN company key" value={companyKey} onChange={(e) => setCompanyKey(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="diag-host">ISN host</Label>
                      <Input id="diag-host" autoComplete="off" inputMode="url" placeholder="inspectionsupport.com or your white-label domain" value={host} onChange={(e) => setHost(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="diag-access">Access key</Label>
                      <PasswordInput id="diag-access" autoComplete="off" placeholder="ISN access key" value={accessKey} onChange={(e) => setAccessKey(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="diag-secret">Secret key</Label>
                      <PasswordInput id="diag-secret" autoComplete="off" placeholder="ISN secret access key" value={secretKey} onChange={(e) => setSecretKey(e.target.value)} />
                    </div>
                  </>
                )}
                <Button type="submit" disabled={saving || !canSave}>
                  {saving ? "Checking connection…" : "Connect and start my Diagnostic"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </section>
    </MarketingLayout>
  );
}
