import { useState } from "react";
import { Link } from "react-router-dom";
import { EnvelopeIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { authClient } from "../lib/auth-client";
import { AuthBrand } from "../components/AuthBrand";
import { HomeLink } from "../components/HomeLink";
import { SignedInRedirect } from "../components/SignedInRedirect";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { TermsNotice } from "../components/TermsNotice";

export function MagicLink() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const { error } = await authClient.signIn.magicLink({
        email,
        callbackURL: "/dashboard",
        newUserCallbackURL: "/onboarding",
      });
      if (error) throw new Error(error.message ?? "Could not send magic link");
      setSent(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send magic link");
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/40 px-4 py-8">
      <SignedInRedirect />
      <HomeLink />
      <AuthBrand />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{sent ? "Check your inbox" : "Magic link sign in"}</CardTitle>
          <CardDescription>
            {sent
              ? `A sign-in link is on its way to ${email}. It expires in 5 minutes.`
              : "No password needed we'll email you a sign-in link."}
          </CardDescription>
        </CardHeader>
        {!sent && (
          <CardContent className="space-y-4">
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <TermsNotice />
              <Button type="submit" className="w-full">
                <EnvelopeIcon className="size-4" /> Send magic link
              </Button>
            </form>
            <p className="text-center text-xs/relaxed text-muted-foreground">
              <Link className="underline" to="/login">Back to sign in</Link>
            </p>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
