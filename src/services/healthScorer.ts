import { Finding } from './staticAnalysis/types';

export function computeFileHealthScore(findings: Finding[]): number {
  let score = 100;

  for (const f of findings) {
    switch (f.severity) {
      case 'critical':
        score -= 25;
        break;
      case 'warning':
        score -= 10;
        break;
      case 'info':
        score -= 2;
        break;
    }
  }

  return Math.max(0, Math.min(100, score));
}

export function computeProjectScore(
  files: Array<{ healthScore: number; linesOfCode: number }>
): number {
  const totalLoc = files.reduce((sum, f) => sum + f.linesOfCode, 0);
  if (totalLoc === 0) return 100;

  const weightedSum = files.reduce(
    (sum, f) => sum + f.healthScore * f.linesOfCode,
    0
  );

  return Math.round(weightedSum / totalLoc);
}
