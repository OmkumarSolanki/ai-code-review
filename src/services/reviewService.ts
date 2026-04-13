import { prisma } from '../prismaClient';
import { detectLanguage, isBinaryContent, countLinesOfCode, sanitizeFilename } from './fileProcessor';
import { parseFile, buildDependencyGraph, ASTMetadata } from './astService';
import { createBatches } from './batchingService';
import { getAnalyzers } from './staticAnalysis/analyzer';
import { Finding } from './staticAnalysis/types';
import { getLLMProvider } from './llm/adapter';
import { aggregateFindings } from './aggregator';
import { validateFix } from './fixValidator';
import { computeFileHealthScore, computeProjectScore } from './healthScorer';
import { cacheService, hashContent } from './cacheService';
import { Telemetry, TelemetryReport } from '../utils/telemetry';
import { ReviewProfile } from './promptBuilder';

export interface ReviewInput {
  files: Array<{ filename: string; content: string }>;
  reviewProfile?: ReviewProfile;
  inputMode?: 'full' | 'diff';
  llmProvider?: string;
  apiKey?: string;
  model?: string;
}

export interface ReviewResult {
  reviewId: string;
  status: string;
  projectScore: number | null;
  files: FileResult[];
  telemetry: TelemetryReport;
}

export interface FileResult {
  id: string;
  filename: string;
  language: string;
  healthScore: number | null;
  linesOfCode: number;
  complexity: number | null;
  findings: Finding[];
}

interface PublishEvent {
  type: string;
  reviewId: string;
  sequenceNumber: number;
  batchIndex?: number;
  batchTotal?: number;
  newFindings?: Finding[];
  completedFiles?: FileResult[];
  projectScore?: number;
  errorMessage?: string;
  telemetry?: TelemetryReport;
}

export async function runReviewPipeline(
  userId: string,
  input: ReviewInput,
  publishEvent?: (event: PublishEvent) => void
): Promise<ReviewResult> {
  const telemetry = new Telemetry();
  const profile = input.reviewProfile ?? 'full';
  let sequenceNumber = 0;

  // 1. Create Review record
  const review = await prisma.review.create({
    data: {
      userId,
      status: 'PENDING',
      reviewProfile: profile,
      inputMode: input.inputMode ?? 'full',
      totalFiles: input.files.length,
    },
  });

  try {
    // 2-3. Filter binary files and detect language
    const processedFiles = input.files
      .map(f => ({
        filename: sanitizeFilename(f.filename),
        content: f.content,
        language: detectLanguage(f.filename),
        contentHash: hashContent(f.content),
        linesOfCode: countLinesOfCode(f.content),
      }))
      .filter(f => !isBinaryContent(f.content));

    // Skip cache — always run fresh analysis so provider changes take effect
    const cachedFiles: Array<typeof processedFiles[0] & { findings: Finding[] }> = [];
    const uncachedFiles = [...processedFiles];

    // 5. Create File records
    const fileRecords = await Promise.all(
      processedFiles.map(f =>
        prisma.file.create({
          data: {
            reviewId: review.id,
            filename: f.filename,
            language: f.language,
            content: f.content,
            contentHash: f.contentHash,
            linesOfCode: f.linesOfCode,
          },
        })
      )
    );

    // 6. Set ANALYZING
    await prisma.review.update({
      where: { id: review.id },
      data: { status: 'ANALYZING' },
    });

    // --- For uncached files ---
    const fileMetadata: Map<string, ASTMetadata | null> = new Map();
    const allFileFindings: Map<string, Finding[]> = new Map();

    if (uncachedFiles.length > 0) {
      // 7. Parse ASTs
      await telemetry.measure('astParsing', async () => {
        for (const file of uncachedFiles) {
          const meta = await parseFile(file.content, file.language);
          fileMetadata.set(file.filename, meta);
        }
      });

      // 8. Build dependency graph and batches
      const batches = await telemetry.measure('batching', async () => {
        const filesWithImports = uncachedFiles.map(f => ({
          filename: f.filename,
          imports: fileMetadata.get(f.filename)?.imports ?? [],
        }));

        const graph = buildDependencyGraph(
          filesWithImports,
          uncachedFiles.map(f => f.filename)
        );

        return createBatches(
          uncachedFiles.map(f => ({
            filename: f.filename,
            content: f.content,
            language: f.language,
            metadata: fileMetadata.get(f.filename) ?? null,
          })),
          graph
        );
      });

      // 9-10. Run static analysis and LLM in parallel
      const [staticResults, llmResults] = await Promise.allSettled([
        // Static analysis
        telemetry.measure('patternScanner', async () => {
          const results: Finding[] = [];
          for (const file of uncachedFiles) {
            const analyzers = getAnalyzers(file.language);
            const analyzerResults = await Promise.allSettled(
              analyzers.map(a => a.analyze(file.filename, file.content, file.language))
            );
            for (const r of analyzerResults) {
              if (r.status === 'fulfilled') results.push(...r.value);
            }
          }
          return results;
        }),

        // LLM analysis
        (async () => {
          const provider = getLLMProvider(input.llmProvider, input.apiKey, input.model);
          console.log(`[Review] Using LLM provider: ${provider.name}, batches: ${batches.length}`);
          return provider.analyzeCode(batches, profile, (batchIndex, findings) => {
            console.log(`[Review] Batch ${batchIndex} complete: ${findings.length} LLM findings`);
            sequenceNumber++;
            telemetry.recordLlmBatch({
              batchIndex,
              fileCount: batches[batchIndex]?.files.length ?? 0,
              durationMs: 0,
              tokenEstimate: batches[batchIndex]?.estimatedTokens ?? 0,
            });
            publishEvent?.({
              type: 'BATCH_COMPLETED',
              reviewId: review.id,
              sequenceNumber,
              batchIndex,
              batchTotal: batches.length,
              newFindings: findings,
            });
          });
        })(),
      ]);

      const staticFindings = staticResults.status === 'fulfilled' ? staticResults.value : [];
      let llmFindings: Finding[] = [];
      let llmError: string | null = null;
      if (llmResults.status === 'fulfilled') {
        llmFindings = llmResults.value;
      } else {
        llmError = llmResults.reason?.message || 'LLM analysis failed';
        console.error('[Review] LLM analysis failed:', llmError);
      }

      // 11. Aggregate
      const fileContents = new Map(uncachedFiles.map(f => [f.filename, f.content]));
      const aggregated = await telemetry.measure('aggregation', async () =>
        aggregateFindings([staticFindings, llmFindings], fileContents)
      );

      // Group findings by file
      for (const finding of aggregated) {
        const fn = finding.filename ?? '';
        if (!allFileFindings.has(fn)) allFileFindings.set(fn, []);
        allFileFindings.get(fn)!.push(finding);
      }

      // 12. Validate fixes
      await telemetry.measure('fixValidation', async () => {
        for (const file of uncachedFiles) {
          const findings = allFileFindings.get(file.filename) ?? [];
          for (const finding of findings) {
            if (finding.suggestedFix) {
              finding.fixStatus = await validateFix(finding, file.content, file.language);
            }
          }
        }
      });

      // Cache results
      for (const file of uncachedFiles) {
        const findings = allFileFindings.get(file.filename) ?? [];
        cacheService.set(file.contentHash, findings);
      }
    }

    // Merge cached findings
    for (const cached of cachedFiles) {
      allFileFindings.set(cached.filename, cached.findings);
    }

    // 13. Compute health scores
    const fileResults: FileResult[] = [];

    for (const record of fileRecords) {
      const findings = allFileFindings.get(record.filename) ?? [];
      const healthScore = computeFileHealthScore(findings);
      const meta = fileMetadata.get(record.filename);

      await prisma.file.update({
        where: { id: record.id },
        data: {
          healthScore,
          complexity: meta?.complexity ?? null,
        },
      });

      // Store findings in DB
      for (const finding of findings) {
        await prisma.finding.create({
          data: {
            fileId: record.id,
            source: finding.source,
            category: finding.category,
            severity: finding.severity,
            message: finding.message,
            lineStart: finding.lineStart,
            lineEnd: finding.lineEnd,
            ruleId: finding.ruleId ?? null,
            codeSnippet: finding.codeSnippet ?? null,
            suggestedFix: finding.suggestedFix ?? null,
            fixStatus: finding.fixStatus ?? null,
            confidence: finding.confidence ?? null,
          },
        });
      }

      fileResults.push({
        id: record.id,
        filename: record.filename,
        language: record.language,
        healthScore,
        linesOfCode: record.linesOfCode,
        complexity: meta?.complexity ?? null,
        findings,
      });
    }

    // 14. Compute project score
    const projectScore = computeProjectScore(
      fileResults.map(f => ({
        healthScore: f.healthScore ?? 100,
        linesOfCode: f.linesOfCode,
      }))
    );

    const report = telemetry.getReport();

    // 15. Update review
    await prisma.review.update({
      where: { id: review.id },
      data: {
        status: 'COMPLETED',
        projectScore,
        analyzedFiles: processedFiles.length,
        totalTimeMs: report.totalMs,
      },
    });

    // 16. Publish completion
    sequenceNumber++;
    publishEvent?.({
      type: 'REVIEW_COMPLETED',
      reviewId: review.id,
      sequenceNumber,
      projectScore,
      telemetry: report,
    });

    return {
      reviewId: review.id,
      status: 'COMPLETED',
      projectScore,
      files: fileResults,
      telemetry: report,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';

    await prisma.review.update({
      where: { id: review.id },
      data: { status: 'FAILED', errorMessage },
    });

    sequenceNumber++;
    publishEvent?.({
      type: 'REVIEW_FAILED',
      reviewId: review.id,
      sequenceNumber,
      errorMessage,
    });

    throw err;
  }
}
