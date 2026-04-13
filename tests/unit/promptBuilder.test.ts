import { buildPrompt, buildSystemPrompt, buildUserMessage } from '../../src/services/promptBuilder';
import { Batch } from '../../src/services/batchingService';

describe('PromptBuilder', () => {
  const mockBatch: Batch = {
    files: [
      {
        filename: 'test.ts',
        content: 'const x = 1;',
        language: 'typescript',
        metadata: {
          functions: [{ name: 'hello', params: ['name'], lineStart: 1, lineEnd: 3, complexity: 2 }],
          imports: [{ source: './utils', isRelative: true }],
          classes: [],
          exports: ['hello'],
          complexity: 2,
        },
      },
    ],
    estimatedTokens: 100,
  };

  it('includes AST metadata when available', () => {
    const { userMessage } = buildPrompt(mockBatch, 'full');
    expect(userMessage).toContain('Exports: hello');
    expect(userMessage).toContain('Imports: ./utils');
    expect(userMessage).toContain('Functions: hello(name) [complexity: 2]');
  });

  it('omits metadata section when AST parsing failed', () => {
    const batch: Batch = {
      files: [{
        filename: 'test.py',
        content: 'def hello(): pass',
        language: 'python',
        metadata: null,
      }],
      estimatedTokens: 50,
    };
    const { userMessage } = buildPrompt(batch, 'full');
    expect(userMessage).not.toContain('Functions:');
    expect(userMessage).not.toContain('Imports:');
    expect(userMessage).toContain('def hello(): pass');
  });

  it('uses correct profile description for security', () => {
    const { systemPrompt } = buildPrompt(mockBatch, 'security');
    expect(systemPrompt).toContain('security vulnerabilities');
    expect(systemPrompt).toContain('SQL injection');
  });

  it('uses correct profile description for performance', () => {
    const { systemPrompt } = buildPrompt(mockBatch, 'performance');
    expect(systemPrompt).toContain('performance issues');
    expect(systemPrompt).toContain('N+1 queries');
  });

  it('uses correct profile description for quality', () => {
    const { systemPrompt } = buildPrompt(mockBatch, 'quality');
    expect(systemPrompt).toContain('code quality');
    expect(systemPrompt).toContain('SOLID');
  });

  it('uses correct profile description for full', () => {
    const { systemPrompt } = buildPrompt(mockBatch, 'full');
    expect(systemPrompt).toContain('all categories');
  });

  it('includes few-shot examples', () => {
    const { systemPrompt } = buildPrompt(mockBatch, 'full');
    expect(systemPrompt).toContain('Example of a GOOD finding');
    expect(systemPrompt).toContain('DO NOT generate findings like this');
  });

  it('output is valid prompt structure (snapshot)', () => {
    const { systemPrompt, userMessage } = buildPrompt(mockBatch, 'full');
    expect(systemPrompt).toMatch(/^You are a senior code reviewer/);
    expect(userMessage).toContain('--- FILE: test.ts ---');
    expect(userMessage).toContain('--- END FILE ---');
  });

  it('includes language in system prompt', () => {
    const prompt = buildSystemPrompt('full', ['typescript', 'python']);
    expect(prompt).toContain('typescript, python');
  });

  it('deduplicates languages in system prompt', () => {
    const prompt = buildSystemPrompt('full', ['typescript', 'typescript']);
    // Should only contain typescript once
    const matches = prompt.match(/typescript/g);
    // Could appear in description text too, just check it's not "typescript, typescript"
    expect(prompt).not.toContain('typescript, typescript');
  });
});
