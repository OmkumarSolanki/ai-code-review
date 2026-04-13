import { Router, Request, Response } from 'express';
import { validateFiles } from '../middleware/validation';
import { runReviewPipeline } from '../services/reviewService';
import { runAIFeature, AIFeature } from '../services/aiService';
import { fetchFromGitHub } from '../services/githubService';

const router = Router();

// Health check for Fly.io
router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Helper: read LLM config from request headers (set by frontend from localStorage)
function getLLMConfig(req: Request) {
  const provider = (req.headers['x-llm-provider'] as string) || 'demo';
  const apiKey = req.headers['x-api-key'] as string | undefined;
  const model = req.headers['x-llm-model'] as string | undefined;
  return { provider, apiKey, model };
}

// ─── Quick Scan (Review Pipeline) ────────────────────────

router.post('/reviews', async (req: Request, res: Response) => {
  try {
    const { files, reviewProfile } = req.body;
    const { provider, apiKey, model } = getLLMConfig(req);

    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }

    const errors = validateFiles(files);
    if (errors.length > 0) {
      return res.status(400).json({ error: errors.map(e => e.message).join(', ') });
    }

    // Use a fixed userId for DB storage (no user accounts)
    const userId = 'local-user';

    const result = await runReviewPipeline(userId, {
      files,
      reviewProfile: (reviewProfile ?? 'full') as any,
      inputMode: 'full',
      llmProvider: provider,
      apiKey,
      model,
    });

    // Fetch the full review with findings
    const { prisma } = await import('../prismaClient');
    const review = await prisma.review.findUnique({
      where: { id: result.reviewId },
      include: { files: { include: { findings: true } } },
    });

    if (!review) return res.status(500).json({ error: 'Review not found' });

    // Strip raw content from response
    const clean = {
      ...review,
      files: review.files.map(f => {
        const { content, contentHash, ...rest } = f;
        return rest;
      }),
    };
    res.json(clean);
  } catch (err: any) {
    console.error('Review failed:', err);
    res.status(500).json({ error: err.message || 'Review failed' });
  }
});

router.get('/reviews', async (req: Request, res: Response) => {
  try {
    const { prisma } = await import('../prismaClient');
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    const reviews = await prisma.review.findMany({
      where: { userId: 'local-user' },
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' },
      include: { files: { include: { findings: true } } },
    });

    const clean = reviews.map(r => ({
      ...r,
      files: r.files.map(f => {
        const { content, contentHash, ...rest } = f;
        return rest;
      }),
    }));
    res.json(clean);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/reviews/:id', async (req: Request, res: Response) => {
  try {
    const { prisma } = await import('../prismaClient');
    const review = await prisma.review.findUnique({
      where: { id: req.params.id as string },
      include: { files: { include: { findings: true } } },
    });

    if (!review) return res.status(404).json({ error: 'Review not found' });
    const reviewWithFiles = review as any;
    const clean = {
      ...review,
      files: reviewWithFiles.files.map((f: any) => {
        const { content, contentHash, ...rest } = f;
        return rest;
      }),
    };
    res.json(clean);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── AI Features ─────────────────────────────────────────

const AI_FEATURES: AIFeature[] = ['deep-review', 'explain', 'improve', 'generate-tests', 'generate-docs', 'ask'];

router.post('/ai/:feature', async (req: Request, res: Response) => {
  try {
    const feature = req.params.feature as AIFeature;
    if (!AI_FEATURES.includes(feature)) {
      return res.status(400).json({ error: `Unknown feature: ${feature}` });
    }

    const { files, question } = req.body;
    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }

    const { provider, apiKey, model } = getLLMConfig(req);

    const result = await runAIFeature({
      feature,
      files,
      question,
      llmProvider: provider,
      apiKey,
      model,
    });

    res.json(result);
  } catch (err: any) {
    console.error('AI feature failed:', err);
    res.status(500).json({ error: err.message || 'AI feature failed' });
  }
});

// ─── Verify API Key ──────────────────────────────────────

router.post('/verify-key', async (req: Request, res: Response) => {
  try {
    const { provider, apiKey } = req.body;

    if (!provider || provider === 'demo') {
      return res.json({ valid: true, provider: 'demo', message: 'Demo mode — no API key needed' });
    }

    if (!apiKey) {
      return res.json({ valid: false, provider, message: 'No API key provided' });
    }

    // Quick validation call per provider
    try {
      if (provider === 'claude') {
        const Anthropic = (await import('@anthropic-ai/sdk')).default;
        const client = new Anthropic({ apiKey });
        await client.messages.create({
          model: 'claude-sonnet-4-6-20250620',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Say "ok"' }],
        });
        return res.json({ valid: true, provider, message: 'Claude API key is working!' });
      } else if (provider === 'openai') {
        const OpenAI = (await import('openai')).default;
        const client = new OpenAI({ apiKey });
        await client.chat.completions.create({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: 'Say "ok"' }],
          max_tokens: 5,
        });
        return res.json({ valid: true, provider, message: 'OpenAI API key is working!' });
      } else if (provider === 'gemini') {
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: 'Say "ok"' }] }],
              generationConfig: { maxOutputTokens: 5 },
            }),
          }
        );
        if (!resp.ok) {
          const data = await resp.json() as any;
          throw new Error(data?.error?.message || `API returned ${resp.status}`);
        }
        return res.json({ valid: true, provider, message: 'Gemini API key is working!' });
      }
    } catch (err: any) {
      return res.json({ valid: false, provider, message: `Key failed: ${err.message}` });
    }

    res.json({ valid: false, provider, message: 'Unknown provider' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Fetch Models ───────────────────────────────────────

router.post('/models', async (req: Request, res: Response) => {
  try {
    const { provider, apiKey } = req.body;

    if (!provider || provider === 'demo') {
      return res.json({ models: [] });
    }
    if (!apiKey) {
      return res.json({ models: [] });
    }

    let models: Array<{ id: string; name: string }> = [];

    if (provider === 'claude') {
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const client = new Anthropic({ apiKey });
      const response = await client.models.list({ limit: 100 });
      models = response.data
        .filter((m: { id: string }) =>
          m.id.includes('claude') && !m.id.includes('instant')
        )
        .sort((a: { id: string }, b: { id: string }) => b.id.localeCompare(a.id))
        .map((m: { id: string }) => ({
          id: m.id,
          name: formatModelName(m.id),
        }));
    } else if (provider === 'openai') {
      const OpenAI = (await import('openai')).default;
      const client = new OpenAI({ apiKey });
      const response = await client.models.list();
      models = response.data
        .filter(m => m.id.startsWith('gpt-') || m.id.startsWith('o') || m.id.startsWith('chatgpt-'))
        .filter(m => !m.id.includes('realtime') && !m.id.includes('audio') && !m.id.includes('transcri'))
        .sort((a, b) => b.id.localeCompare(a.id))
        .map(m => ({
          id: m.id,
          name: m.id,
        }));
    } else if (provider === 'gemini') {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
      );
      if (response.ok) {
        const data = await response.json() as { models: Array<{ name: string; displayName: string; supportedGenerationMethods: string[] }> };
        models = (data.models || [])
          .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
          .filter(m => m.name.includes('gemini'))
          .sort((a, b) => b.name.localeCompare(a.name))
          .map(m => ({
            id: m.name.replace('models/', ''),
            name: m.displayName || m.name.replace('models/', ''),
          }));
      }
    }

    res.json({ models });
  } catch (err: any) {
    console.error('Failed to fetch models:', err.message);
    res.json({ models: [] });
  }
});

function formatModelName(id: string): string {
  // claude-sonnet-4-6-20250620 → Claude Sonnet 4.6
  // claude-opus-4-6-20250620 → Claude Opus 4.6
  const match = id.match(/claude-(\w+)-(\d+)-(\d+)/);
  if (match) {
    const tier = match[1].charAt(0).toUpperCase() + match[1].slice(1);
    return `Claude ${tier} ${match[2]}.${match[3]}`;
  }
  // claude-3-5-sonnet-20241022 → Claude 3.5 Sonnet
  const match2 = id.match(/claude-(\d+)-(\d+)-(\w+)/);
  if (match2) {
    const tier = match2[3].charAt(0).toUpperCase() + match2[3].slice(1);
    return `Claude ${match2[1]}.${match2[2]} ${tier}`;
  }
  return id;
}

// ─── GitHub Import ───────────────────────────────────────

router.post('/github-import', async (req: Request, res: Response) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'GitHub URL is required' });

    const result = await fetchFromGitHub(url);

    res.json({
      type: result.type,
      owner: result.owner,
      repo: result.repo,
      prNumber: result.prNumber,
      fileCount: result.files.length,
      files: result.files.map(f => ({
        filename: f.filename,
        content: f.content,
        lines: f.content.split('\n').length,
      })),
    });
  } catch (err: any) {
    console.error('GitHub import failed:', err);
    res.status(400).json({ error: err.message || 'Failed to fetch from GitHub' });
  }
});

export default router;
