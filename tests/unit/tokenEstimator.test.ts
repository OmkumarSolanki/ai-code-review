import { estimateTokens } from '../../src/utils/tokenEstimator';

describe('tokenEstimator', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('returns 0 for null/undefined-like input', () => {
    expect(estimateTokens(null as unknown as string)).toBe(0);
  });

  it('estimates tokens as approximately chars/4', () => {
    const text = 'a'.repeat(100);
    expect(estimateTokens(text)).toBe(25);
  });

  it('rounds up for non-divisible lengths', () => {
    const text = 'a'.repeat(10); // 10/4 = 2.5 → 3
    expect(estimateTokens(text)).toBe(3);
  });

  it('handles realistic code snippet', () => {
    const code = 'function hello() { return "world"; }'; // 36 chars → 9 tokens
    expect(estimateTokens(code)).toBe(9);
  });
});
