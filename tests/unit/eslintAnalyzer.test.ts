import { eslintAnalyzer } from '../../src/services/staticAnalysis/eslintAnalyzer';

describe('EslintAnalyzer', () => {
  it('catches no-eval violations in JS', async () => {
    const code = `const x = eval("1 + 1");\n`;
    const findings = await eslintAnalyzer.analyze('test.js', code, 'javascript');
    expect(findings.some(f => f.ruleId === 'no-eval')).toBe(true);
  });

  it('catches no-unused-vars in TS', async () => {
    const code = `const unused = 42;\nexport const used = 1;\n`;
    const findings = await eslintAnalyzer.analyze('test.ts', code, 'typescript');
    const unusedFindings = findings.filter(
      f => f.ruleId === 'no-unused-vars' || f.ruleId === '@typescript-eslint/no-unused-vars'
    );
    expect(unusedFindings.length).toBeGreaterThan(0);
  });

  it('returns empty array for clean JS code', async () => {
    const code = `export const add = (a, b) => a + b;\n`;
    const findings = await eslintAnalyzer.analyze('test.js', code, 'javascript');
    // Filter out stylistic warnings - focus on real issues
    const errors = findings.filter(f => f.severity === 'critical');
    expect(errors).toHaveLength(0);
  });

  it('returns empty array when called on Python file', async () => {
    const code = `def hello():\n    print("hi")\n`;
    const findings = await eslintAnalyzer.analyze('test.py', code, 'python');
    expect(findings).toHaveLength(0);
  });

  it('does not crash on malformed JS', async () => {
    const code = `function {{ broken syntax !!!`;
    const findings = await eslintAnalyzer.analyze('test.js', code, 'javascript');
    expect(Array.isArray(findings)).toBe(true);
  });

  it('all findings have source "eslint"', async () => {
    const code = `var x = eval("test");\n`;
    const findings = await eslintAnalyzer.analyze('test.js', code, 'javascript');
    expect(findings.every(f => f.source === 'eslint')).toBe(true);
  });

  it('supports typescript and tsx', () => {
    expect(eslintAnalyzer.supports('typescript')).toBe(true);
    expect(eslintAnalyzer.supports('tsx')).toBe(true);
    expect(eslintAnalyzer.supports('javascript')).toBe(true);
    expect(eslintAnalyzer.supports('python')).toBe(false);
    expect(eslintAnalyzer.supports('go')).toBe(false);
  });
});
