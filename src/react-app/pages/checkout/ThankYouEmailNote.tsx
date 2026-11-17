/** Consistent post-purchase reminder shown on every product thank-you page. */
export function ThankYouEmailNote() {
  return (
    <p className="mt-4 text-sm text-muted-foreground">
      If you do not see the email within a few minutes, check your spam or junk folder before
      contacting support.
    </p>
  );
}
