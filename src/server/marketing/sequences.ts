/**
 * Marketing email sequences: pure step tables + due-date math.
 *
 * Day offsets are UTC-day based, matching the billing trial-reminder
 * convention. `anchorMs` is the capture time (welcome) or the manual anchor
 * date (buyer reminders, e.g. review / presentation day).
 */

export interface SequenceStep {
  step: string;
  offsetDays: number;
}

export const WELCOME_SEQUENCE: SequenceStep[] = [
  { step: "day0", offsetDays: 0 },
  { step: "day2", offsetDays: 2 },
  { step: "day5", offsetDays: 5 },
  { step: "day8", offsetDays: 8 },
  { step: "day12", offsetDays: 12 },
];

export const DIAG_CREDIT_SEQUENCE: SequenceStep[] = [
  { step: "diag-d7", offsetDays: 7 },
  { step: "diag-d12", offsetDays: 12 },
];

export const BP_CREDIT_SEQUENCE: SequenceStep[] = [
  { step: "bp-d14", offsetDays: 14 },
  { step: "bp-d25", offsetDays: 25 },
];

export const WELCOME_SEQUENCE_KEY = "loop-welcome";
export const DIAG_CREDIT_SEQUENCE_KEY = "diagnostic-credit";
export const BP_CREDIT_SEQUENCE_KEY = "blueprint-credit";

export const MAX_SEND_ATTEMPTS = 3;

export function dueAtFor(anchorMs: number, offsetDays: number): number {
  return anchorMs + offsetDays * 86400 * 1000;
}

export function stepsFor(sequence: SequenceStep[], anchorMs: number): Array<{ step: string; dueAt: number }> {
  return sequence.map((s) => ({ step: s.step, dueAt: dueAtFor(anchorMs, s.offsetDays) }));
}
