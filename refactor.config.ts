import { defineConfig } from 'kilo-refactor';

export default defineConfig({
  // Target project settings
  project: {
    root: './src',
    languages: ['typescript', 'javascript', 'python'],
    excludePatterns: [
      'node_modules/**',
      'dist/**',
      '*.test.ts',
      '*.spec.ts',
      '__pycache__/**',
    ],
  },

  // Agent configuration
  agents: {
    planner: {
      model: 'claude-sonnet-4-20250514',
      maxTokens: 128000,
      temperature: 0.1,
      systemPrompt: 'You are a code architecture analyzer. Generate refactoring plans based on AST analysis and dependency graphs.',
    },
    executor: {
      model: 'claude-sonnet-4-20250514',
      maxTokens: 128000,
      temperature: 0.0,
      systemPrompt: 'You are a code transformation engine. Apply refactoring changes precisely, maintaining all existing functionality.',
    },
    validator: {
      model: 'claude-haiku-4-20250514',
      maxTokens: 64000,
      temperature: 0.0,
      autoRunTests: true,
      lintCheck: true,
    },
  },

  // Refactoring rules
  rules: [
    // Async/Await conversion
    {
      id: 'async-await-convert',
      name: 'Convert callbacks to async/await',
      pattern: 'callback-based-functions',
      priority: 'high',
    },
    // Type safety
    {
      id: 'add-missing-types',
      name: 'Add missing TypeScript types',
      pattern: 'missing-type-annotations',
      priority: 'medium',
    },
    // Error handling
    {
      id: 'unified-error-handling',
      name: 'Unify error handling patterns',
      pattern: 'inconsistent-error-handling',
      priority: 'high',
    },
    // SQL injection prevention
    {
      id: 'parameterized-queries',
      name: 'Convert raw SQL to parameterized queries',
      pattern: 'raw-sql-queries',
      priority: 'critical',
    },
    // Code extraction
    {
      id: 'extract-shared-logic',
      name: 'Extract shared validation logic',
      pattern: 'duplicated-validation',
      priority: 'medium',
    },
  ],

  // Batch processing
  batching: {
    maxFilesPerBatch: 15,
    maxTokensPerBatch: 2_000_000,
    prioritizeBy: ['priority', 'dependency-order'],
  },

  // Output settings
  output: {
    createPR: true,
    branchPrefix: 'refactor/',
    commitMessage: 'refactor: {description} (automated by KiloCode)',
    assignReviewers: ['tech-lead', 'senior-dev'],
    milestone: 'Q2 Tech Debt Cleanup',
  },

  // Safety limits
  safety: {
    maxTotalTokens: 25_000_000,
    dryRun: false,
    requireApproval: false,
    rollbackOnTestFailure: true,
  },
});
