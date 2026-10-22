import type { Cadence } from '../lib/local-time';

/**
 * A briefing cadence is not just a label: it decides how much history is
 * analyzed and which question the report answers. Before this, all three types
 * produced the identical 30-day snapshot with the identical prompt, so a "daily
 * morning briefing" and a "weekly review" said the same thing.
 */
export interface CadenceSpec {
  type: Cadence;
  /** Human label used in the email subject/title and the prompt. */
  label: string;
  /** Days of history analyzed in the current window. */
  windowDays: number;
  /**
   * Whether to fetch the preceding period of the same length for real deltas.
   * A daily report without a baseline is just a number, not a decision aid.
   */
  compare: boolean;
  /** The question this cadence exists to answer. */
  lens: string;
  /** Cadence-specific prompt instructions (see prompts.ts). */
  focus: readonly string[];
}

const SPECS: Record<string, CadenceSpec> = {
  morning_briefing: {
    type: 'morning_briefing',
    label: 'Morning briefing',
    windowDays: 1,
    compare: true,
    lens: 'What happened yesterday, what changed, and what needs attention today.',
    focus: [
      'Lead with what changed versus the day before, with the numbers side by side.',
      'Call out anything unpaid, cancelled, or overdue that an owner could act on today.',
      'Keep it short: a morning read should be scannable in under a minute.',
    ],
  },
  weekly_review: {
    type: 'weekly_review',
    label: 'Weekly review',
    windowDays: 7,
    compare: true,
    lens: 'How the week trended versus the week before, and where the mix is shifting.',
    focus: [
      'Compare against the previous week and quantify every change as a percentage.',
      'Identify mix shifts: which referral sources or service types grew or shrank.',
      'Name one concrete lever the owner could pull next week.',
    ],
  },
  monthly_review: {
    type: 'monthly_review',
    label: 'Monthly review',
    windowDays: 30,
    compare: true,
    lens: 'Business performance over the month: growth, revenue quality, and priorities.',
    focus: [
      'Frame the month as a whole, then compare to the previous month.',
      'Discuss revenue quality, not just volume: average ticket, unpaid exposure, cancellations.',
      'End with up to three ranked owner priorities for the coming month.',
    ],
  },
};

const DAILY_FALLBACK = SPECS.morning_briefing!;

/**
 * Spec for a cadence. Unknown or missing types fall back to the daily
 * briefing so a malformed schedule still produces a useful report.
 */
export function cadenceSpec(type: string | null | undefined): CadenceSpec {
  if (!type) return DAILY_FALLBACK;
  return SPECS[type] ?? { ...DAILY_FALLBACK, type };
}

/** True when the cadence compares against a preceding period. */
export function cadenceCompares(type: string | null | undefined): boolean {
  return cadenceSpec(type).compare;
}