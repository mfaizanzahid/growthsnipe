export type Preset =
  | "30d"
  | "90d"
  | "12m"
  | "ytd"
  | "5y"
  | "cur_month"
  | "prev_month"
  | "last_year"
  | "all"
  | "custom";

export const PRESET_OPTIONS: Array<{ value: Preset; label: string }> = [  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "12m", label: "Last 12 months" },
  { value: "5y", label: "Last 5 years" },
  { value: "cur_month", label: "Current month" },
  { value: "prev_month", label: "Previous month" },
  { value: "ytd", label: "Current year" },
  { value: "last_year", label: "Previous year" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom range" },
];

/**
 * All-time preset label with its dynamic start, e.g.
 * "All time (Oct-2021 onwards)". Falls back to plain "All time" until the
 * warehouse history bounds load or when the warehouse is empty.
 */
const MON_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function allTimeLabel(historyStartIso?: string | null): string {
  const ms = historyStartIso ? new Date(historyStartIso).getTime() : NaN;
  if (!Number.isFinite(ms)) return "All time";
  const d = new Date(ms);
  return `All time (${MON_ABBR[d.getUTCMonth()]}-${d.getUTCFullYear()} onwards)`;
}

/**
 * Resolve a period preset to an ISO range.
 *
 * Every range is day-aligned: `from` is a day start, `to` is the exclusive
 * end (start of the day after the last covered day), all at UTC midnight.
 * Calendar presets (ytd, cur_month, prev_month, last_year) take the
 * year/month from the local date for intent. Day alignment serves two
 * purposes: ISO strings always read on the 01st rather than the previous
 * month's last date east of UTC, and a preset converted to custom dates
 * resolves to the byte-identical range (see inclusiveEndDate), so switching
 * presets never silently narrows or widens the data.
 */
export function presetRange(p: Preset, customFrom: string, customTo: string, now: Date = new Date(), historyStartIso?: string | null): { from: string; to: string } {
  const day = 86400000;
  const iso = (ms: number) => new Date(ms).toISOString();
  // Start of today (UTC) and exclusive end covering the whole current day.
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const endOfToday = todayUTC + day;
  if (p === "30d") return { from: iso(todayUTC - 29 * day), to: iso(endOfToday) };
  if (p === "90d") return { from: iso(todayUTC - 89 * day), to: iso(endOfToday) };
  if (p === "12m") return { from: iso(todayUTC - 364 * day), to: iso(endOfToday) };
  if (p === "5y") return { from: iso(Date.UTC(now.getUTCFullYear() - 5, now.getUTCMonth(), now.getUTCDate())), to: iso(endOfToday) };
  if (p === "ytd") {
    return { from: iso(Date.UTC(now.getUTCFullYear(), 0, 1)), to: iso(endOfToday) };
  } else if (p === "cur_month") {
    return { from: iso(Date.UTC(now.getFullYear(), now.getMonth(), 1)), to: iso(endOfToday) };
  } else if (p === "prev_month") {
    return {
      from: iso(Date.UTC(now.getFullYear(), now.getMonth() - 1, 1)),
      to: iso(Date.UTC(now.getFullYear(), now.getMonth(), 1)),
    };
  } else if (p === "last_year") {
    return {
      from: iso(Date.UTC(now.getFullYear() - 1, 0, 1)),
      to: iso(Date.UTC(now.getFullYear(), 0, 1)),
    };
  } else if (p === "all") {
    // Dynamic start: the earliest order in the warehouse, floored to its UTC
    // day. Falls back to 2000 until the history bounds load (or when empty).
    const minMs = historyStartIso ? new Date(historyStartIso).getTime() : NaN;
    const startMs = Number.isFinite(minMs)
      ? Date.UTC(
          new Date(minMs).getUTCFullYear(),
          new Date(minMs).getUTCMonth(),
          new Date(minMs).getUTCDate(),
        )
      : Date.parse("2000-01-01T00:00:00Z");
    return { from: iso(startMs), to: iso(endOfToday) };
  }
  // Custom dates from <input type="date"> are date-only strings. The server
  // treats `to` as exclusive, so a date-only end must roll to the next day's
  // midnight ("through Oct 23") instead of midnight at its start (which would
  // silently drop the whole end day and skew both totals and the derived
  // previous-period window versus the equivalent preset). Both ends normalize
  // to full ISO midnights so a preset converted to custom dates resolves to
  // the byte-identical range (no refetch, no new figures on switch).
  let fromIso = customFrom || now.toISOString();
  if (/^\d{4}-\d{2}-\d{2}$/.test(customFrom)) {
    fromIso = `${customFrom}T00:00:00.000Z`;
  }
  let toIso = customTo || now.toISOString();
  if (/^\d{4}-\d{2}-\d{2}$/.test(customTo)) {
    toIso = iso(Date.parse(`${customTo}T00:00:00Z`) + day);
  }
  return { from: fromIso, to: toIso };
}

/**
 * Last calendar day (YYYY-MM-DD) covered by an exclusive ISO range end.
 * Used to prefill the custom date picker from the current range so the
 * switch resolves back to the identical range (no refetch, no new figures).
 */
export function inclusiveEndDate(rangeTo: string): string {
  const ms = new Date(rangeTo).getTime();
  if (!Number.isFinite(ms)) return rangeTo.slice(0, 10);
  return new Date(ms - 1).toISOString().slice(0, 10);
}
