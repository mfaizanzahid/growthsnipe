import type { Env } from '../lib/env';
import type { BriefingFacts } from '../briefing/types';
import { buildBriefingPrompt, unconfiguredBriefing } from '../briefing/prompts';

/** Model used when AI_PROVIDER=openai and AI_MODEL is unset. Verified 2026-09-10 (OpenAI API docs). */
export const DEFAULT_OPENAI_MODEL = 'gpt-5.6-luna';
const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-5';

/**
 * Turn verified facts into a written briefing. The prompt is cadence-specific
 * and states the data limits alongside the numbers, so the model narrates what
 * we measured instead of filling gaps.
 */
export async function synthesizeBriefing(env: Env, facts: BriefingFacts): Promise<string> {
  const provider = (env.AI_PROVIDER ?? '').toLowerCase();
  if (provider === 'openai') {
    if (!env.OPENAI_API_KEY) return unconfiguredBriefing(facts);
    return synthesizeOpenAI(env, facts);
  }
  if (!env.AI_PROVIDER || !env.ANTHROPIC_API_KEY) return unconfiguredBriefing(facts);
  return synthesizeAnthropic(env, facts);
}

/**
 * A blank completion is a failure, not a briefing.
 *
 * `?? 'No briefing generated.'` only catches null/undefined, so an empty or
 * whitespace-only model response passed straight through and was emailed to the
 * owner with no content while the job still reported "delivered" (seen live
 * 2026-10-17). Fail loudly instead so the job is visibly broken.
 */
function requireBriefing(text: string | undefined | null): string {
  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (!trimmed) throw new Error('AI synthesis returned an empty briefing');
  return trimmed;
}

async function synthesizeAnthropic(env: Env, facts: BriefingFacts): Promise<string> {
  const prompt = buildBriefingPrompt(facts);
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY as string,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: DEFAULT_ANTHROPIC_MODEL,
      max_tokens: 1200,
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
    }),
  });
  if (!r.ok) throw new Error(`AI synthesis failed: ${r.status}`);
  const j: any = await r.json();
  const text = j.content?.map((p: any) => p.text).filter(Boolean).join('\n');
  return requireBriefing(text);
}

async function synthesizeOpenAI(env: Env, facts: BriefingFacts): Promise<string> {
  const prompt = buildBriefingPrompt(facts);
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.AI_MODEL ?? DEFAULT_OPENAI_MODEL,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      max_completion_tokens: 1200,
    }),
  });
  if (!r.ok) throw new Error(`AI synthesis failed: ${r.status}`);
  const j: any = await r.json();
  const text = j.choices?.map((c: any) => c.message?.content).filter(Boolean).join('\n');
  return requireBriefing(text);
}
