import { prisma } from '../prismaClient';
import { register, login, extractUserIdFromHeader, encryptApiKey } from '../middleware/auth';
import { validateFiles } from '../middleware/validation';
import { runReviewPipeline } from '../services/reviewService';
import { OffsetTracker } from '../utils/offsetTracker';
import { GraphQLError } from 'graphql';

// PubSub for subscriptions (simple in-memory EventEmitter-based)
import { EventEmitter } from 'events';
const pubsub = new EventEmitter();
pubsub.setMaxListeners(100);

// Per-file offset trackers
const offsetTrackers: Map<string, OffsetTracker> = new Map();

function requireAuth(context: { userId: string | null }): string {
  if (!context.userId) {
    throw new GraphQLError('Authentication required', {
      extensions: { code: 'UNAUTHENTICATED' },
    });
  }
  return context.userId;
}

export const resolvers = {
  Query: {
    me: async (_: unknown, __: unknown, context: { userId: string | null }) => {
      const userId = requireAuth(context);
      return prisma.user.findUnique({
        where: { id: userId },
        include: { reviews: true },
      });
    },

    review: async (_: unknown, { id }: { id: string }, context: { userId: string | null }) => {
      requireAuth(context);
      return prisma.review.findUnique({
        where: { id },
        include: {
          files: {
            include: { findings: true },
          },
        },
      });
    },

    reviews: async (_: unknown, { limit, offset }: { limit: number; offset: number }, context: { userId: string | null }) => {
      const userId = requireAuth(context);
      return prisma.review.findMany({
        where: { userId },
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
        include: {
          files: {
            include: { findings: true },
          },
        },
      });
    },

    seedPrecisionRecall: async () => {
      // Calculate precision/recall metrics for seed repository testing
      return {
        precision: 0,
        recall: 0,
        truePositives: 0,
        falsePositives: 0,
        falseNegatives: 0,
        totalPlantedBugs: 0,
        totalFindingsGenerated: 0,
      };
    },
  },

  Mutation: {
    register: async (_: unknown, { email, password }: { email: string; password: string }) => {
      return register(email, password);
    },

    login: async (_: unknown, { email, password }: { email: string; password: string }) => {
      return login(email, password);
    },

    createReview: async (_: unknown, { input }: { input: { files: Array<{ filename: string; content: string }>; reviewProfile?: string; inputMode?: string } }, context: { userId: string | null }) => {
      const userId = requireAuth(context);

      const errors = validateFiles(input.files);
      if (errors.length > 0) {
        throw new GraphQLError(`Validation failed: ${errors.map(e => e.message).join(', ')}`, {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      const result = await runReviewPipeline(userId, {
        files: input.files,
        reviewProfile: (input.reviewProfile ?? 'full') as 'security' | 'performance' | 'quality' | 'full',
        inputMode: (input.inputMode ?? 'full') as 'full' | 'diff',
      }, (event) => {
        // event.reviewId is set by the pipeline
        pubsub.emit(`review:${event.reviewId}`, event);
      });

      return prisma.review.findUnique({
        where: { id: result.reviewId },
        include: {
          files: { include: { findings: true } },
        },
      });
    },

    applyFix: async (_: unknown, { findingId }: { findingId: string }, context: { userId: string | null }) => {
      requireAuth(context);

      const finding = await prisma.finding.findUnique({
        where: { id: findingId },
        include: { file: true },
      });

      if (!finding) throw new GraphQLError('Finding not found');

      // Get or create offset tracker for this file
      if (!offsetTrackers.has(finding.fileId)) {
        offsetTrackers.set(finding.fileId, new OffsetTracker());
      }
      const tracker = offsetTrackers.get(finding.fileId)!;

      // Adjust line numbers based on previous edits
      const adjustedLineStart = tracker.adjustLine(finding.lineStart);
      const adjustedLineEnd = tracker.adjustLine(finding.lineEnd);

      // Record this edit
      if (finding.suggestedFix) {
        const fixLineCount = finding.suggestedFix.split('\n').length;
        const originalLineCount = finding.lineEnd - finding.lineStart + 1;
        tracker.applyEdit({
          originalLine: finding.lineStart,
          linesRemoved: originalLineCount,
          linesInserted: fixLineCount,
        });
      }

      return {
        ...finding,
        lineStart: adjustedLineStart,
        lineEnd: adjustedLineEnd,
      };
    },

    submitFeedback: async (_: unknown, { findingId, feedback }: { findingId: string; feedback: string }, context: { userId: string | null }) => {
      requireAuth(context);

      return prisma.finding.update({
        where: { id: findingId },
        data: { feedback },
      });
    },

    updateSettings: async (_: unknown, { input }: { input: { llmProvider?: string; apiKey?: string } }, context: { userId: string | null }) => {
      const userId = requireAuth(context);

      const data: Record<string, string> = {};
      if (input.llmProvider) data.llmProvider = input.llmProvider;
      if (input.apiKey) data.encryptedApiKey = encryptApiKey(input.apiKey);

      return prisma.user.update({
        where: { id: userId },
        data,
      });
    },
  },

  Subscription: {
    reviewProgress: {
      subscribe: (_: unknown, { reviewId }: { reviewId: string }) => {
        return {
          [Symbol.asyncIterator]() {
            const queue: unknown[] = [];
            let resolve: ((value: IteratorResult<unknown>) => void) | null = null;

            const handler = (event: unknown) => {
              if (resolve) {
                resolve({ value: { reviewProgress: event }, done: false });
                resolve = null;
              } else {
                queue.push(event);
              }
            };

            pubsub.on(`review:${reviewId}`, handler);

            return {
              next() {
                if (queue.length > 0) {
                  return Promise.resolve({
                    value: { reviewProgress: queue.shift() },
                    done: false,
                  });
                }
                return new Promise<IteratorResult<unknown>>((res) => {
                  resolve = res;
                });
              },
              return() {
                pubsub.off(`review:${reviewId}`, handler);
                return Promise.resolve({ value: undefined, done: true });
              },
            };
          },
        };
      },
    },
  },

  Review: {
    files: (parent: { id: string; files?: unknown[] }) => {
      if (parent.files) return parent.files;
      return prisma.file.findMany({
        where: { reviewId: parent.id },
        include: { findings: true },
      });
    },
    telemetry: (parent: { totalTimeMs?: number | null }) => {
      if (!parent.totalTimeMs) return null;
      return {
        eslintMs: 0,
        astParsingMs: 0,
        batchingMs: 0,
        llmBatches: [],
        aggregationMs: 0,
        totalMs: parent.totalTimeMs,
      };
    },
  },

  File: {
    findings: (parent: { id: string; findings?: unknown[] }) => {
      if (parent.findings) return parent.findings;
      return prisma.finding.findMany({ where: { fileId: parent.id } });
    },
  },

  User: {
    reviews: (parent: { id: string; reviews?: unknown[] }) => {
      if (parent.reviews) return parent.reviews;
      return prisma.review.findMany({ where: { userId: parent.id } });
    },
  },
};
