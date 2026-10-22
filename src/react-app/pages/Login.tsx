import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
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

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  // Deep links (e.g. a protected page) win; otherwise the dashboard.
  const next = from ?? "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const { data: session, isPending: sessionPending } = useSession();

  // Already signed in: don't show the form, go to the app.
  if (!sessionPending && session?.user) return <Navigate to={next} replace />;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      const { error } = await authClient.signIn.email({ email, password, callbackURL: "/dashboard" });
      if (error) throw new Error(error.message ?? "Sign in failed");
      toast.success("Welcome back");
      navigate(next, { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed");
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
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Welcome back.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link className="text-xs/relaxed text-muted-foreground underline" to="/forgot-password">
                  Forgot password?
                </Link>
              </div>
              <PasswordInput id="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <TermsNotice />
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Signing in…" : "Sign in"}
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
            onClick={() => authClient.signIn.social({ provider: "google", callbackURL: "/dashboard" })}
          >
            Continue with Google
          </Button>
          <p className="text-center text-xs/relaxed text-muted-foreground">
            No account? <Link className="underline" to="/signup">Sign up</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
