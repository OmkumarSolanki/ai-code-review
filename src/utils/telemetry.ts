import { performance } from 'perf_hooks';

export interface LlmBatchTelemetry {
  batchIndex: number;
  fileCount: number;
  durationMs: number;
  tokenEstimate: number;
}

export interface TelemetryReport {
  patternScannerMs: number;
  eslintMs: number;
  astParsingMs: number;
  batchingMs: number;
  llmBatches: LlmBatchTelemetry[];
  aggregationMs: number;
  fixValidationMs: number;
  totalMs: number;
}

export class Telemetry {
  private timings: Map<string, number> = new Map();
  private llmBatches: LlmBatchTelemetry[] = [];
  private totalStart: number = performance.now();

  async measure<T>(stageName: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    const result = await fn();
    this.timings.set(stageName, Math.round(performance.now() - start));
    return result;
  }

  recordLlmBatch(batch: LlmBatchTelemetry): void {
    this.llmBatches.push(batch);
  }

  getReport(): TelemetryReport {
    return {
      patternScannerMs: this.timings.get('patternScanner') ?? 0,
      eslintMs: this.timings.get('eslint') ?? 0,
      astParsingMs: this.timings.get('astParsing') ?? 0,
      batchingMs: this.timings.get('batching') ?? 0,
      llmBatches: this.llmBatches,
      aggregationMs: this.timings.get('aggregation') ?? 0,
      fixValidationMs: this.timings.get('fixValidation') ?? 0,
      totalMs: Math.round(performance.now() - this.totalStart),
    };
  }
}
