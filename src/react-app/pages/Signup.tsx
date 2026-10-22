import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { authClient, useSession } from "../lib/auth-client";
import { PasswordInput } from "../components/PasswordInput";
import { HomeLink } from "../components/HomeLink";
import { AuthBrand } from "../components/AuthBrand";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { TermsNotice } from "../components/TermsNotice";

export function Signup() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const { data: session, isPending: sessionPending } = useSession();

  // Already signed in: don't show the form, go to the dashboard.
  if (!sessionPending && session?.user) return <Navigate to="/dashboard" replace />;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      // Verified accounts already exist: point at sign-in instead of
      // stranding the user on the verify page (Better Auth answers signup
      // with a generic success either way, so check explicitly first).
      const check = await fetch("/api/account-exists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      }).catch(() => null);
      const found = (await check?.json().catch(() => null)) as { exists?: boolean } | null;
      if (check?.ok && found?.exists) {
        toast.error("An account with this email already exists — please sign in.");
        navigate("/login");
        return;
      }
      const { error } = await authClient.signUp.email({ name, email, password, callbackURL: "/onboarding" });
      if (error) throw new Error(error.message ?? "Sign up failed");
      navigate("/verify-email", { state: { email } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign up failed");
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
          <CardTitle>Create your account</CardTitle>
          <CardDescription>Start with a 30-day free trial. No credit card required.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <PasswordInput id="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <TermsNotice />
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Creating" : "Create account"}
            </Button>
          </form>
          <p className="text-center text-xs/relaxed text-muted-foreground">
            <Link className="underline" to="/magic">
              Use a magic link instead
            </Link>
          </p>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => authClient.signIn.social({ provider: "google", callbackURL: "/onboarding" })}
          >
            Continue with Google
          </Button>
          <p className="text-center text-xs/relaxed text-muted-foreground">
            Have an account? <Link className="underline" to="/login">Sign in</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
