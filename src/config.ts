/**
 * Config loader - Loads and validates refactor.config.ts
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import * as ts from 'typescript';
import type { RefactorConfig } from './types';

const DEFAULT_CONFIG: RefactorConfig = {
  project: {
    root: './src',
    languages: ['typescript', 'javascript'],
    excludePatterns: ['node_modules/**', 'dist/**', '*.test.ts', '*.spec.ts'],
  },
  agents: {
    planner: {
      model: 'claude-sonnet-4-20250514',
      maxTokens: 128000,
      temperature: 0.1,
      systemPrompt: 'You are a code architecture analyzer. Generate refactoring plans.',
    },
    executor: {
      model: 'claude-sonnet-4-20250514',
      maxTokens: 128000,
      temperature: 0,
      systemPrompt: 'You are a code transformation engine. Apply refactoring changes precisely.',
    },
    validator: {
      model: 'claude-haiku-4-20250514',
      maxTokens: 64000,
      temperature: 0,
      systemPrompt: 'You are a code validator. Check for correctness.',
      autoRunTests: true,
      lintCheck: true,
    },
  },
  rules: [],
  batching: {
    maxFilesPerBatch: 15,
    maxTokensPerBatch: 2_000_000,
    prioritizeBy: ['priority', 'dependency-order'],
  },
  output: {
    createPR: true,
    branchPrefix: 'refactor/',
    commitMessage: 'refactor: {description} (automated by KiloCode)',
    assignReviewers: [],
    milestone: '',
  },
  safety: {
    maxTotalTokens: 25_000_000,
    dryRun: false,
    requireApproval: false,
    rollbackOnTestFailure: true,
  },
};

/**
 * Load config from file, merging with defaults
 */
export async function loadConfig(configPath: string): Promise<RefactorConfig> {
  const fullPath = path.resolve(configPath);

  try {
    await fs.access(fullPath);
  } catch {
    console.warn(`Config file not found at ${fullPath}, using defaults`);
    return DEFAULT_CONFIG;
  }

  const source = await fs.readFile(fullPath, 'utf-8');

  // Transpile TypeScript config to JavaScript
  const jsSource = ts.transpile(source, {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
  });

  // Evaluate the config
  const module = { exports: {} as any };
  const require = (id: string) => {
    if (id === 'kilo-refactor') {
      return { defineConfig: (config: any) => config };
    }
    return eval(`require('${id}')`);
  };

  const fn = new Function('module', 'exports', 'require', jsSource);
  fn(module, module.exports, require);

  const userConfig = module.exports.default || module.exports;

  // Deep merge with defaults
  return deepMerge(DEFAULT_CONFIG, userConfig) as RefactorConfig;
}

function deepMerge(target: any, source: any): any {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }

  return result;
}
