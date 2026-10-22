export type TrialNoticeKind = "trial" | "expired" | "past_due" | "prepaid";

/**
 * Trial urgency drives the app-shell notice bar colour: brand blue while there
 * is time, amber inside the last week, red on the final day and once the trial
 * is over. Threshold copy is deliberately shared with the server's reminder
 * cadence (5/3/0 days) so the bar never contradicts the emails. A prepaid
 * trial is not a warning: the customer has already paid, so it stays calm.
 */
export function noticeTone(kind: TrialNoticeKind, daysLeft?: number): string {
  if (kind === "expired" || kind === "past_due") return "bg-red-600 text-white";
  if (kind === "prepaid") return "bg-primary text-primary-foreground";
  if (kind !== "trial" || daysLeft === undefined) return "bg-primary text-primary-foreground";
  if (daysLeft < 1) return "bg-red-600 text-white";
  if (daysLeft < 7) return "bg-orange-500 text-orange-950";
  return "bg-primary text-primary-foreground";
}