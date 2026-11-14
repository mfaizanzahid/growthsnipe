import { useEffect, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { EnvelopeIcon } from "@heroicons/react/24/outline";
import { authClient, useSession } from "../lib/auth-client";
import { HomeLink } from "../components/HomeLink";
import { AuthBrand } from "../components/AuthBrand";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { TermsNotice } from "../components/TermsNotice";

// Invite-only sign-in: email + Continue sends a magic link to members and
// invitees. Unknown addresses get an error, not a link.
export function Login() {
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  // Deep links (e.g. a protected page) win; otherwise the dashboard.
  const next = from ?? "/dashboard";
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [resendAfter, setResendAfter] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const { data: session, isPending: sessionPending } = useSession();

  useEffect(() => {
    if (!resendAfter) return;
    const update = () => {
      const left = Math.max(0, Math.ceil((resendAfter - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) setResendAfter(0);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [resendAfter]);

  // Already signed in: don't show the form, go to the app.
  if (!sessionPending && session?.user) return <Navigate to={next} replace />;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const address = email.trim();
    if (!address) return;
    setPending(true);
    try {
      const check = await fetch("/api/account-exists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: address }),
      }).catch(() => null);
      const found = (await check?.json().catch(() => null)) as {
        exists?: boolean;
        invited?: boolean;
        allowed?: boolean;
      } | null;
      const allowed = found?.allowed ?? (found?.exists || found?.invited);
      if (!check?.ok || !allowed) {
        throw new Error("No account uses this email. If you were invited, use your invite link, or book a call and we will send one.");
      }
      const { error } = await authClient.signIn.magicLink({
        email: address,
        callbackURL: "/dashboard",
        newUserCallbackURL: "/onboarding",
      });
      if (error) throw new Error(error.message ?? "Could not send magic link");
      setSent(true);
      setResendAfter(Date.now() + 30_000);
      toast.success(`Sign-in link sent to ${address}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setPending(false);
    }
  }

  async function resend() {
    const address = email.trim();
    if (!address) return;
    setPending(true);
    try {
      const { error } = await authClient.signIn.magicLink({
        email: address,
        callbackURL: "/dashboard",
        newUserCallbackURL: "/onboarding",
      });
      if (error) throw new Error(error.message ?? "Could not resend magic link");
      setResendAfter(Date.now() + 30_000);
      toast.success(`Sign-in link re-sent to ${address}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not resend magic link");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/40 px-4 py-8">
      <HomeLink />
      <AuthBrand />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{sent ? "Check your inbox" : "Sign in"}</CardTitle>
          <CardDescription>
            {sent
              ? `A sign-in link is on its way to ${email.trim()}.`
              : "Enter your work email and we'll send you a sign-in link."}
          </CardDescription>
        </CardHeader>
        {sent && (
          <CardContent className="space-y-4">
            <p className="text-center text-xs/relaxed text-muted-foreground">
              Wrong address? Go back and use a different one.
            </p>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => void resend()}
              disabled={pending || secondsLeft > 0}
            >
              {secondsLeft > 0
                ? `Resend link in ${secondsLeft}s`
                : pending
                  ? "Sending…"
                  : "Resend link"}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setSent(false);
                setResendAfter(0);
                setSecondsLeft(0);
              }}
              disabled={pending}
            >
              Change email
            </Button>
          </CardContent>
        )}
        {!sent && (
          <CardContent className="space-y-4">
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <TermsNotice />
              <Button type="submit" className="w-full" disabled={pending}>
                <EnvelopeIcon className="size-4" />
                {pending ? "Sending…" : "Continue"}
              </Button>
            </form>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              or
              <span className="h-px flex-1 bg-border" />
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => authClient.signIn.social({ provider: "google", callbackURL: "/dashboard" })}
            >
              Continue with Google
            </Button>
            <p className="text-center text-xs/relaxed text-muted-foreground">
              No account yet? <Link className="underline" to="/book">Book a call</Link>
            </p>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
