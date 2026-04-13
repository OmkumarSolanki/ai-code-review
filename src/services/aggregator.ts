import { Finding } from './staticAnalysis/types';

const LINE_TOLERANCE = 3;

const SEVERITY_RANK: Record<string, number> = {
  critical: 3,
  warning: 2,
  info: 1,
};

function findingsMatch(a: Finding, b: Finding): boolean {
  if (a.filename !== b.filename) return false;
  return Math.abs(a.lineStart - b.lineStart) <= LINE_TOLERANCE;
}

function higherSeverity(a: string, b: string): Finding['severity'] {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a as Finding['severity'] : b as Finding['severity'];
}

function boostSeverity(severity: string): Finding['severity'] {
  // Multi-source agreement: promote warnings to critical
  if (severity === 'warning') return 'critical';
  return severity as Finding['severity'];
}

function mergeFindings(a: Finding, b: Finding): Finding {
  // Keep the richest message: LLM > ESLint > pattern
  const sourceRank: Record<string, number> = { llm: 3, eslint: 2, pattern: 1, merged: 4 };
  const primary = (sourceRank[a.source] ?? 0) >= (sourceRank[b.source] ?? 0) ? a : b;
  const secondary = primary === a ? b : a;

  const baseSeverity = higherSeverity(a.severity, b.severity);
  const finalSeverity = boostSeverity(baseSeverity);

  return {
    source: 'merged',
    category: primary.category,
    severity: finalSeverity,
    message: primary.message,
    lineStart: primary.lineStart,
    lineEnd: primary.lineEnd,
    ruleId: a.ruleId || b.ruleId,
    suggestedFix: primary.suggestedFix || secondary.suggestedFix,
    confidence: primary.confidence ?? secondary.confidence,
    filename: primary.filename,
  };
}

export function extractCodeSnippet(content: string, lineStart: number, lineEnd: number): string {
  const lines = content.split('\n');
  const start = Math.max(0, lineStart - 3); // 2 lines before (0-indexed: lineStart-1 - 2)
  const end = Math.min(lines.length, lineEnd + 2); // 2 lines after
  return lines.slice(start, end).join('\n');
}

export function aggregateFindings(
  findingsBySource: Finding[][],
  fileContents: Map<string, string>
): Finding[] {
  // Flatten all findings
  const allFindings = findingsBySource.flat();

  // Group by filename
  const byFile = new Map<string, Finding[]>();
  for (const f of allFindings) {
    const key = f.filename ?? '';
    if (!byFile.has(key)) byFile.set(key, []);
    byFile.get(key)!.push(f);
  }

  const result: Finding[] = [];

  for (const [filename, fileFindings] of byFile) {
    const merged = deduplicateAndMerge(fileFindings);
    const content = fileContents.get(filename);

    for (const finding of merged) {
      if (content) {
        finding.codeSnippet = extractCodeSnippet(content, finding.lineStart, finding.lineEnd);
      }
      result.push(finding);
    }
  }

  // Sort by severity (critical first) then line number
  result.sort((a, b) => {
    const severityDiff = (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0);
    if (severityDiff !== 0) return severityDiff;
    return a.lineStart - b.lineStart;
  });

  return result;
}

function deduplicateAndMerge(findings: Finding[]): Finding[] {
  const used = new Set<number>();
  const result: Finding[] = [];

  for (let i = 0; i < findings.length; i++) {
    if (used.has(i)) continue;

    let current = findings[i];
    let wasMerged = false;

    for (let j = i + 1; j < findings.length; j++) {
      if (used.has(j)) continue;
      if (findings[i].source === findings[j].source) continue; // Don't merge same-source findings

      if (findingsMatch(current, findings[j])) {
        current = mergeFindings(current, findings[j]);
        used.add(j);
        wasMerged = true;
      }
    }

    used.add(i);
    result.push(current);
  }

  return result;
}
