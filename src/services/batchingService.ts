import { estimateTokens } from '../utils/tokenEstimator';
import { ASTMetadata, DependencyGraph } from './astService';

export interface BatchFile {
  filename: string;
  content: string;
  language: string;
  metadata?: ASTMetadata | null;
}

export interface Batch {
  files: BatchFile[];
  estimatedTokens: number;
}

const DEFAULT_TOKEN_BUDGET = parseInt(process.env.LLM_BATCH_TOKEN_BUDGET || '12000', 10);

export function createBatches(
  files: BatchFile[],
  dependencyGraph: DependencyGraph,
  tokenBudget: number = DEFAULT_TOKEN_BUDGET
): Batch[] {
  const batches: Batch[] = [];
  const fileMap = new Map<string, BatchFile>();

  for (const file of files) {
    fileMap.set(file.filename, file);
  }

  for (const component of dependencyGraph.components) {
    const componentFiles = component
      .map(name => fileMap.get(name))
      .filter((f): f is BatchFile => f !== undefined);

    if (componentFiles.length === 0) continue;

    const componentTokens = componentFiles.reduce(
      (sum, f) => sum + estimateTokens(f.content),
      0
    );

    if (componentTokens <= tokenBudget) {
      // Entire component fits in one batch
      batches.push({
        files: componentFiles,
        estimatedTokens: componentTokens,
      });
    } else {
      // Need to split the component
      const subBatches = splitComponent(componentFiles, tokenBudget);
      batches.push(...subBatches);
    }
  }

  return batches;
}

function splitComponent(files: BatchFile[], tokenBudget: number): Batch[] {
  // Sort by token count descending (first-fit-decreasing bin packing)
  const sorted = [...files].sort(
    (a, b) => estimateTokens(b.content) - estimateTokens(a.content)
  );

  const batches: Batch[] = [];

  for (const file of sorted) {
    const fileTokens = estimateTokens(file.content);

    if (fileTokens > tokenBudget) {
      // Single file exceeds budget — split by line count
      const chunks = splitLargeFile(file, tokenBudget);
      batches.push(...chunks);
      continue;
    }

    // Try to fit in existing batch
    let placed = false;
    for (const batch of batches) {
      if (batch.estimatedTokens + fileTokens <= tokenBudget) {
        batch.files.push(file);
        batch.estimatedTokens += fileTokens;
        placed = true;
        break;
      }
    }

    if (!placed) {
      batches.push({
        files: [file],
        estimatedTokens: fileTokens,
      });
    }
  }

  return batches;
}

function splitLargeFile(file: BatchFile, tokenBudget: number): Batch[] {
  const lines = file.content.split('\n');
  const charsPerBatch = tokenBudget * 4;
  const batches: Batch[] = [];
  let currentLines: string[] = [];
  let currentChars = 0;

  for (const line of lines) {
    if (currentChars + line.length > charsPerBatch && currentLines.length > 0) {
      const content = currentLines.join('\n');
      batches.push({
        files: [{
          ...file,
          content,
        }],
        estimatedTokens: estimateTokens(content),
      });
      currentLines = [];
      currentChars = 0;
    }
    currentLines.push(line);
    currentChars += line.length + 1;
  }

  if (currentLines.length > 0) {
    const content = currentLines.join('\n');
    batches.push({
      files: [{
        ...file,
        content,
      }],
      estimatedTokens: estimateTokens(content),
    });
  }

  return batches;
}
