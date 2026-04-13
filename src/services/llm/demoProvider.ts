import { LLMProvider, LLMFinding } from './types';
import { Batch } from '../batchingService';
import { Finding } from '../staticAnalysis/types';
import { ReviewProfile } from '../promptBuilder';
import path from 'path';
import fs from 'fs';

const DEMO_RESULTS_PATH = path.join(__dirname, '..', '..', 'seed', 'demo-results.json');

interface DemoResults {
  [filename: string]: LLMFinding[];
}

function loadDemoResults(): DemoResults {
  try {
    const raw = fs.readFileSync(DEMO_RESULTS_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function toLLMFinding(finding: LLMFinding, filename: string): Finding {
  return {
    source: 'llm',
    category: finding.category,
    severity: finding.severity,
    message: finding.message,
    lineStart: finding.lineStart,
    lineEnd: finding.lineEnd,
    suggestedFix: finding.suggestedFix ?? undefined,
    confidence: finding.confidence,
    filename,
  };
}

export class DemoProvider implements LLMProvider {
  name = 'demo';
  private results: DemoResults;

  constructor() {
    this.results = loadDemoResults();
  }

  async analyzeCode(
    batches: Batch[],
    _profile: ReviewProfile,
    onBatchComplete: (batchIndex: number, findings: Finding[]) => void
  ): Promise<Finding[]> {
    const allFindings: Finding[] = [];

    for (let i = 0; i < batches.length; i++) {
      // Simulate realistic latency
      await new Promise(resolve => setTimeout(resolve, 300));

      const batchFindings: Finding[] = [];
      for (const file of batches[i].files) {
        const demoFindings = this.results[file.filename] ?? [];
        for (const f of demoFindings) {
          batchFindings.push(toLLMFinding(f, file.filename));
        }
      }

      allFindings.push(...batchFindings);
      onBatchComplete(i, batchFindings);
    }

    return allFindings;
  }
}

export const demoProvider = new DemoProvider();
