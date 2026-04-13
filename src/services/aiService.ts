/**
 * Unified AI service for all LLM-powered features.
 * Each feature has a dedicated prompt builder and response handler.
 */

import { getLLMProvider } from './llm/adapter';
import { LLMProvider } from './llm/types';
import { Batch } from './batchingService';
import { Finding } from './staticAnalysis/types';

export type AIFeature = 'deep-review' | 'explain' | 'improve' | 'generate-tests' | 'generate-docs' | 'ask';

export interface AIRequest {
  feature: AIFeature;
  files: Array<{ filename: string; content: string; language?: string }>;
  question?: string; // For 'ask' feature
  llmProvider?: string;
  apiKey?: string;
  model?: string;
}

export interface AIResponse {
  feature: AIFeature;
  result: string; // Markdown-formatted response
  files: string[]; // Which files were analyzed
  tokenEstimate?: number;
}

// ─── Prompt Builders ─────────────────────────────────────

function buildDeepReviewPrompt(files: AIRequest['files']): { system: string; user: string } {
  return {
    system: `You are an elite senior software engineer doing a thorough code review.

Go BEYOND simple pattern matching. Focus on things only a human reviewer would catch:
- Logic bugs (off-by-one, wrong conditions, missing edge cases)
- Race conditions and concurrency issues
- Architectural problems (tight coupling, wrong abstraction level)
- Security issues that require understanding data flow
- Performance problems that require understanding the algorithm
- Missing error handling that could cause production incidents
- API misuse or incorrect assumptions about libraries

For each issue found, provide:
1. The severity (critical / warning / info)
2. The exact location (filename + line numbers)
3. A clear explanation of WHY it's a problem (not just what)
4. A concrete code fix

If the code is well-written, say so — don't invent problems.

Format your response as clean markdown.`,
    user: formatFilesForPrompt(files),
  };
}

function buildExplainPrompt(files: AIRequest['files']): { system: string; user: string } {
  return {
    system: `You are a patient, experienced developer explaining code to a colleague.

Provide a clear, structured explanation:
1. **Overview** — What does this code do? (2-3 sentences, plain English)
2. **How it works** — Walk through the logic step by step
3. **Key concepts** — Explain any patterns, algorithms, or techniques used
4. **Dependencies** — What does this code depend on? What depends on it?
5. **Potential issues** — Any gotchas someone should know about?

Use simple language. Avoid jargon unless you explain it. Use code snippets to illustrate points.
Format as clean markdown.`,
    user: formatFilesForPrompt(files),
  };
}

function buildImprovePrompt(files: AIRequest['files']): { system: string; user: string } {
  return {
    system: `You are a senior developer pair-programming with a colleague. They've asked you to suggest improvements to their code.

Focus on:
1. **Readability** — Better naming, simpler structure, removing unnecessary complexity
2. **Patterns** — More idiomatic ways to write this in the language being used
3. **Architecture** — Better separation of concerns, SOLID principles where they help
4. **Performance** — Any easy wins (not premature optimization)
5. **Robustness** — Edge cases, error handling, defensive coding

For each suggestion:
- Show the BEFORE and AFTER code
- Explain WHY the improvement matters (not just "this is better")
- Rate the impact: High / Medium / Low

Don't rewrite the entire file. Focus on the highest-impact improvements.
Format as clean markdown with code blocks.`,
    user: formatFilesForPrompt(files),
  };
}

function buildGenerateTestsPrompt(files: AIRequest['files']): { system: string; user: string } {
  return {
    system: `You are a testing expert. Generate comprehensive unit tests for the provided code.

Guidelines:
- Use the appropriate test framework for the language (Jest for TS/JS, pytest for Python, JUnit for Java, etc.)
- Cover: happy path, edge cases, error cases, boundary values
- Use descriptive test names that explain what's being tested
- Include setup/teardown if needed
- Mock external dependencies
- Add brief comments explaining WHY each test case matters

Output ONLY the test code — ready to copy into a test file and run.
Format as a single code block with the appropriate language tag.`,
    user: formatFilesForPrompt(files),
  };
}

function buildGenerateDocsPrompt(files: AIRequest['files']): { system: string; user: string } {
  return {
    system: `You are a documentation expert. Generate clear, useful documentation for the provided code.

Generate:
1. **Module overview** — What this code does and why it exists
2. **Function/Class documentation** — For each public function or class:
   - Description
   - Parameters with types and descriptions
   - Return value
   - Throws/errors
   - Usage example
3. **Usage examples** — Show how to use the main exports
4. **Notes** — Any important caveats, assumptions, or gotchas

Use the appropriate doc format for the language:
- TypeScript/JavaScript: JSDoc comments + markdown
- Python: Google-style docstrings + markdown
- Java: Javadoc + markdown
- Other: markdown with inline comments

Format as clean markdown. Include the documented code where helpful.`,
    user: formatFilesForPrompt(files),
  };
}

function buildAskPrompt(files: AIRequest['files'], question: string): { system: string; user: string } {
  return {
    system: `You are a knowledgeable developer answering questions about code.

Be direct and specific. Reference exact line numbers and function names.
If you're not sure about something, say so.
Use code snippets to illustrate your answers.
Format as clean markdown.`,
    user: `${formatFilesForPrompt(files)}\n\n---\n\n**Question:** ${question}`,
  };
}

// ─── Helpers ─────────────────────────────────────────────

function formatFilesForPrompt(files: AIRequest['files']): string {
  const parts: string[] = [];
  for (const file of files) {
    const lang = file.language || detectLang(file.filename);
    parts.push(`### ${file.filename}`);
    parts.push('```' + lang);
    parts.push(file.content);
    parts.push('```');
    parts.push('');
  }
  return parts.join('\n');
}

function detectLang(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', java: 'java', go: 'go', rs: 'rust', rb: 'ruby',
    cpp: 'cpp', c: 'c', cs: 'csharp', php: 'php', swift: 'swift',
    kt: 'kotlin', scala: 'scala', sql: 'sql', sh: 'bash',
  };
  return map[ext] || ext;
}

function estimateTokens(text: string): number {
  // Rough estimate: ~4 chars per token
  return Math.ceil(text.length / 4);
}

// ─── Main AI Service ─────────────────────────────────────

export async function runAIFeature(request: AIRequest): Promise<AIResponse> {
  const { feature, files, question, llmProvider, apiKey, model } = request;

  // Build the appropriate prompt
  let prompt: { system: string; user: string };

  switch (feature) {
    case 'deep-review':
      prompt = buildDeepReviewPrompt(files);
      break;
    case 'explain':
      prompt = buildExplainPrompt(files);
      break;
    case 'improve':
      prompt = buildImprovePrompt(files);
      break;
    case 'generate-tests':
      prompt = buildGenerateTestsPrompt(files);
      break;
    case 'generate-docs':
      prompt = buildGenerateDocsPrompt(files);
      break;
    case 'ask':
      if (!question) throw new Error('Question is required for the Ask feature');
      prompt = buildAskPrompt(files, question);
      break;
    default:
      throw new Error(`Unknown feature: ${feature}`);
  }

  // Get the LLM provider
  const provider = llmProvider || 'demo';
  if (provider === 'demo') {
    return getDemoResponse(feature, files);
  }

  // Call the actual LLM
  const result = await callLLM(provider, apiKey, prompt.system, prompt.user, model);

  return {
    feature,
    result,
    files: files.map(f => f.filename),
    tokenEstimate: estimateTokens(prompt.system + prompt.user + result),
  };
}

async function callLLM(provider: string, apiKey: string | undefined, system: string, user: string, model?: string): Promise<string> {
  if (!apiKey) {
    throw new Error('API key is required. Go to Settings to add your API key.');
  }

  switch (provider) {
    case 'claude':
      return callClaude(apiKey, system, user, model);
    case 'openai':
      return callOpenAI(apiKey, system, user, model);
    case 'gemini':
      return callGemini(apiKey, system, user, model);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

async function callClaude(apiKey: string, system: string, user: string, model?: string): Promise<string> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: model || 'claude-sonnet-4-6-20250620',
    max_tokens: 8192,
    system,
    messages: [{ role: 'user', content: user }],
  });

  const block = response.content[0];
  if (block?.type === 'text') return block.text;
  throw new Error('Unexpected response from Claude');
}

async function callOpenAI(apiKey: string, system: string, user: string, model?: string): Promise<string> {
  const OpenAI = (await import('openai')).default;
  const client = new OpenAI({ apiKey });

  const response = await client.chat.completions.create({
    model: model || 'gpt-4o',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.2,
  });

  return response.choices[0]?.message?.content ?? '';
}

async function callGemini(apiKey: string, system: string, user: string, model?: string): Promise<string> {
  const geminiModel = model || 'gemini-2.5-flash';
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${system}\n\n${user}` }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
      }),
    }
  );

  const data = await response.json() as any;

  if (!response.ok) {
    const msg = data?.error?.message || `Gemini API error ${response.status}`;
    throw new Error(msg);
  }

  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

// ─── Demo Responses ──────────────────────────────────────

function getDemoResponse(feature: AIFeature, files: AIRequest['files']): AIResponse {
  const filenames = files.map(f => f.filename);

  const demoMessages: Record<AIFeature, string> = {
    'deep-review': `## Deep Review Results

> **This is a demo response.** Add an API key in Settings to get real AI-powered analysis.

To get a real deep review, the AI will:
- Analyze your code for **logic bugs**, **race conditions**, and **architectural issues**
- Find problems that simple pattern matching can't detect
- Provide **detailed explanations** of why each issue matters
- Give you **concrete code fixes**

### How to enable
1. Go to **Settings**
2. Choose **Claude**, **OpenAI**, or **Gemini**
3. Enter your API key
4. Come back here and run Deep Review again`,

    'explain': `## Code Explanation

> **This is a demo response.** Add an API key in Settings to get real AI-powered explanations.

With a real API key, the AI will:
- Give you a **plain English overview** of what your code does
- **Walk through the logic** step by step
- Explain **patterns and techniques** used
- Highlight **potential gotchas**`,

    'improve': `## Improvement Suggestions

> **This is a demo response.** Add an API key in Settings to get real AI-powered suggestions.

With a real API key, the AI will:
- Suggest **better patterns** and more idiomatic code
- Show **before/after** comparisons
- Explain **why** each change improves the code
- Rate each suggestion by **impact level**`,

    'generate-tests': `## Generated Tests

> **This is a demo response.** Add an API key in Settings to get real AI-generated tests.

With a real API key, the AI will:
- Generate **complete, runnable unit tests**
- Cover **happy path, edge cases, and error cases**
- Use the right test framework for your language
- Include **setup, mocks, and assertions**`,

    'generate-docs': `## Generated Documentation

> **This is a demo response.** Add an API key in Settings to get real AI-generated docs.

With a real API key, the AI will:
- Generate **JSDoc/docstrings** for every function
- Create a **module overview**
- Add **usage examples**
- Document **parameters, return values, and errors**`,

    'ask': `## Answer

> **This is a demo response.** Add an API key in Settings to get real AI answers.

With a real API key, you can ask any question about your code and get a detailed, specific answer referencing exact lines and functions.`,
  };

  return {
    feature,
    result: demoMessages[feature],
    files: filenames,
  };
}
