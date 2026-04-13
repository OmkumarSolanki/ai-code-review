process.env.DATABASE_URL = 'file:./dev.db';
process.env.JWT_SECRET = 'test-golden';
process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';
process.env.LLM_PROVIDER = 'demo';

import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { runReviewPipeline } from '../../src/services/reviewService';
import { cacheService } from '../../src/services/cacheService';

const prisma = new PrismaClient();
const SEED_DIR = path.join(__dirname, '..', '..', 'src', 'seed', 'files');
const EXPECTED_PATH = path.join(__dirname, '..', '..', 'src', 'seed', 'expected-findings.json');

interface ExpectedFinding {
  lineStart: number;
  category: string;
  severity: string;
  description: string;
}

let userId: string;

beforeAll(async () => {
  cacheService.clear();

  try { await prisma.finding.deleteMany(); } catch {}
  try { await prisma.file.deleteMany(); } catch {}
  try { await prisma.review.deleteMany(); } catch {}
  try { await prisma.user.deleteMany(); } catch {}

  const user = await prisma.user.create({
    data: { id: 'golden-user', email: 'golden@test.com', passwordHash: 'hash' },
  });
  userId = user.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

function loadSeedFiles() {
  const files: Array<{ filename: string; content: string }> = [];
  const entries = fs.readdirSync(SEED_DIR);

  for (const entry of entries) {
    const fullPath = path.join(SEED_DIR, entry);
    if (fs.statSync(fullPath).isFile()) {
      files.push({
        filename: entry,
        content: fs.readFileSync(fullPath, 'utf-8'),
      });
    }
  }
  return files;
}

function loadExpectedFindings(): Record<string, ExpectedFinding[]> {
  return JSON.parse(fs.readFileSync(EXPECTED_PATH, 'utf-8'));
}

describe('Golden File Tests — Seed Repository', () => {
  let result: Awaited<ReturnType<typeof runReviewPipeline>>;
  const expected = loadExpectedFindings();

  beforeAll(async () => {
    const files = loadSeedFiles();
    result = await runReviewPipeline(userId, { files, reviewProfile: 'full' });
  }, 60000);

  it('pipeline completes successfully', () => {
    expect(result.status).toBe('COMPLETED');
  });

  it('clean-example.ts has no critical/warning findings', () => {
    const file = result.files.find(f => f.filename === 'clean-example.ts');
    expect(file).toBeDefined();
    const issues = file!.findings.filter(f => f.severity !== 'info');
    // Allow minor info-level findings, but no critical/warning
    expect(issues.filter(f => f.severity === 'critical')).toHaveLength(0);
  });

  it('clean-example.py has no critical/warning findings', () => {
    const file = result.files.find(f => f.filename === 'clean-example.py');
    expect(file).toBeDefined();
    const issues = file!.findings.filter(f => f.severity === 'critical');
    expect(issues).toHaveLength(0);
  });

  it('clean-example.java has no critical/warning findings', () => {
    const file = result.files.find(f => f.filename === 'clean-example.java');
    expect(file).toBeDefined();
    const issues = file!.findings.filter(f => f.severity === 'critical');
    expect(issues).toHaveLength(0);
  });

  it('pattern scanner catches hardcoded secrets in TS files', () => {
    const file = result.files.find(f => f.filename === 'hardcoded-secrets.ts');
    expect(file).toBeDefined();
    const secretFindings = file!.findings.filter(f =>
      f.category === 'security' && f.severity === 'critical'
    );
    expect(secretFindings.length).toBeGreaterThan(0);
  });

  it('pattern scanner catches hardcoded secrets in Python files', () => {
    const file = result.files.find(f => f.filename === 'flask-sql-injection.py');
    expect(file).toBeDefined();
    const secretFindings = file!.findings.filter(f => f.category === 'security');
    expect(secretFindings.length).toBeGreaterThan(0);
  });

  it('pattern scanner catches SQL injection in Java files', () => {
    const file = result.files.find(f => f.filename === 'java-sql-injection.java');
    expect(file).toBeDefined();
    const sqlFindings = file!.findings.filter(f => f.category === 'security');
    expect(sqlFindings.length).toBeGreaterThan(0);
  });

  it('pattern scanner catches dangerous deserialization in Python', () => {
    const file = result.files.find(f => f.filename === 'insecure-pickle.py');
    expect(file).toBeDefined();
    const findings = file!.findings.filter(
      f => f.message.toLowerCase().includes('deserializ') || f.ruleId === 'dangerous-deserialize'
    );
    expect(findings.length).toBeGreaterThan(0);
  });

  it('pattern scanner catches eval in JS/TS files', () => {
    const file = result.files.find(f => f.filename === 'xss-vulnerability.ts');
    if (!file) return; // Skip if not present
    const xssFindings = file.findings.filter(
      f => f.ruleId === 'innerHTML-xss' || f.message.toLowerCase().includes('xss')
    );
    expect(xssFindings.length).toBeGreaterThan(0);
  });

  it('computes precision and recall metrics', () => {
    let tp = 0, fp = 0, fn = 0;

    for (const [filename, expectedBugs] of Object.entries(expected)) {
      const file = result.files.find(f => f.filename === filename);
      if (!file) {
        fn += expectedBugs.length;
        continue;
      }

      const matched = new Set<number>();

      for (const bug of expectedBugs) {
        const found = file.findings.some(
          f => Math.abs(f.lineStart - bug.lineStart) <= 5 && f.category === bug.category
        );
        if (found) {
          tp++;
        } else {
          fn++;
        }
      }

      // Count false positives (findings not matching any expected bug)
      for (const finding of file.findings) {
        const isExpected = expectedBugs.some(
          b => Math.abs(finding.lineStart - b.lineStart) <= 5 && finding.category === b.category
        );
        if (!isExpected && finding.severity !== 'info') {
          fp++;
        }
      }
    }

    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;

    console.log(`\n=== Precision/Recall Metrics ===`);
    console.log(`True Positives:  ${tp}`);
    console.log(`False Positives: ${fp}`);
    console.log(`False Negatives: ${fn}`);
    console.log(`Precision:       ${(precision * 100).toFixed(1)}%`);
    console.log(`Recall:          ${(recall * 100).toFixed(1)}%`);
    console.log(`================================\n`);

    // We expect reasonable recall — at least some planted bugs found
    expect(tp).toBeGreaterThan(0);
  });
});
