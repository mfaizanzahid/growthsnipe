import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CheckCircleIcon, ExclamationCircleIcon } from "@heroicons/react/24/outline";
import { authClient } from "../lib/auth-client";
import { HomeLink } from "../components/HomeLink";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";

export function AcceptInvitation() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<"pending" | "done" | "error">("pending");
  const [message, setMessage] = useState("Accepting invitation…");

  useEffect(() => {
    if (!id) {
      setState("error");
      setMessage("Missing invitation id.");
      return;
    }
    authClient.organization
      .acceptInvitation({ invitationId: id })
      .then(({ error }) => {
        if (error) {
          setState("error");
          setMessage(error.message ?? "Could not accept the invitation.");
          return;
        }
        setState("done");
        navigate("/dashboard");
      })
      .catch((err: unknown) => {
        setState("error");
        setMessage(err instanceof Error ? err.message : "Could not accept the invitation.");
      });
  }, [id, navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/40 px-4">
      <HomeLink />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Invitation</CardTitle>
        </CardHeader>
        <CardContent>
          {state === "pending" ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <p className="text-sm text-muted-foreground">{message}</p>
            </div>
          ) : state === "done" ? (
            <p className="flex items-center gap-2 text-sm text-green-700">
              <CheckCircleIcon className="size-5" /> Joined. Taking you to the dashboard…
            </p>
          ) : (
            <p className="flex items-center gap-2 text-sm text-red-600">
              <ExclamationCircleIcon className="size-5" /> {message}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
