/**
 * Timezone helpers for briefing schedules.
 *
 * A schedule is not tied to a workspace setting - it runs in the timezone of
 * the computer that created it, so the schedule UI only ever *displays* the
 * zone rather than offering a picker.
 */

/** The computer's own zone, used when a schedule is created. */
export function computerTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** The current wall-clock time in a zone, e.g. "14:32" (24-hour). */
export function localTimeIn(timeZone: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now);
  } catch {
    return "--:--";
  }
}
