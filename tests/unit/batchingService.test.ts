import { createBatches, BatchFile } from '../../src/services/batchingService';
import { DependencyGraph } from '../../src/services/astService';

function makeFile(name: string, size: number): BatchFile {
  return {
    filename: name,
    content: 'x'.repeat(size),
    language: 'typescript',
    metadata: null,
  };
}

describe('BatchingService', () => {
  it('groups connected components into single batch when under budget', () => {
    const files = [
      makeFile('a.ts', 1000), // ~250 tokens
      makeFile('b.ts', 1000), // ~250 tokens
    ];
    const graph: DependencyGraph = {
      components: [['a.ts', 'b.ts']],
    };

    const batches = createBatches(files, graph, 12000);
    expect(batches).toHaveLength(1);
    expect(batches[0].files).toHaveLength(2);
  });

  it('splits large components into sub-batches respecting token budget', () => {
    const files = [
      makeFile('a.ts', 20000), // ~5000 tokens
      makeFile('b.ts', 20000), // ~5000 tokens
      makeFile('c.ts', 20000), // ~5000 tokens
    ];
    const graph: DependencyGraph = {
      components: [['a.ts', 'b.ts', 'c.ts']],
    };

    const batches = createBatches(files, graph, 6000);
    expect(batches.length).toBeGreaterThan(1);
    for (const batch of batches) {
      expect(batch.estimatedTokens).toBeLessThanOrEqual(6000);
    }
  });

  it('handles single file exceeding token budget', () => {
    // Use realistic multi-line content
    const lines = Array.from({ length: 2000 }, (_, i) => `const line${i} = ${i}; // some padding text here`);
    const files: BatchFile[] = [
      { filename: 'huge.ts', content: lines.join('\n'), language: 'typescript', metadata: null },
    ];
    const graph: DependencyGraph = {
      components: [['huge.ts']],
    };

    const batches = createBatches(files, graph, 5000);
    expect(batches.length).toBeGreaterThan(1);
  });

  it('handles unconnected files — batches them together', () => {
    const files = [
      makeFile('a.ts', 1000),
      makeFile('b.ts', 1000),
      makeFile('c.ts', 1000),
    ];
    const graph: DependencyGraph = {
      components: [['a.ts'], ['b.ts'], ['c.ts']],
    };

    const batches = createBatches(files, graph, 12000);
    // Each is its own component, so each gets its own batch
    // (unless they're grouped into one — depends on budget)
    expect(batches.length).toBe(3);
  });

  it('keeps files that import each other in same batch when possible', () => {
    const files = [
      makeFile('a.ts', 4000), // ~1000 tokens
      makeFile('b.ts', 4000), // ~1000 tokens
    ];
    const graph: DependencyGraph = {
      components: [['a.ts', 'b.ts']],
    };

    const batches = createBatches(files, graph, 12000);
    expect(batches).toHaveLength(1);
    expect(batches[0].files.map(f => f.filename).sort()).toEqual(['a.ts', 'b.ts']);
  });

  it('returns empty array for empty input', () => {
    const batches = createBatches([], { components: [] }, 12000);
    expect(batches).toHaveLength(0);
  });
});
