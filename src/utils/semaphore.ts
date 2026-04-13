import pLimit from 'p-limit';

const concurrencyLimit = parseInt(process.env.LLM_CONCURRENCY_LIMIT || '5', 10);

export const llmSemaphore = pLimit(concurrencyLimit);
