import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";

interface RunStatus {
  status: string;
  stage: string | null;
  progress: number;
  provider: string | null;
  purpose: string;
  ready: boolean;
  failed: boolean;
}

const STAGE_LABEL: Record<string, string> = {
  awaiting_connection: "Waiting for your platform connection",
  queued: "Queued",
  collecting: "Pulling 12 months of data",
  analyzing: "Analyzing your numbers",
  writing: "Writing your report",
  ready: "Report ready",
  ready_email_failed: "Report ready",
  failed: "Something needs attention",
};

export function DiagnosticStatus() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const flowBlueprint = params.get("flow") === "blueprint";
  const [run, setRun] = useState<RunStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) {
      setError("This link is missing or invalid.");
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`/api/diagnostic/run?token=${encodeURIComponent(token)}`);
      const data = (await res.json().catch(() => ({}))) as { run?: RunStatus; error?: string };
      if (!res.ok || !data.run) throw new Error(data.error ?? "Could not load this Diagnostic");
      setRun(data.run);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this Diagnostic");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 5000);
    return () => clearInterval(id);
  }, [load]);

  const reportUrl = `/api/diagnostic/report?token=${encodeURIComponent(token)}`;
  const blueprint = flowBlueprint || run?.purpose === "blueprint";
  const connectUrl = `/diagnostic/connect?token=${encodeURIComponent(token)}${blueprint ? "&flow=blueprint" : ""}`;
  const progress = Math.max(0, Math.min(100, run?.progress ?? 0));

  return (
    <MarketingLayout>
      <section className="mx-auto w-full max-w-2xl px-4 py-14">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">
          {blueprint ? "SNIPE Blueprint™ baseline" : "SNIPE Diagnostic™"}
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          {blueprint ? "Your Blueprint baseline" : "Your 12-month review"}
        </h1>
        <p className="mt-4 text-muted-foreground">
          {blueprint
            ? "We are building your baseline and 12-month review from your jobs, revenue, referrals, and service mix. We will email you when they are ready, and the team will use them for your SNIPE Blueprint™."
            : "We are reviewing your jobs, revenue, referrals, and service mix. We will email your report when it is ready. Keep this page open or return with the same link to download it."}
        </p>

        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {run ? STAGE_LABEL[run.status] ?? "Working" : "Loading"}
              {run ? (
                <Badge variant={run.ready ? "success" : run.failed ? "destructive" : "default"}>
                  {run.status.replace(/_/g, " ")}
                </Badge>
              ) : null}
            </CardTitle>
            <CardDescription>
              {run?.provider ? `${run.provider === "isn" ? "ISN" : "Spectora"} connected` : "Connect your platform to begin"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-sm text-muted-foreground">{progress}%</p>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            {run?.ready ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {blueprint
                    ? "Check your inbox for the emailed report, or download it here. The team will use your baseline for your SNIPE Blueprint™."
                    : "Check your inbox for the emailed report, or download it here."}
                </p>
                <Button asChild><a href={reportUrl}>Download my report</a></Button>
              </div>
            ) : run?.failed ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {blueprint
                    ? "We could not finish your baseline with the connection provided. Reconnect, or contact us and we will help."
                    : "We could not finish the review with the connection provided. Reconnect, or contact us and we will help."}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline"><Link to={connectUrl}>Reconnect</Link></Button>
                  <Button asChild variant="outline"><Link to="/contact">Contact support</Link></Button>
                </div>
              </div>
            ) : !run || run.status === "awaiting_connection" ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {blueprint
                    ? "Connect your booking software to build your baseline. If you already connected, this page updates on its own."
                    : "Connect your booking software to start the review. If you already connected, this page updates on its own."}
                </p>
                <Button asChild><Link to={connectUrl}>Connect my platform</Link></Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {blueprint
                  ? "This usually takes a few minutes. We will email you when your baseline and report are ready. You can close this page and return with the same link."
                  : "This usually takes a few minutes. You can close this page and return with the same link."}
              </p>
            )}
          </CardContent>
        </Card>

        {loading ? <p className="mt-4 text-xs text-muted-foreground">Loading status…</p> : null}
      </section>
    </MarketingLayout>
  );
}
