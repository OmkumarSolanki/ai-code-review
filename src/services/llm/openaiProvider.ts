import { LLMProvider, parseLLMResponse } from './types';
import { Batch } from '../batchingService';
import { Finding } from '../staticAnalysis/types';
import { ReviewProfile, buildPrompt } from '../promptBuilder';
import { llmSemaphore } from '../../utils/semaphore';

const MAX_RETRIES = parseInt(process.env.LLM_MAX_RETRIES || '3', 10);

export class OpenAIProvider implements LLMProvider {
  name = 'openai';
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model?: string) {
    this.apiKey = apiKey;
    this.model = model || 'gpt-4o';
  }

  async analyzeCode(
    batches: Batch[],
    profile: ReviewProfile,
    onBatchComplete: (batchIndex: number, findings: Finding[]) => void
  ): Promise<Finding[]> {
    const allFindings: Finding[] = [];

    const promises = batches.map((batch, index) =>
      llmSemaphore(async () => {
        const findings = await this.analyzeBatch(batch, profile, index);
        allFindings.push(...findings);
        onBatchComplete(index, findings);
        return findings;
      })
    );

    const results = await Promise.allSettled(promises);

    for (const result of results) {
      if (result.status === 'rejected') {
        console.error('Batch failed:', result.reason);
      }
    }

    return allFindings;
  }

  private async analyzeBatch(
    batch: Batch,
    profile: ReviewProfile,
    _batchIndex: number
  ): Promise<Finding[]> {
    const { systemPrompt, userMessage } = buildPrompt(batch, profile);

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const OpenAI = (await import('openai')).default;
        const client = new OpenAI({ apiKey: this.apiKey });

        const response = await client.chat.completions.create({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          temperature: 0.1,
        });

        const content = response.choices[0]?.message?.content ?? '[]';
        const parsed = parseLLMResponse(content);

        return parsed.map(f => ({
          source: 'llm' as const,
          category: f.category,
          severity: f.severity,
          message: f.message,
          lineStart: f.lineStart,
          lineEnd: f.lineEnd,
          suggestedFix: f.suggestedFix ?? undefined,
          confidence: f.confidence,
          filename: f.filename,
        }));
      } catch (err) {
        if (attempt === MAX_RETRIES - 1) {
          console.error('OpenAI batch permanently failed:', err);
          return [];
        }
        // Exponential backoff: 1s, 2s, 4s
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
    }

    return [];
  }
}
