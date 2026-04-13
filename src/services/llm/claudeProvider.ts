import { LLMProvider, parseLLMResponse } from './types';
import { Batch } from '../batchingService';
import { Finding } from '../staticAnalysis/types';
import { ReviewProfile, buildPrompt } from '../promptBuilder';
import { llmSemaphore } from '../../utils/semaphore';

const MAX_RETRIES = parseInt(process.env.LLM_MAX_RETRIES || '3', 10);

export class ClaudeProvider implements LLMProvider {
  name = 'claude';
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model?: string) {
    this.apiKey = apiKey;
    this.model = model || 'claude-sonnet-4-6-20250620';
  }

  async analyzeCode(
    batches: Batch[],
    profile: ReviewProfile,
    onBatchComplete: (batchIndex: number, findings: Finding[]) => void
  ): Promise<Finding[]> {
    const allFindings: Finding[] = [];

    const promises = batches.map((batch, index) =>
      llmSemaphore(async () => {
        const findings = await this.analyzeBatch(batch, profile);
        allFindings.push(...findings);
        onBatchComplete(index, findings);
        return findings;
      })
    );

    await Promise.allSettled(promises);
    return allFindings;
  }

  private async analyzeBatch(batch: Batch, profile: ReviewProfile): Promise<Finding[]> {
    const { systemPrompt, userMessage } = buildPrompt(batch, profile);

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const Anthropic = (await import('@anthropic-ai/sdk')).default;
        const client = new Anthropic({ apiKey: this.apiKey });

        const response = await client.messages.create({
          model: this.model,
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        });

        const content = response.content[0]?.type === 'text' ? response.content[0].text : '[]';
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
          console.error('Claude batch permanently failed:', err);
          return [];
        }
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
    }

    return [];
  }
}
