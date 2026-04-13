import { createHash } from 'crypto';

export interface CachedFinding {
  source: string;
  category: string;
  severity: string;
  message: string;
  lineStart: number;
  lineEnd: number;
  ruleId?: string;
  codeSnippet?: string;
  suggestedFix?: string;
  fixStatus?: string;
  confidence?: number;
}

export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

class CacheService {
  private cache: Map<string, CachedFinding[]> = new Map();

  get(contentHash: string): CachedFinding[] | null {
    return this.cache.get(contentHash) ?? null;
  }

  set(contentHash: string, findings: CachedFinding[]): void {
    this.cache.set(contentHash, findings);
  }

  has(contentHash: string): boolean {
    return this.cache.has(contentHash);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

export const cacheService = new CacheService();
export { CacheService };
