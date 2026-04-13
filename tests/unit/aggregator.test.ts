import { aggregateFindings, extractCodeSnippet } from '../../src/services/aggregator';
import { Finding } from '../../src/services/staticAnalysis/types';

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    source: 'pattern',
    category: 'security',
    severity: 'warning',
    message: 'Test finding',
    lineStart: 10,
    lineEnd: 10,
    filename: 'test.ts',
    ...overrides,
  };
}

describe('Aggregator', () => {
  const fileContents = new Map([['test.ts', 'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10\nline11\nline12']]);

  it('deduplicates findings within 3-line tolerance', () => {
    const patternFinding = makeFinding({ source: 'pattern', lineStart: 10, lineEnd: 10 });
    const llmFinding = makeFinding({ source: 'llm', lineStart: 12, lineEnd: 12, message: 'LLM message' });

    const result = aggregateFindings([[patternFinding], [llmFinding]], fileContents);
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('merged');
  });

  it('does NOT deduplicate findings more than 3 lines apart', () => {
    const patternFinding = makeFinding({ source: 'pattern', lineStart: 5, lineEnd: 5 });
    const llmFinding = makeFinding({ source: 'llm', lineStart: 10, lineEnd: 10 });

    const result = aggregateFindings([[patternFinding], [llmFinding]], fileContents);
    expect(result).toHaveLength(2);
  });

  it('merged findings have boosted severity', () => {
    const a = makeFinding({ source: 'pattern', severity: 'warning', lineStart: 10 });
    const b = makeFinding({ source: 'llm', severity: 'warning', lineStart: 10 });

    const result = aggregateFindings([[a], [b]], fileContents);
    expect(result[0].severity).toBe('critical');
  });

  it('merged findings keep LLM message and ESLint ruleId', () => {
    const eslintFinding = makeFinding({
      source: 'eslint',
      ruleId: 'no-eval',
      message: 'eslint message',
      lineStart: 10,
    });
    const llmFinding = makeFinding({
      source: 'llm',
      message: 'LLM found eval usage',
      lineStart: 10,
    });

    const result = aggregateFindings([[eslintFinding], [llmFinding]], fileContents);
    expect(result[0].source).toBe('merged');
    expect(result[0].message).toBe('LLM found eval usage'); // LLM message preferred
    expect(result[0].ruleId).toBe('no-eval'); // ESLint ruleId kept
  });

  it('attaches correct code snippets', () => {
    const finding = makeFinding({ lineStart: 5, lineEnd: 5 });
    const result = aggregateFindings([[finding]], fileContents);
    expect(result[0].codeSnippet).toBeDefined();
    expect(result[0].codeSnippet).toContain('line3');
    expect(result[0].codeSnippet).toContain('line5');
  });

  it('handles file boundary for snippets', () => {
    const finding = makeFinding({ lineStart: 1, lineEnd: 1 });
    const result = aggregateFindings([[finding]], fileContents);
    expect(result[0].codeSnippet).toBeDefined();
    expect(result[0].codeSnippet).toContain('line1');
  });

  it('sorts by severity then line number', () => {
    const findings = [
      makeFinding({ severity: 'info', lineStart: 1 }),
      makeFinding({ severity: 'critical', lineStart: 10 }),
      makeFinding({ severity: 'critical', lineStart: 5 }),
      makeFinding({ severity: 'warning', lineStart: 3 }),
    ];

    const result = aggregateFindings([findings], fileContents);
    expect(result[0].severity).toBe('critical');
    expect(result[0].lineStart).toBe(5);
    expect(result[1].severity).toBe('critical');
    expect(result[1].lineStart).toBe(10);
    expect(result[2].severity).toBe('warning');
    expect(result[3].severity).toBe('info');
  });

  it('passes through unmatched findings', () => {
    const patternOnly = makeFinding({ source: 'pattern', lineStart: 5 });
    const llmOnly = makeFinding({ source: 'llm', lineStart: 50, filename: 'other.ts' });

    const contents = new Map([['test.ts', 'x'], ['other.ts', 'y']]);
    const result = aggregateFindings([[patternOnly], [llmOnly]], contents);
    expect(result).toHaveLength(2);
    expect(result.find(f => f.source === 'pattern')).toBeDefined();
    expect(result.find(f => f.source === 'llm')).toBeDefined();
  });
});

describe('extractCodeSnippet', () => {
  const content = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n');

  it('extracts lines around the target', () => {
    const snippet = extractCodeSnippet(content, 10, 10);
    expect(snippet).toContain('line 8');
    expect(snippet).toContain('line 10');
    expect(snippet).toContain('line 12');
  });

  it('clamps to file start', () => {
    const snippet = extractCodeSnippet(content, 1, 1);
    expect(snippet).toContain('line 1');
    expect(snippet).not.toContain('undefined');
  });

  it('clamps to file end', () => {
    const snippet = extractCodeSnippet(content, 20, 20);
    expect(snippet).toContain('line 20');
  });
});
