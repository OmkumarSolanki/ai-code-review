export const typeDefs = `#graphql
  enum ReviewStatus {
    PENDING
    ANALYZING
    COMPLETED
    FAILED
  }

  enum ReviewProfile {
    security
    performance
    quality
    full
  }

  enum InputMode {
    full
    diff
  }

  enum Severity {
    critical
    warning
    info
  }

  enum FindingSource {
    pattern
    eslint
    llm
    merged
  }

  enum FixStatus {
    verified
    unverified
    unavailable
  }

  enum FeedbackType {
    helpful
    unhelpful
  }

  enum SubscriptionEventType {
    BATCH_STARTED
    BATCH_COMPLETED
    REVIEW_COMPLETED
    REVIEW_FAILED
  }

  type User {
    id: ID!
    email: String!
    llmProvider: String!
    reviews: [Review!]!
  }

  type AuthPayload {
    token: String!
    user: User!
  }

  type Review {
    id: ID!
    status: ReviewStatus!
    reviewProfile: ReviewProfile!
    inputMode: InputMode!
    projectScore: Int
    totalFiles: Int!
    analyzedFiles: Int!
    totalTimeMs: Int
    errorMessage: String
    files: [File!]!
    telemetry: Telemetry
    createdAt: String!
  }

  type File {
    id: ID!
    filename: String!
    language: String!
    healthScore: Int
    linesOfCode: Int!
    complexity: Int
    findings: [Finding!]!
  }

  type Finding {
    id: ID!
    source: FindingSource!
    category: String!
    severity: Severity!
    message: String!
    lineStart: Int!
    lineEnd: Int!
    ruleId: String
    codeSnippet: String
    suggestedFix: String
    fixStatus: FixStatus
    confidence: Float
    feedback: FeedbackType
  }

  type Telemetry {
    eslintMs: Int!
    astParsingMs: Int!
    batchingMs: Int!
    llmBatches: [LlmBatchTelemetry!]!
    aggregationMs: Int!
    totalMs: Int!
  }

  type LlmBatchTelemetry {
    batchIndex: Int!
    fileCount: Int!
    durationMs: Int!
    tokenEstimate: Int!
  }

  type ReviewEvent {
    type: SubscriptionEventType!
    reviewId: ID!
    sequenceNumber: Int!
    batchIndex: Int
    batchTotal: Int
    newFindings: [Finding!]
    completedFiles: [File!]
    projectScore: Int
    errorMessage: String
    telemetry: Telemetry
  }

  type PrecisionRecall {
    precision: Float!
    recall: Float!
    truePositives: Int!
    falsePositives: Int!
    falseNegatives: Int!
    totalPlantedBugs: Int!
    totalFindingsGenerated: Int!
  }

  input FileInput {
    filename: String!
    content: String!
  }

  input CreateReviewInput {
    files: [FileInput!]!
    reviewProfile: ReviewProfile = full
    inputMode: InputMode = full
  }

  input UpdateSettingsInput {
    llmProvider: String
    apiKey: String
  }

  type Query {
    me: User
    review(id: ID!): Review
    reviews(limit: Int = 10, offset: Int = 0): [Review!]!
    seedPrecisionRecall: PrecisionRecall
  }

  type Mutation {
    register(email: String!, password: String!): AuthPayload!
    login(email: String!, password: String!): AuthPayload!
    createReview(input: CreateReviewInput!): Review!
    applyFix(findingId: ID!): Finding!
    submitFeedback(findingId: ID!, feedback: FeedbackType!): Finding!
    updateSettings(input: UpdateSettingsInput!): User!
  }

  type Subscription {
    reviewProgress(reviewId: ID!): ReviewEvent!
  }
`;
