/**
 * Timezone-aware scheduling math for briefing schedules.
 *
 * A schedule stores a wall-clock time ("07:00") and an IANA zone
 * ("Asia/Karachi"). The Cron is an hourly heartbeat, so this module decides
 * *when* a schedule is due. Everything here is pure and DST-aware: the same
 * wall-clock time maps to different instants across a DST boundary, and a
 * skipped local hour (spring forward) must still produce a valid instant.
 */

export interface LocalTimeParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number; // 0-59
  second: number; // 0-59
}

const WEEKDAY_MONDAY = 1;

/** Wall-clock parts of `date` as observed in `timeZone`. */
export function partsInZone(date: Date, timeZone: string): LocalTimeParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== "literal") out[p.type] = p.value;
  }
  // Intl renders midnight as "24" in some engines/ICU versions.
  const hour = Number(out.hour) % 24;
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour,
    minute: Number(out.minute),
    second: Number(out.second),
  };
}

/** True when `timeZone` is a zone the runtime can resolve. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * The instant at which the given wall clock occurs in `timeZone`.
 *
 * Computed by fixed-point iteration: guess in UTC, read the guess back in the
 * target zone, then shift by the difference between wanted and observed wall
 * time. Two passes settle every real zone; a third guards the DST edges where
 * the first pass lands on the far side of a transition.
 */
export function zonedWallClockToUtc(
  parts: LocalTimeParts,
  timeZone: string,
): Date {
  const want = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  let guess = want;
  for (let i = 0; i < 3; i++) {
    const seen = partsInZone(new Date(guess), timeZone);
    const seenAsUtc = Date.UTC(
      seen.year,
      seen.month - 1,
      seen.day,
      seen.hour,
      seen.minute,
      seen.second,
    );
    const delta = want - seenAsUtc;
    if (delta === 0) break;
    guess += delta;
  }
  return new Date(guess);
}

/** Day key (`YYYY-MM-DD`) for `date` as observed in `timeZone`. */
export function localDayKey(date: Date, timeZone: string): string {
  const p = partsInZone(date, timeZone);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/** Weekday (0=Sun) of `date` as observed in `timeZone`. */
export function localWeekday(date: Date, timeZone: string): number {
  const p = partsInZone(date, timeZone);
  // Date.UTC of the observed wall-clock day, read back in UTC, is the weekday.
  return new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
}

/** Parse "HH:MM" (24h). Throws on anything else so bad input never schedules. */
export function parseLocalTime(localTime: string): { hour: number; minute: number } {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(localTime.trim());
  if (!m) throw new Error(`Invalid local time "${localTime}" (expected HH:MM 24h)`);
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

/**
 * The Cron heartbeat runs at the top of every hour, so a schedule can only
 * ever fire on a whole hour. A local time with minutes other than `00` would
 * be computed correctly and then never picked up, so it is rejected at the
 * API boundary rather than silently stored.
 */
export const HOURLY_LOCAL_TIME_RE = /^([01]\d|2[0-3]):00$/;

export function isHourlyLocalTime(localTime: string): boolean {
  return HOURLY_LOCAL_TIME_RE.test(localTime.trim());
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Schedule cadences we recognize; unknown values fall back to daily. */
export type Cadence = 'morning_briefing' | 'weekly_review' | 'monthly_review' | (string & {});

/**
 * Owner-selectable cadence detail. Weekly picks the weekday (0=Sun..6=Sat);
 * monthly picks the day of month (1-31). Both are optional: when absent the
 * legacy defaults hold (weekly → Monday, monthly → the creation day-of-month),
 * so schedules created before these pickers existed keep firing unchanged.
 */
export interface ScheduleRule {
  dayOfWeek?: number;
  dayOfMonth?: number;
}

/** Parse a schedule's stored `ruleJson`, tolerating absent/!JSON/!object values. */
export function parseScheduleRule(ruleJson: string | null | undefined): ScheduleRule {
  if (!ruleJson) return {};
  try {
    const parsed = JSON.parse(ruleJson) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const obj = parsed as Record<string, unknown>;
    const rule: ScheduleRule = {};
    const dow = Number(obj.dayOfWeek);
    if (Number.isInteger(dow) && dow >= 0 && dow <= 6) rule.dayOfWeek = dow;
    const dom = Number(obj.dayOfMonth);
    if (Number.isInteger(dom) && dom >= 1 && dom <= 31) rule.dayOfMonth = dom;
    return rule;
  } catch {
    return {};
  }
}

/** Whole days in one period of this cadence. */
export function cadenceWindowDays(type: Cadence): number {
  if (type === 'weekly_review' || type === 'weekly') return 7;
  if (type === 'monthly_review' || type === 'monthly') return 30;
  return 1;
}

/**
 * Next moment the schedule is due, strictly after `from`.
 *
 * - daily  → the next occurrence of the local time
 * - weekly → the next `rule.dayOfWeek` (default Monday) at the local time
 * - monthly → `rule.dayOfMonth` (default the local creation day) at the local
 *            time, one month later (clamped to the last valid day, e.g. 31 → 30)
 *
 * The result is a real instant, so DST is handled by `zonedWallClockToUtc`.
 */
export function nextRunFor(
  type: Cadence,
  timezone: string,
  localTime: string,
  from: Date,
  rule: ScheduleRule = {},
): Date {
  const { hour, minute } = parseLocalTime(localTime);
  const weekly = type === "weekly_review" || type === "weekly";
  const monthly = type === "monthly_review" || type === "monthly";

  const start = partsInZone(from, timezone);

  if (monthly) {
    // Same day-of-month, clamped. Defaults to the local creation day so a
    // schedule made on the 31st keeps firing on the 31st when it exists. The
    // current month is considered first (a chosen day that is still ahead this
    // month fires this month); the strict `> from` check skips a target that
    // already passed.
    const anchorDay = rule.dayOfMonth ?? start.day;
    for (let monthsOut = 0; monthsOut <= 3; monthsOut++) {
      const probe = new Date(Date.UTC(start.year, start.month - 1 + monthsOut, 1));
      const daysInTargetMonth = new Date(
        Date.UTC(probe.getUTCFullYear(), probe.getUTCMonth() + 1, 0),
      ).getUTCDate();
      const target = zonedWallClockToUtc(
        {
          year: probe.getUTCFullYear(),
          month: probe.getUTCMonth() + 1,
          day: Math.min(anchorDay, daysInTargetMonth),
          hour,
          minute,
          second: 0,
        },
        timezone,
      );
      if (target.getTime() > from.getTime()) return target;
    }
    // Unreachable in practice (a month always exists within 3 tries), but never
    // return a non-advancing instant — the scheduler relies on progress.
    return new Date(from.getTime() + 86_400_000);
  }

  // Daily and weekly both start from the next occurrence of the local time.
  let dayOffset = 0;
  for (let attempt = 0; attempt < 400; attempt++) {
    const probeBase = new Date(
      Date.UTC(start.year, start.month - 1, start.day + dayOffset, hour, minute, 0),
    );
    const localProbe = partsInZone(probeBase, timezone);
    const candidate = zonedWallClockToUtc(
      {
        year: localProbe.year,
        month: localProbe.month,
        day: localProbe.day,
        hour,
        minute,
        second: 0,
      },
      timezone,
    );
    if (weekly) {
      const targetWd = rule.dayOfWeek ?? WEEKDAY_MONDAY;
      const wd = localWeekday(candidate, timezone);
      if (wd === targetWd && candidate.getTime() > from.getTime()) return candidate;
      dayOffset += 1;
      continue;
    }
    if (candidate.getTime() > from.getTime()) return candidate;
    dayOffset += 1;
  }
  return new Date(from.getTime() + 86_400_000);
}