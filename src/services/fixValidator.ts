import { Finding } from './staticAnalysis/types';
import { patternScanner } from './staticAnalysis/patternScanner';
import { eslintAnalyzer } from './staticAnalysis/eslintAnalyzer';
import { parseFileTree, countErrorNodes } from './astService';

export type FixStatus = 'verified' | 'unverified' | 'unavailable';

export async function validateFix(
  finding: Finding,
  originalContent: string,
  language: string
): Promise<FixStatus> {
  if (!finding.suggestedFix) return 'unavailable';

  try {
    // Create virtual file with fix applied
    const lines = originalContent.split('\n');
    const fixLines = finding.suggestedFix.split('\n');
    const startIdx = Math.max(0, finding.lineStart - 1);
    const endIdx = Math.min(lines.length, finding.lineEnd);

    const fixedLines = [
      ...lines.slice(0, startIdx),
      ...fixLines,
      ...lines.slice(endIdx),
    ];
    const fixedContent = fixedLines.join('\n');

    // 1. Tree-sitter parse check (works for all languages)
    const originalTree = await parseFileTree(originalContent, language);
    const fixedTree = await parseFileTree(fixedContent, language);

    if (originalTree && fixedTree) {
      const originalErrors = countErrorNodes(originalTree);
      const fixedErrors = countErrorNodes(fixedTree);
      originalTree.delete();
      fixedTree.delete();

      if (fixedErrors > originalErrors) {
        return 'unavailable';
      }
    } else if (!originalTree && !fixedTree) {
      // Can't validate via tree-sitter — continue to static analysis
    }

    // 2. Run static analyzers on fixed content
    const filename = finding.filename ?? 'unknown';

    // Pattern scanner (all languages)
    const originalPatternFindings = await patternScanner.analyze(filename, originalContent, language);
    const fixedPatternFindings = await patternScanner.analyze(filename, fixedContent, language);

    const newCriticalPattern = fixedPatternFindings.filter(
      f => f.severity === 'critical' &&
        !originalPatternFindings.some(o => o.ruleId === f.ruleId && o.lineStart === f.lineStart)
    );

    if (newCriticalPattern.length > 0) {
      return 'unavailable';
    }

    // 3. ESLint check (JS/TS only)
    if (eslintAnalyzer.supports(language)) {
      const originalEslintFindings = await eslintAnalyzer.analyze(filename, originalContent, language);
      const fixedEslintFindings = await eslintAnalyzer.analyze(filename, fixedContent, language);

      const newCriticalEslint = fixedEslintFindings.filter(
        f => f.severity === 'critical' &&
          !originalEslintFindings.some(o => o.ruleId === f.ruleId && o.lineStart === f.lineStart)
      );

      if (newCriticalEslint.length > 0) {
        return 'unavailable';
      }
    }

    return 'verified';
  } catch {
    return 'unverified';
  }
}
