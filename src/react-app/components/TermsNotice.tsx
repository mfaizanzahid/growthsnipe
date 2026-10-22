import { Link } from "react-router-dom";

/** Plain-text consent line shown above auth form buttons (no checkbox). */
export function TermsNotice() {
  return (
    <p className="text-center text-xs/relaxed text-muted-foreground">
      By continuing you agree to the{" "}
      <Link className="underline" to="/terms" target="_blank" rel="noreferrer">
        Terms of Service
      </Link>{" "}
      and{" "}
      <Link className="underline" to="/privacy" target="_blank" rel="noreferrer">
        Privacy Policy
      </Link>
      .
    </p>
  );
}
