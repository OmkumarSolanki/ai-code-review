import { z } from 'zod/v4';
import { Batch } from '../batchingService';
import { Finding } from '../staticAnalysis/types';
import { ReviewProfile } from '../promptBuilder';

export interface LLMProvider {
  name: string;
  analyzeCode(
    batches: Batch[],
    profile: ReviewProfile,
    onBatchComplete: (batchIndex: number, findings: Finding[]) => void
  ): Promise<Finding[]>;
}

export const LLMFindingSchema = z.object({
  filename: z.string(),
  lineStart: z.number().int().positive(),
  lineEnd: z.number().int().positive(),
  severity: z.enum(['critical', 'warning', 'info']),
  category: z.enum(['security', 'performance', 'logic', 'style', 'best-practice']),
  message: z.string(),
  suggestedFix: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1),
});

export const LLMResponseSchema = z.array(LLMFindingSchema);

export type LLMFinding = z.infer<typeof LLMFindingSchema>;

export function parseLLMResponse(rawResponse: string): LLMFinding[] {
  // Strip markdown backticks that LLMs sometimes add
  const cleaned = rawResponse.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

  const parsed = JSON.parse(cleaned);
  const result = LLMResponseSchema.safeParse(parsed);

  if (!result.success) {
    throw new Error(`LLM response validation failed: ${result.error.message}`);
  }

  return result.data;
}
