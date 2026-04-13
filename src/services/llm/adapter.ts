import { LLMProvider } from './types';
import { DemoProvider } from './demoProvider';
import { OpenAIProvider } from './openaiProvider';
import { ClaudeProvider } from './claudeProvider';
import { GeminiProvider } from './geminiProvider';

export function getLLMProvider(
  providerName?: string,
  apiKey?: string,
  model?: string
): LLMProvider {
  const provider = providerName || process.env.LLM_PROVIDER || 'demo';

  switch (provider) {
    case 'openai': {
      const key = apiKey || process.env.OPENAI_API_KEY;
      if (!key) return new DemoProvider();
      return new OpenAIProvider(key, model);
    }
    case 'claude': {
      const key = apiKey || process.env.ANTHROPIC_API_KEY;
      if (!key) return new DemoProvider();
      return new ClaudeProvider(key, model);
    }
    case 'gemini': {
      const key = apiKey || process.env.GEMINI_API_KEY;
      if (!key) return new DemoProvider();
      return new GeminiProvider(key, model);
    }
    case 'demo':
    default:
      return new DemoProvider();
  }
}
