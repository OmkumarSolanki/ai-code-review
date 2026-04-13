import { LLMResponseSchema, parseLLMResponse } from '../../src/services/llm/types';

describe('LLM Response Contract', () => {
  it('valid response passes validation', () => {
    const response = [
      {
        filename: 'test.ts',
        lineStart: 5,
        lineEnd: 5,
        severity: 'critical',
        category: 'security',
        message: 'SQL injection detected',
        suggestedFix: 'Use parameterized queries',
        confidence: 0.95,
      },
    ];
    const result = LLMResponseSchema.safeParse(response);
    expect(result.success).toBe(true);
  });

  it('missing lineStart fails validation', () => {
    const response = [
      {
        filename: 'test.ts',
        lineEnd: 5,
        severity: 'critical',
        category: 'security',
        message: 'Bug found',
        confidence: 0.9,
      },
    ];
    const result = LLMResponseSchema.safeParse(response);
    expect(result.success).toBe(false);
  });

  it('invalid severity value fails validation', () => {
    const response = [
      {
        filename: 'test.ts',
        lineStart: 5,
        lineEnd: 5,
        severity: 'high', // Invalid
        category: 'security',
        message: 'Bug',
        confidence: 0.9,
      },
    ];
    const result = LLMResponseSchema.safeParse(response);
    expect(result.success).toBe(false);
  });

  it('empty array passes validation', () => {
    const result = LLMResponseSchema.safeParse([]);
    expect(result.success).toBe(true);
  });

  it('non-JSON response is caught', () => {
    expect(() => parseLLMResponse('This is not JSON')).toThrow();
  });

  it('strips markdown backticks before parsing', () => {
    const raw = '```json\n[]\n```';
    const result = parseLLMResponse(raw);
    expect(result).toEqual([]);
  });

  it('valid finding with null suggestedFix passes', () => {
    const response = [
      {
        filename: 'test.ts',
        lineStart: 1,
        lineEnd: 1,
        severity: 'info',
        category: 'style',
        message: 'Bad naming',
        suggestedFix: null,
        confidence: 0.5,
      },
    ];
    const result = LLMResponseSchema.safeParse(response);
    expect(result.success).toBe(true);
  });
});
