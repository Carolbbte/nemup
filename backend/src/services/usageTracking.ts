import type OpenAI from 'openai';

export interface UsageRecord {
  label: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

const records: UsageRecord[] = [];

/**
 * Records and logs token usage from an OpenAI response for a labeled call
 * site. Shared by both the v1 pipeline (generationService.ts,
 * knowledgeExtractor.ts) and the v2 pipeline (comprehension.ts,
 * distractors.ts) so scripts/estimateCost.ts can compare their real token
 * cost when run back to back on the same document.
 */
export function recordUsage(label: string, usage: OpenAI.CompletionUsage | null | undefined): void {
  const promptTokens = usage?.prompt_tokens ?? 0;
  const completionTokens = usage?.completion_tokens ?? 0;
  const totalTokens = usage?.total_tokens ?? promptTokens + completionTokens;
  records.push({ label, promptTokens, completionTokens, totalTokens });
  console.log(`[Usage] ${label} — prompt_tokens=${promptTokens}, completion_tokens=${completionTokens}, total_tokens=${totalTokens}`);
}

/** Returns every usage record captured since the last resetUsageRecords() call. */
export function getUsageRecords(): UsageRecord[] {
  return [...records];
}

/** Clears captured records — call between runs to isolate one pipeline's totals from another's. */
export function resetUsageRecords(): void {
  records.length = 0;
}
