import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";
import { authClient, useSession } from "../lib/auth-client";
import { HomeLink } from "../components/HomeLink";
import { AuthBrand } from "../components/AuthBrand";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

/** Seconds before the resend button becomes active (also restarted after each send). */
const RESEND_COOLDOWN_S = 30;

export function VerifyEmail() {
  const location = useLocation();
  const { data: session } = useSession();
  const stateEmail = (location.state as { email?: unknown } | null)?.email;

  const [email, setEmail] = useState(
    typeof stateEmail === "string" ? stateEmail : (session?.user?.email ?? ""),
  );
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S);
  const [resending, setResending] = useState(false);
  const [changing, setChanging] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [saving, setSaving] = useState(false);

  // Session email fills the gap when arriving without signup state (e.g. refresh).
  useEffect(() => {
    if (!email && session?.user?.email) setEmail(session.user.email);
  }, [email, session?.user?.email]);

  // Visible 30s countdown; the resend button activates at zero.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  const verified = session?.user?.emailVerified ?? false;

  async function onResend() {
    const target = email.trim();
    if (!target) {
      toast.error("Enter the email address you signed up with.");
      return;
    }
    setResending(true);
    try {
      const { error } = await authClient.sendVerificationEmail({
        email: target,
        callbackURL: "/onboarding",
      });
      if (error) throw new Error(error.message ?? "Could not resend the link");
      toast.success(`Verification link sent to ${target}`);
      setCooldown(RESEND_COOLDOWN_S);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not resend the link");
    } finally {
      setResending(false);
    }
  }

  async function onChangeEmail(e: React.FormEvent) {
    e.preventDefault();
    const target = newEmail.trim();
    if (!target || !email.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/pending-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentEmail: email.trim(), newEmail: target }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        email?: string;
        error?: string;
      } | null;
      // The new address is authoritative from here on, even if the fresh
      // link failed to send (the user can still Resend below).
      if (data?.email) setEmail(data.email);
      if (!res.ok) throw new Error(data?.error ?? "Could not change the email");
      setChanging(false);
      setNewEmail("");
      setCooldown(RESEND_COOLDOWN_S);
      toast.success(`Verification link sent to ${data?.email ?? target}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change the email");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/40 px-4 py-8">
      <HomeLink />
      <AuthBrand />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Verify your email</CardTitle>
          <CardDescription>
            {email ? (
              <>
                We sent a verification link to <span className="font-medium text-foreground">{email}</span>.
                Click it, then continue to onboarding.
              </>
            ) : (
              "Enter the address you signed up with to resend the verification link."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {verified && (
            <p className="text-center text-sm font-medium text-green-600">
              Your email is verified — you can continue.
            </p>
          )}
          {!email && (
            <div className="space-y-2">
              <Label htmlFor="verify-email">Email</Label>
              <Input
                id="verify-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
          )}
          <Button className="w-full" onClick={onResend} disabled={resending || cooldown > 0 || !email.trim()}>
            {resending ? "Sending…" : cooldown > 0 ? `Resend link in ${cooldown}s` : "Resend verification link"}
          </Button>
          {changing ? (
            <form onSubmit={onChangeEmail} className="space-y-2">
              <Label htmlFor="new-email">New email address</Label>
              <Input
                id="new-email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setChanging(false);
                    setNewEmail("");
                  }}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button type="submit" className="flex-1" disabled={saving || !newEmail.trim()}>
                  {saving ? "Saving…" : "Save and resend"}
                </Button>
              </div>
            </form>
          ) : (
            <Button variant="outline" className="w-full" onClick={() => setChanging(true)}>
              Change email
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
