process.env.DATABASE_URL = 'file:./dev.db';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';
process.env.LLM_PROVIDER = 'demo';

import { ApolloServer } from '@apollo/server';
import { PrismaClient } from '@prisma/client';
import { typeDefs } from '../../src/schema/typeDefs';
import { resolvers } from '../../src/schema/resolvers';

const prisma = new PrismaClient();

interface AppContext {
  userId: string | null;
}

let server: ApolloServer<AppContext>;

beforeAll(async () => {
  server = new ApolloServer<AppContext>({ typeDefs, resolvers });
  await server.start();

  try { await prisma.finding.deleteMany(); } catch {}
  try { await prisma.file.deleteMany(); } catch {}
  try { await prisma.review.deleteMany(); } catch {}
  try { await prisma.user.deleteMany(); } catch {}
});

afterAll(async () => {
  await server.stop();
  await prisma.$disconnect();
});

async function executeOperation(query: string, variables: Record<string, unknown> = {}, token?: string) {
  const jwt = require('jsonwebtoken');
  let userId: string | null = null;
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET) as { userId: string };
      userId = decoded.userId;
    } catch { /* invalid token */ }
  }

  const result = await server.executeOperation(
    { query, variables },
    { contextValue: { userId } }
  );

  // Extract data from the response
  const body = result.body;
  if (body.kind === 'single') {
    return {
      data: body.singleResult.data as Record<string, unknown> | null,
      errors: body.singleResult.errors as Array<{ message: string; extensions?: Record<string, unknown> }> | undefined,
    };
  }
  return { data: null, errors: [{ message: 'Unexpected response kind' }] };
}

describe('GraphQL Integration', () => {
  let authToken: string;

  it('register mutation creates user and returns JWT', async () => {
    const { data, errors } = await executeOperation(`
      mutation {
        register(email: "gql@test.com", password: "password123") {
          token
          user { id email }
        }
      }
    `);

    expect(errors).toBeUndefined();
    const reg = data?.register as Record<string, unknown>;
    expect(reg.token).toBeDefined();
    const user = reg.user as Record<string, string>;
    expect(user.email).toBe('gql@test.com');
    authToken = reg.token as string;
  });

  it('login mutation with correct password returns JWT', async () => {
    const { data, errors } = await executeOperation(`
      mutation {
        login(email: "gql@test.com", password: "password123") {
          token
          user { email }
        }
      }
    `);

    expect(errors).toBeUndefined();
    const login = data?.login as Record<string, unknown>;
    expect(login.token).toBeDefined();
  });

  it('login mutation with wrong password returns error', async () => {
    const { errors } = await executeOperation(`
      mutation {
        login(email: "gql@test.com", password: "wrongpassword") {
          token
        }
      }
    `);

    expect(errors).toBeDefined();
    expect(errors![0].message).toContain('Invalid');
  });

  it('createReview mutation without auth returns UNAUTHENTICATED', async () => {
    const { errors } = await executeOperation(`
      mutation {
        createReview(input: { files: [{ filename: "test.ts", content: "const x = 1;" }] }) {
          id
        }
      }
    `);

    expect(errors).toBeDefined();
    expect(errors![0].extensions?.code).toBe('UNAUTHENTICATED');
  });

  it('createReview mutation with valid auth creates review', async () => {
    const { data, errors } = await executeOperation(
      `mutation($input: CreateReviewInput!) {
        createReview(input: $input) {
          id status
          files { filename language findings { id source severity message } }
        }
      }`,
      { input: { files: [{ filename: 'test.ts', content: 'const password = "my_secret_pass123";\n' }] } },
      authToken
    );

    expect(errors).toBeUndefined();
    const review = data?.createReview as Record<string, unknown>;
    expect(review.status).toBe('COMPLETED');
  });

  it('reviews query returns user reviews', async () => {
    const { data, errors } = await executeOperation(
      `query { reviews { id status } }`,
      {},
      authToken
    );

    expect(errors).toBeUndefined();
    const reviews = data?.reviews as Array<Record<string, unknown>>;
    expect(reviews.length).toBeGreaterThan(0);
  });

  it('submitFeedback mutation updates finding', async () => {
    const { data: reviewsData } = await executeOperation(
      `query { reviews { files { findings { id } } } }`,
      {},
      authToken
    );

    const reviews = reviewsData?.reviews as Array<{ files: Array<{ findings: Array<{ id: string }> }> }>;
    const findingId = reviews?.[0]?.files?.[0]?.findings?.[0]?.id;

    if (findingId) {
      const { data, errors } = await executeOperation(
        `mutation($findingId: ID!, $feedback: FeedbackType!) {
          submitFeedback(findingId: $findingId, feedback: $feedback) {
            id feedback
          }
        }`,
        { findingId, feedback: 'helpful' },
        authToken
      );

      expect(errors).toBeUndefined();
      const finding = data?.submitFeedback as Record<string, unknown>;
      expect(finding.feedback).toBe('helpful');
    }
  });
});
