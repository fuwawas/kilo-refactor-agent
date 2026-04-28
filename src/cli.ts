#!/usr/bin/env node
/**
 * kilo-refactor CLI entry point
 * Usage: npx kilo-refactor --project ./src --config refactor.config.ts
 */

import { Command } from 'commander';
import { RefactorEngine } from './engine';
import { loadConfig } from './config';
import { Logger } from './utils/logger';

const program = new Command();

program
  .name('kilo-refactor')
  .description('Automated codebase refactoring powered by KiloCode + Claude')
  .version('1.2.0')
  .requiredOption('-p, --project <path>', 'Path to the project root')
  .option('-c, --config <path>', 'Config file path', 'refactor.config.ts')
  .option('-t, --task <description>', 'Specific refactoring task to run')
  .option('--batch-size <n>', 'Max files per batch', '15')
  .option('--max-tokens <n>', 'Token budget for this run')
  .option('--dry-run', 'Preview changes without applying', false)
  .option('--verbose', 'Enable verbose logging', false)
  .parse(process.argv);

async function main() {
  const opts = program.opts();
  const logger = new Logger({ verbose: opts.verbose });

  logger.info(`Initializing KiloCode Refactor Engine v1.2.0`);
  logger.info(`Project: ${opts.project}`);
  logger.info(`Config: ${opts.config}`);

  try {
    const config = await loadConfig(opts.config);
    const engine = new RefactorEngine({
      projectRoot: opts.project,
      config,
      batchSize: parseInt(opts.batchSize),
      maxTokens: opts.maxTokens ? parseInt(opts.maxTokens) : undefined,
      dryRun: opts.dryRun,
      logger,
    });

    // Phase 1: Scan & analyze
    logger.info('Phase 1: Scanning project structure...');
    const analysis = await engine.analyzeProject();
    logger.info(`Found ${analysis.totalFiles} files, ${analysis.totalLines} lines of code`);
    logger.info(`Detected ${analysis.techDebtItems.length} technical debt items`);

    // Phase 2: Generate refactoring plan
    logger.info('Phase 2: Generating refactoring plan...');
    const plan = await engine.generatePlan(analysis);
    logger.info(`Plan: ${plan.batches.length} batches, estimated ${plan.estimatedTokens.toLocaleString()} tokens`);

    if (opts.dryRun) {
      logger.info('Dry run mode - printing plan without executing');
      engine.printPlan(plan);
      return;
    }

    // Phase 3: Execute refactoring
    logger.info('Phase 3: Executing refactoring...');
    const results = await engine.executePlan(plan);

    // Phase 4: Validate
    logger.info('Phase 4: Running validation...');
    const validation = await engine.validate(results);

    // Summary
    logger.info('='.repeat(50));
    logger.info('Refactoring complete!');
    logger.info(`Files modified: ${results.filesModified}`);
    logger.info(`Lines changed: ${results.linesChanged}`);
    logger.info(`Tests passed: ${validation.testsPassed}/${validation.totalTests}`);
    logger.info(`Tokens consumed: ${results.tokensConsumed.toLocaleString()}`);

    if (results.prUrl) {
      logger.info(`PR created: ${results.prUrl}`);
    }
  } catch (error) {
    logger.error(`Fatal error: ${(error as Error).message}`);
    if (opts.verbose) {
      logger.error((error as Error).stack || '');
    }
    process.exit(1);
  }
}

main();
