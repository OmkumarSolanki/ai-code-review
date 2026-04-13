import { Batch } from './batchingService';

export type ReviewProfile = 'security' | 'performance' | 'quality' | 'full';

const PROFILE_DESCRIPTIONS: Record<ReviewProfile, string> = {
  security:
    'Focus exclusively on security vulnerabilities: SQL injection, XSS, CSRF, hardcoded secrets, insecure authentication, path traversal, insecure deserialization, missing input validation, and authorization bypasses.',
  performance:
    'Focus exclusively on performance issues: N+1 queries, memory leaks, unnecessary re-renders, missing memoization, unoptimized loops, large bundle imports, missing database indexes, and blocking I/O on the main thread.',
  quality:
    'Focus on code quality: naming conventions, function complexity, code duplication, dead code, missing types, error handling patterns, separation of concerns, and adherence to SOLID principles.',
  full:
    'Review for all categories: security vulnerabilities, performance issues, code quality, logic bugs, and best practices.',
};

const FEW_SHOT_GOOD = `Example of a GOOD finding:
{
  "filename": "userService.ts",
  "lineStart": 41,
  "lineEnd": 41,
  "severity": "critical",
  "category": "security",
  "message": "The db.query() call on line 41 uses string concatenation with user input (req.params.id), enabling SQL injection. Use parameterized queries: db.query('SELECT * FROM users WHERE id = ?', [req.params.id])",
  "suggestedFix": "const user = await db.query('SELECT * FROM users WHERE id = ?', [req.params.id]);",
  "confidence": 0.95
}`;

const FEW_SHOT_BAD = `Example of a BAD finding (DO NOT generate findings like this):
{
  "filename": "userService.ts",
  "lineStart": 0,
  "lineEnd": 0,
  "severity": "warning",
  "category": "best-practice",
  "message": "Consider adding error handling",
  "suggestedFix": null,
  "confidence": 0.5
}`;

export function buildSystemPrompt(profile: ReviewProfile, languages: string[]): string {
  const languageList = [...new Set(languages)].join(', ');
  const profileDescription = PROFILE_DESCRIPTIONS[profile];

  return `You are a senior code reviewer with expertise in ${languageList} development.
You are reviewing code for: ${profileDescription}

RESPONSE FORMAT:
Respond ONLY with a JSON array. No markdown, no backticks, no preamble.
Each element must match this exact schema:

[
  {
    "filename": "string — the filename being reviewed",
    "lineStart": number,
    "lineEnd": number,
    "severity": "critical" | "warning" | "info",
    "category": "security" | "performance" | "logic" | "style" | "best-practice",
    "message": "string — specific, actionable description of the issue",
    "suggestedFix": "string — the corrected code that fixes the issue, or null if no fix applies",
    "confidence": number between 0.0 and 1.0
  }
]

RULES:
- Be specific. "Consider adding error handling" is BAD. "The db.query() call on line 41 can throw on connection loss — wrap in try-catch and return a 503" is GOOD.
- Every finding MUST include a line number. Do not report issues without referencing specific lines.
- suggestedFix should contain ONLY the corrected code for the affected lines, not the entire file.
- Return an empty array [] if the code has no issues.
- Do NOT report style issues if the review profile is "security" or "performance".
- confidence should be 0.9+ for obvious issues, 0.5-0.8 for likely issues, below 0.5 for suspicious patterns.

${FEW_SHOT_GOOD}

${FEW_SHOT_BAD}`;
}

export function buildUserMessage(batch: Batch): string {
  const parts: string[] = [`Review the following ${batch.files.length} files:\n`];

  for (const file of batch.files) {
    parts.push(`--- FILE: ${file.filename} ---`);
    parts.push(`Language: ${file.language}`);

    if (file.metadata) {
      if (file.metadata.exports.length > 0) {
        parts.push(`Exports: ${file.metadata.exports.join(', ')}`);
      }
      if (file.metadata.imports.length > 0) {
        parts.push(`Imports: ${file.metadata.imports.map(i => i.source).join(', ')}`);
      }
      if (file.metadata.functions.length > 0) {
        const funcDescriptions = file.metadata.functions.map(f => {
          const params = f.params.join(', ');
          return `${f.name}(${params}) [complexity: ${f.complexity}]`;
        });
        parts.push(`Functions: ${funcDescriptions.join(', ')}`);
      }
    }

    parts.push('');
    parts.push(file.content);
    parts.push(`--- END FILE ---\n`);
  }

  return parts.join('\n');
}

export function buildPrompt(
  batch: Batch,
  profile: ReviewProfile
): { systemPrompt: string; userMessage: string } {
  const languages = batch.files.map(f => f.language);
  return {
    systemPrompt: buildSystemPrompt(profile, languages),
    userMessage: buildUserMessage(batch),
  };
}
