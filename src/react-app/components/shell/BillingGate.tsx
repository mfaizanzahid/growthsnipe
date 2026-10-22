import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { LockClosedIcon } from "@heroicons/react/24/outline";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Skeleton } from "../ui/skeleton";
import type { OrgAccessInfo } from "../../hooks/useActiveOrg";

/**
 * Pauses a workspace screen when billing has lapsed. The real page is NOT
 * mounted behind the blur on purpose: gated APIs answer 402, which would flood
 * the UI with raw errors. A static blurred preview stands in so the screen
 * still *looks* open, with a clear "subscribe" card on top.
 */
export function BillingGate({
  gated,
  access,
  isAdmin,
  children,
}: {
  gated: boolean;
  access: OrgAccessInfo | null;
  isAdmin: boolean;
  children: ReactNode;
}) {
  if (!gated) return <>{children}</>;

  const { title, body } = messageFor(access);
  return (
    <div className="relative min-h-[70vh]">
      <div
        className="pointer-events-none select-none space-y-4 blur-[6px]"
        aria-hidden="true"
      >
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80" />
        <div className="grid gap-4 sm:grid-cols-2">
          <PreviewCard />
          <PreviewCard />
        </div>
        <div className="space-y-2 rounded-xl border p-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-2/3" />
        </div>
      </div>

      <div className="absolute inset-0 flex items-start justify-center p-4 sm:p-8">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LockClosedIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              {title}
            </CardTitle>
            <CardDescription>{body}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isAdmin ? (
              <Button asChild className="w-full">
                <Link to="/billing">Subscribe &amp; restore access</Link>
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                Ask a workspace admin to subscribe. Everything comes back the moment they do.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Nothing was deleted — your workspace and its connections are kept as-is.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PreviewCard() {
  return (
    <div className="space-y-3 rounded-xl border p-4">
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-8 w-24" />
    </div>
  );
}

function messageFor(access: OrgAccessInfo | null): { title: string; body: string } {
  const status = access?.status ?? null;
  if (status === "past_due") {
    return {
      title: "Subscription past due",
      body: "Your last payment didn't go through, so this workspace is paused. Settle the balance to restore full access.",
    };
  }
  if (status === "trial_expired") {
    return {
      title: "Your free trial has ended",
      body: "Subscribe to keep using this workspace. Everything you set up is saved and comes back the moment you subscribe.",
    };
  }
  if (status === "canceled") {
    return {
      title: "Your subscription has ended",
      body: "This workspace is paused. Subscribe again to restore full access.",
    };
  }
  return {
    title: "Subscribe to use this workspace",
    body: "An active subscription is required to use this screen. Subscribe to turn it back on.",
  };
}
