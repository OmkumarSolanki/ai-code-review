import { CacheService, hashContent } from '../../src/services/cacheService';

describe('CacheService', () => {
  let cache: CacheService;

  beforeEach(() => {
    cache = new CacheService();
  });

  it('returns null for uncached content', () => {
    expect(cache.get('nonexistent-hash')).toBeNull();
  });

  it('returns findings for cached content', () => {
    const findings = [
      {
        source: 'eslint',
        category: 'style',
        severity: 'warning',
        message: 'No unused vars',
        lineStart: 1,
        lineEnd: 1,
      },
    ];
    const hash = hashContent('const x = 1;');
    cache.set(hash, findings);
    expect(cache.get(hash)).toEqual(findings);
  });

  it('same content with different filenames shares cache entry', () => {
    const content = 'function hello() {}';
    const hash = hashContent(content);
    const findings = [
      {
        source: 'llm',
        category: 'quality',
        severity: 'info',
        message: 'Empty function',
        lineStart: 1,
        lineEnd: 1,
      },
    ];
    cache.set(hash, findings);

    // Same content, different "filename" — hash is the same
    const sameHash = hashContent(content);
    expect(cache.get(sameHash)).toEqual(findings);
  });

  it('different content produces different hashes', () => {
    const hash1 = hashContent('const a = 1;');
    const hash2 = hashContent('const b = 2;');
    expect(hash1).not.toBe(hash2);
  });

  it('has() returns correct state', () => {
    const hash = hashContent('test');
    expect(cache.has(hash)).toBe(false);
    cache.set(hash, []);
    expect(cache.has(hash)).toBe(true);
  });

  it('clear() removes all entries', () => {
    cache.set(hashContent('a'), []);
    cache.set(hashContent('b'), []);
    expect(cache.size).toBe(2);
    cache.clear();
    expect(cache.size).toBe(0);
  });
});
