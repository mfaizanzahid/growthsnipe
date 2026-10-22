import { cadenceSpec } from './cadence';
import type { BriefingFacts, DataQuality, Deltas } from './types';

/**
 * Prompt construction for briefings.
 *
 * The model only ever narrates numbers that `analyze.ts` already computed. The
 * facts are rendered here as an explicit digest with the data-quality limits
 * stated in the same breath, so the model can see (and repeat) the caveats
 * instead of quietly presenting a bounded figure as complete.
 */

const BASE_SYSTEM_PROMPT = [
  'You are a small home-service business COO writing for the owner/leader of the business.',
  'You are given FACTS that were computed from the business software. Treat every number as read-only ground truth.',
  'Rules:',
  '- Never invent a number, a name, a trend, or a cause. Only state what the facts contain.',
  '- Every claim must cite the number behind it.',
  '- Copy numbers exactly as written. Do not recalculate, convert, or derive percentages yourself.',
  '- When a line reads "no baseline", "unavailable", or "n/a", the value does not exist. Never infer a change, a percentage, or a direction from it — write that the comparison is unavailable. A prior value of zero does NOT mean a 100% decline.',
  '- If the facts say a figure is bounded, partial, or unavailable, say so in the same sentence you use the figure.',
  '- No jargon, no filler, no praise. Plain, direct, owner-level language.',
  '- Prefer a short, specific "do this next" over general advice.',
].join('\n');

function money(minor: number | null, currency: string): string {
  if (minor === null) return 'n/a';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(minor / 100);
}

function pctText(value: number | null): string {
  if (value === null) return 'no baseline (do not infer a change)';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value}%`;
}

function deltaLine(label: string, value: number | null, unit = ''): string {
  return `- ${label}: ${pctText(value)}${unit}`;
}

function metricsSection(facts: BriefingFacts): string {
  const m = facts.metrics;
  const cur = facts.currency;
  const lines = [
    `- orders: ${m.orders}`,
    `- completed: ${m.completed}`,
    `- cancelled: ${m.cancelled}`,
    `- open/not finished: ${m.open}`,
    `- cancel rate: ${m.cancelRatePct === null ? 'unavailable' : `${m.cancelRatePct}%`}`,
    `- completed revenue: ${money(m.revenueMinor, cur)}`,
    `- average ticket: ${money(m.avgTicketMinor, cur)}`,
    `- revenue per day: ${money(m.revenuePerDayMinor, cur)}`,
    `- paid orders: ${m.paidOrders}`,
    `- unpaid orders (completed but flagged unpaid): ${m.unpaidOrders}`,
    `- unpaid amount: ${money(m.unpaidAmountMinor, cur)}`,
    `- open orders past their scheduled time: ${m.overdueOpenOrders}`,
  ];

  if (m.referralMix.length > 0) {
    lines.push('- top referral sources:');
    for (const r of m.referralMix) {
      lines.push(`  - ${r.label}: ${r.orders} order(s), ${money(r.revenueMinor, cur)}`);
    }
  }
  if (m.serviceMix.length > 0) {
    lines.push('- top service types:');
    for (const s of m.serviceMix) {
      lines.push(`  - ${s.label}: ${s.orders} order(s), ${money(s.revenueMinor, cur)}`);
    }
  }
  if (m.inspectors.length > 0) {
    lines.push('- inspector workload:');
    for (const i of m.inspectors) {
      lines.push(`  - ${i.name}: ${i.orders} completed, ${money(i.revenueMinor, cur)}`);
    }
  }
  if (m.dailySeries.length > 0) {
    lines.push('- by day (date: orders/completed/revenue):');
    for (const d of m.dailySeries) {
      lines.push(`  - ${d.day}: ${d.orders}/${d.completed}/${money(d.revenueMinor, cur)}`);
    }
  }
  return lines.join('\n');
}

function deltasSection(facts: BriefingFacts): string {
  if (!facts.previous) return 'No previous period was retrieved, so there are no comparisons.';
  const d: Deltas = facts.deltas;
  return [
    `Compared with ${facts.previous.label}:`,
    deltaLine('orders', d.ordersPct),
    deltaLine('revenue', d.revenuePct),
    deltaLine('average ticket', d.avgTicketPct),
    `- cancel rate change: ${d.cancelRatePoints === null ? 'unavailable' : `${d.cancelRatePoints > 0 ? '+' : ''}${d.cancelRatePoints} points`}`,
  ].join('\n');
}

function qualitySection(dq: DataQuality): string {
  const lines: string[] = [];
  if (dq.omissions.length === 0) lines.push('- no known data limits for this period');
  else for (const o of dq.omissions) lines.push(`- ${o}`);
  if (dq.providerLimits.length > 0) {
    lines.push('- provider limits that shaped collection:');
    for (const l of dq.providerLimits) lines.push(`  - ${l}`);
  }
  return lines.join('\n');
}

/** Full prompt text for a cadence. Facts are the only source of numbers. */
export function buildBriefingPrompt(facts: BriefingFacts): { system: string; user: string } {
  const spec = cadenceSpec(facts.cadence);
  const user = [
    `REPORT: ${spec.label} (${facts.provider})`,
    `WINDOW: ${facts.current.label} — ${facts.current.from} to ${facts.current.to} (${facts.timezone})`,
    '',
    'FACTS:',
    metricsSection(facts),
    '',
    deltasSection(facts),
    '',
    'DATA QUALITY (you must respect these limits in your wording):',
    qualitySection(facts.dataQuality),
    '',
    'WHAT THIS REPORT MUST ANSWER:',
    spec.lens,
    ...spec.focus.map((f) => `- ${f}`),
    '',
    'Write the report in Markdown using these sections:',
    '## What changed',
    '## What needs attention',
    '## Owner priorities (max 3, each with the number behind it)',
    '## Data limits',
    '',
    'Keep it under 400 words. If a section has nothing supported by the facts, write "Nothing notable in the facts provided" — never fill it with speculation.',
    'If a period genuinely had no activity, say so plainly ("no orders in this window") instead of framing it as a decline.',
  ].join('\n');
  return { system: BASE_SYSTEM_PROMPT, user };
}

/**
 * Fallback when AI synthesis is not configured. Uses the cadence label rather
 * than the hardcoded "MORNING BRIEFING" this used to emit for every type.
 */
export function unconfiguredBriefing(facts: BriefingFacts): string {
  const spec = cadenceSpec(facts.cadence);
  return [
    `${spec.label.toUpperCase()} — AI SYNTHESIS NOT CONFIGURED`,
    '',
    `Window: ${facts.current.label} (${facts.current.from} to ${facts.current.to})`,
    '',
    metricsSection(facts),
    '',
    deltasSection(facts),
    '',
    'DATA QUALITY:',
    qualitySection(facts.dataQuality),
  ].join('\n');
}