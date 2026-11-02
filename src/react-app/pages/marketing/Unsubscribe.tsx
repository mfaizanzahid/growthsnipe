import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import { PageHero } from "../../components/marketing/MarketingBits";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";

export function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<"confirm" | "done" | "invalid" | "sending">(token ? "confirm" : "invalid");
  const [email, setEmail] = useState("");

  useEffect(() => {
    setState(token ? "confirm" : "invalid");
  }, [token]);

  async function confirm() {
    setState("sending");
    try {
      const res = await fetch("/api/marketing/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; email?: string } | null;
      if (!res.ok || !data?.ok) throw new Error("invalid");
      setEmail(data.email ?? "");
      setState("done");
    } catch {
      setState("invalid");
    }
  }

  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Email preferences"
        title="Unsubscribe from marketing emails."
        lede="This stops SNIPE Loops™ and follow-up emails. Account, billing, and trial emails are unaffected."
      />
      <section className="mx-auto w-full max-w-md px-4 pb-14">
        <Card>
          <CardContent className="space-y-4 pt-6 text-center">
            {state === "confirm" && (
              <>
                <p className="text-sm text-muted-foreground">Stop all GrowthSnipe marketing emails to this address?</p>
                <Button className="w-full" onClick={confirm}>
                  Yes, unsubscribe me
                </Button>
                <p>
                  <Link className="text-xs text-muted-foreground underline" to="/">Changed your mind? Back to home</Link>
                </p>
              </>
            )}
            {state === "sending" && <p className="text-sm text-muted-foreground">Working…</p>}
            {state === "done" && (
              <p className="text-sm text-muted-foreground">
                {email ? `Done. No more marketing emails to ${email}.` : "Done. You will receive no further marketing emails."} If you rejoin SNIPE Loops™ later, you will be resubscribed with fresh consent.
              </p>
            )}
            {state === "invalid" && (
              <p className="text-sm text-muted-foreground">
                This link is invalid. Use the unsubscribe link at the bottom of any GrowthSnipe marketing email.
              </p>
            )}
          </CardContent>
        </Card>
      </section>
    </MarketingLayout>
  );
}
