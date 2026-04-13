import { validateFix } from '../../src/services/fixValidator';
import { Finding } from '../../src/services/staticAnalysis/types';

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    source: 'llm',
    category: 'security',
    severity: 'critical',
    message: 'test',
    lineStart: 3,
    lineEnd: 3,
    filename: 'test.ts',
    suggestedFix: 'const safe = sanitize(input);',
    ...overrides,
  };
}

describe('FixValidator', () => {
  it('valid JS fix → "verified"', async () => {
    const original = `const x = 1;\nconst y = 2;\nconst z = eval(input);\nconst w = 4;\n`;
    const finding = makeFinding({
      lineStart: 3,
      lineEnd: 3,
      suggestedFix: 'const z = JSON.parse(input);',
    });

    const status = await validateFix(finding, original, 'typescript');
    expect(status).toBe('verified');
  });

  it('fix that introduces hardcoded secret → "unavailable"', async () => {
    const original = `const x = 1;\nconst y = 2;\nconst z = 3;\n`;
    const finding = makeFinding({
      lineStart: 3,
      lineEnd: 3,
      suggestedFix: 'const password = "super_secret_value123";',
    });

    const status = await validateFix(finding, original, 'typescript');
    expect(status).toBe('unavailable');
  });

  it('no suggestedFix → "unavailable"', async () => {
    const finding = makeFinding({ suggestedFix: undefined });
    const status = await validateFix(finding, 'const x = 1;', 'typescript');
    expect(status).toBe('unavailable');
  });

  it('valid Python fix → "verified"', async () => {
    const original = `x = 1\ny = 2\nz = eval(input())\nw = 4\n`;
    const finding = makeFinding({
      filename: 'test.py',
      lineStart: 3,
      lineEnd: 3,
      suggestedFix: 'z = int(input())',
    });

    const status = await validateFix(finding, original, 'python');
    expect(status).toBe('verified');
  });

  it('fix for language without grammar → "unverified" or "verified"', async () => {
    const original = `some code here\nmore code\nbug line\n`;
    const finding = makeFinding({
      filename: 'test.xyz',
      lineStart: 3,
      lineEnd: 3,
      suggestedFix: 'fixed line',
    });

    const status = await validateFix(finding, original, 'unknown');
    // Without tree-sitter and ESLint, pattern scanner runs alone
    // If it passes, it's verified; if no grammar, might be unverified
    expect(['verified', 'unverified']).toContain(status);
  });
});
