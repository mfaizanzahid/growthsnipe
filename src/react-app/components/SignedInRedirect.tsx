import { Navigate } from "react-router-dom";
import { useSession } from "../lib/auth-client";

/** Signed-in users never see auth pages — send them to the dashboard. */
export function SignedInRedirect({ to = "/dashboard" }: { to?: string }) {
  const { data: session, isPending } = useSession();
  if (isPending || !session?.user) return null;
  return <Navigate to={to} replace />;
}
