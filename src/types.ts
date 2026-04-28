/**
 * Type definitions for kilo-refactor
 */

export interface RefactorConfig {
  project: {
    root: string;
    languages: string[];
    excludePatterns: string[];
  };
  agents: {
    planner: AgentConfig;
    executor: AgentConfig;
    validator: AgentConfig;
  };
  rules: RefactorRule[];
  batching: {
    maxFilesPerBatch: number;
    maxTokensPerBatch: number;
    prioritizeBy: string[];
  };
  output: {
    createPR: boolean;
    branchPrefix: string;
    commitMessage: string;
    assignReviewers: string[];
    milestone: string;
  };
  safety: {
    maxTotalTokens: number;
    dryRun: boolean;
    requireApproval: boolean;
    rollbackOnTestFailure: boolean;
  };
}

export interface AgentConfig {
  model: string;
  maxTokens: number;
  temperature: number;
  systemPrompt: string;
  autoRunTests?: boolean;
  lintCheck?: boolean;
}

export interface RefactorRule {
  id: string;
  name: string;
  pattern: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface Analysis {
  totalFiles: number;
  totalLines: number;
  dependencies: DependencyMap;
  techDebtItems: TechDebtItem[];
  languages: Record<string, number>;
}

export interface TechDebtItem {
  type: 'callback-to-async' | 'missing-types' | 'sql-injection' | 'error-handling' | 'duplicated-code';
  file: string;
  line: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
}

export type DependencyMap = Record<string, string[]>;

export interface RefactorPlan {
  batches: Batch[];
  estimatedTokens: number;
  estimatedDuration: number;
}

export interface Batch {
  files: RefactorItem[];
  estimatedTokens: number;
  priority: number;
}

export interface RefactorItem {
  filePath: string;
  changeType: string;
  description: string;
  estimatedTokens: number;
}

export interface ExecutionResults {
  filesModified: number;
  linesChanged: number;
  tokensConsumed: number;
  modifiedFiles: string[];
  prUrl?: string;
}

export interface ValidationReport {
  testsPassed: number;
  totalTests: number;
  testFailures: string[];
  lintErrors: number;
  lintWarnings: number;
  allPassed: boolean;
}

export interface CompletionOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

export interface RefactorResult {
  changed: boolean;
  newSource: string;
  linesChanged: number;
  changes: string[];
  tokensUsed: number;
}
