import { z } from 'zod/v4';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  ENCRYPTION_KEY: z.string().min(32, 'ENCRYPTION_KEY must be at least 32 characters'),
  LLM_PROVIDER: z.enum(['openai', 'claude', 'gemini', 'demo']).default('demo'),
  OPENAI_API_KEY: z.string().optional().default(''),
  ANTHROPIC_API_KEY: z.string().optional().default(''),
  GEMINI_API_KEY: z.string().optional().default(''),
  MAX_FILE_SIZE_MB: z.coerce.number().positive().default(10),
  MAX_TOTAL_SIZE_MB: z.coerce.number().positive().default(50),
  MAX_FILES_PER_REVIEW: z.coerce.number().positive().default(100),
  LLM_CONCURRENCY_LIMIT: z.coerce.number().positive().default(5),
  LLM_BATCH_TOKEN_BUDGET: z.coerce.number().positive().default(12000),
  LLM_MAX_RETRIES: z.coerce.number().nonnegative().default(3),
  PORT: z.coerce.number().positive().default(4000),
});

function loadConfig() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const errors = result.error.issues.map(
      (issue) => `  ${issue.path.join('.')}: ${issue.message}`
    );
    console.error('❌ Invalid environment variables:\n' + errors.join('\n'));
    process.exit(1);
  }
  return result.data;
}

export const config = loadConfig();
export type Config = z.infer<typeof envSchema>;
