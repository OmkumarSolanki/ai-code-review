import { computeFileHealthScore, computeProjectScore } from '../../src/services/healthScorer';
import { Finding } from '../../src/services/staticAnalysis/types';

function makeFinding(severity: Finding['severity']): Finding {
  return {
    source: 'pattern',
    category: 'security',
    severity,
    message: 'test',
    lineStart: 1,
    lineEnd: 1,
  };
}

describe('HealthScorer', () => {
  describe('computeFileHealthScore', () => {
    it('file with 0 findings scores 100', () => {
      expect(computeFileHealthScore([])).toBe(100);
    });

    it('file with 1 critical scores 75', () => {
      expect(computeFileHealthScore([makeFinding('critical')])).toBe(75);
    });

    it('file with 4 criticals scores 0 (clamped)', () => {
      const findings = Array(4).fill(null).map(() => makeFinding('critical'));
      expect(computeFileHealthScore(findings)).toBe(0);
    });

    it('file with 5 criticals still scores 0 (clamped)', () => {
      const findings = Array(5).fill(null).map(() => makeFinding('critical'));
      expect(computeFileHealthScore(findings)).toBe(0);
    });

    it('file with 1 warning scores 90', () => {
      expect(computeFileHealthScore([makeFinding('warning')])).toBe(90);
    });

    it('file with 1 info scores 98', () => {
      expect(computeFileHealthScore([makeFinding('info')])).toBe(98);
    });

    it('mixed findings compute correctly', () => {
      const findings = [makeFinding('critical'), makeFinding('warning'), makeFinding('info')];
      // 100 - 25 - 10 - 2 = 63
      expect(computeFileHealthScore(findings)).toBe(63);
    });
  });

  describe('computeProjectScore', () => {
    it('LOC-weighted average', () => {
      const files = [
        { healthScore: 100, linesOfCode: 100 },
        { healthScore: 50, linesOfCode: 100 },
      ];
      // (100*100 + 50*100) / (100+100) = 15000/200 = 75
      expect(computeProjectScore(files)).toBe(75);
    });

    it('weights larger files more', () => {
      const files = [
        { healthScore: 100, linesOfCode: 900 },
        { healthScore: 0, linesOfCode: 100 },
      ];
      // (100*900 + 0*100) / (900+100) = 90000/1000 = 90
      expect(computeProjectScore(files)).toBe(90);
    });

    it('returns 100 for no files', () => {
      expect(computeProjectScore([])).toBe(100);
    });
  });
});
