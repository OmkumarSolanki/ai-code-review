import { LLMProvider, parseLLMResponse } from './types';
import { Batch } from '../batchingService';
import { Finding } from '../staticAnalysis/types';
import { ReviewProfile, buildPrompt } from '../promptBuilder';
import { llmSemaphore } from '../../utils/semaphore';

const MAX_RETRIES = parseInt(process.env.LLM_MAX_RETRIES || '3', 10);

export class GeminiProvider implements LLMProvider {
  name = 'gemini';
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model?: string) {
    this.apiKey = apiKey;
    this.model = model || 'gemini-2.5-flash';
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
        // Use Gemini REST API
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: `${systemPrompt}\n\n${userMessage}` }] }],
              generationConfig: { temperature: 0.1 },
            }),
          }
        );

        const data = await response.json() as Record<string, unknown>;

        if (!response.ok) {
          console.error(`[Gemini] API error ${response.status}:`, JSON.stringify(data).slice(0, 300));
          throw new Error(`Gemini API returned ${response.status}`);
        }

        const candidates = data?.candidates as Array<Record<string, unknown>> | undefined;
        const parts = (candidates?.[0]?.content as Record<string, unknown>)?.parts as Array<Record<string, string>> | undefined;
        const content = parts?.[0]?.text ?? '[]';
        console.log(`[Gemini] Got response, length: ${content.length}`);
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
          console.error('Gemini batch permanently failed:', err);
          return [];
        }
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
    }

    return [];
  }
}
