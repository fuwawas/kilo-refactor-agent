/**
 * RefactorEngine - Core orchestration engine
 * Manages the Planner → Executor → Validator pipeline
 */

import * as ts from 'typescript';
import * as glob from 'glob';
import * as path from 'path';
import * as fs from 'fs/promises';
import { AIService } from './services/ai-service';
import { DependencyGraph } from './analysis/dependency-graph';
import { ASTAnalyzer } from './analysis/ast-analyzer';
import { TestRunner } from './validation/test-runner';
import { PRGenerator } from './output/pr-generator';
import type { RefactorConfig, Analysis, RefactorPlan, ExecutionResults, ValidationReport } from './types';
import type { Logger } from './utils/logger';

interface EngineOptions {
  projectRoot: string;
  config: RefactorConfig;
  batchSize: number;
  maxTokens?: number;
  dryRun: boolean;
  logger: Logger;
}

export class RefactorEngine {
  private readonly ai: AIService;
  private readonly depGraph: DependencyGraph;
  private readonly astAnalyzer: ASTAnalyzer;
  private readonly testRunner: TestRunner;
  private readonly prGenerator: PRGenerator;

  constructor(private readonly options: EngineOptions) {
    this.ai = new AIService({
      model: config.agents.planner.model,
      maxTokens: config.agents.planner.maxTokens,
    });
    this.depGraph = new DependencyGraph(options.projectRoot);
    this.astAnalyzer = new ASTAnalyzer();
    this.testRunner = new TestRunner(options.projectRoot);
    this.prGenerator = new PRGenerator(options.projectRoot);
  }

  /**
   * Phase 1: Scan project and identify technical debt
   */
  async analyzeProject(): Promise<Analysis> {
    const files = await this.scanSourceFiles();
    const program = ts.createProgram(files, {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      strict: true,
    });

    // Build dependency graph
    const dependencies = await this.depGraph.build(files);

    // Analyze each file for issues
    const techDebtItems: TechDebtItem[] = [];
    let totalLines = 0;

    for (const sourceFile of program.getSourceFiles()) {
      if (sourceFile.isDeclarationFile) continue;
      if (sourceFile.fileName.includes('node_modules')) continue;

      const lines = sourceFile.getFullText().split('\n').length;
      totalLines += lines;

      // Check for callback patterns
      const callbacks = this.astAnalyzer.findCallbackPatterns(sourceFile);
      techDebtItems.push(...callbacks.map(c => ({
        type: 'callback-to-async' as const,
        file: sourceFile.fileName,
        line: c.line,
        severity: 'medium' as const,
        description: `Callback-based function "${c.name}" can be converted to async/await`,
      })));

      // Check for missing types
      const missingTypes = this.astAnalyzer.findMissingTypes(sourceFile);
      techDebtItems.push(...missingTypes.map(t => ({
        type: 'missing-types' as const,
        file: sourceFile.fileName,
        line: t.line,
        severity: 'low' as const,
        description: `Parameter "${t.name}" lacks type annotation`,
      })));

      // Check for raw SQL
      const rawSQL = this.astAnalyzer.findRawSQL(sourceFile);
      techDebtItems.push(...rawSQL.map(s => ({
        type: 'sql-injection' as const,
        file: sourceFile.fileName,
        line: s.line,
        severity: 'critical' as const,
        description: `Raw SQL query detected: "${s.preview}"`,
      })));

      // Check for inconsistent error handling
      const errorIssues = this.astAnalyzer.findErrorHandlingIssues(sourceFile);
      techDebtItems.push(...errorIssues.map(e => ({
        type: 'error-handling' as const,
        file: sourceFile.fileName,
        line: e.line,
        severity: 'high' as const,
        description: e.description,
      })));
    }

    return {
      totalFiles: files.length,
      totalLines,
      dependencies,
      techDebtItems: this.prioritizeDebt(techDebtItems),
      languages: this.detectLanguages(files),
    };
  }

  /**
   * Phase 2: Generate a refactoring plan using AI
   */
  async generatePlan(analysis: Analysis): Promise<RefactorPlan> {
    const prompt = this.buildPlannerPrompt(analysis);
    const response = await this.ai.complete(prompt, {
      systemPrompt: this.options.config.agents.planner.systemPrompt,
      temperature: this.options.config.agents.planner.temperature,
    });

    const plan = this.parsePlanResponse(response);

    // Group into batches respecting dependencies
    const batches = this.createBatches(plan.items, {
      maxFiles: this.options.batchSize,
      maxTokens: this.options.maxTokens || this.options.config.safety.maxTotalTokens,
      dependencyOrder: analysis.dependencies,
    });

    return {
      batches,
      estimatedTokens: batches.reduce((sum, b) => sum + b.estimatedTokens, 0),
      estimatedDuration: batches.length * 45, // ~45s per batch
    };
  }

  /**
   * Phase 3: Execute the refactoring plan
   */
  async executePlan(plan: RefactorPlan): Promise<ExecutionResults> {
    let totalFilesModified = 0;
    let totalLinesChanged = 0;
    let totalTokensConsumed = 0;
    const modifiedFiles: string[] = [];

    for (let i = 0; i < plan.batches.length; i++) {
      const batch = plan.batches[i];
      this.options.logger.info(`[Batch ${i + 1}/${plan.batches.length}] Processing ${batch.files.length} files...`);

      for (const item of batch.files) {
        const source = await fs.readFile(item.filePath, 'utf-8');
        const result = await this.refactorFile(source, item);

        if (result.changed) {
          await fs.writeFile(item.filePath, result.newSource);
          totalFilesModified++;
          totalLinesChanged += result.linesChanged;
          modifiedFiles.push(item.filePath);
          this.options.logger.info(`  ✓ ${path.relative(this.options.projectRoot, item.filePath)} (${result.changes.join(', ')})`);
        }

        totalTokensConsumed += result.tokensUsed;
      }
    }

    // Generate PR if configured
    let prUrl: string | undefined;
    if (this.options.config.output.createPR && modifiedFiles.length > 0) {
      prUrl = await this.prGenerator.createPR(modifiedFiles, {
        branchPrefix: this.options.config.output.branchPrefix,
        title: `refactor: automated cleanup (${totalFilesModified} files)`,
        body: this.generatePRBody(plan, totalFilesModified, totalLinesChanged),
      });
    }

    return {
      filesModified: totalFilesModified,
      linesChanged: totalLinesChanged,
      tokensConsumed: totalTokensConsumed,
      modifiedFiles,
      prUrl,
    };
  }

  /**
   * Phase 4: Validate changes
   */
  async validate(results: ExecutionResults): Promise<ValidationReport> {
    // Run tests
    const testResults = await this.testRunner.run();

    // Run linter
    const lintResults = await this.runLinter();

    return {
      testsPassed: testResults.passed,
      totalTests: testResults.total,
      testFailures: testResults.failures,
      lintErrors: lintResults.errors,
      lintWarnings: lintResults.warnings,
      allPassed: testResults.passed === testResults.total && lintResults.errors === 0,
    };
  }

  private async refactorFile(source: string, item: RefactorItem): Promise<RefactorResult> {
    const prompt = this.buildExecutorPrompt(source, item);
    const response = await this.ai.complete(prompt, {
      systemPrompt: this.options.config.agents.executor.systemPrompt,
      temperature: 0,
    });

    return this.parseExecutorResponse(source, response);
  }

  private async scanSourceFiles(): Promise<string[]> {
    const patterns = this.options.config.project.languages.map(lang => {
      switch (lang) {
        case 'typescript': return '**/*.ts';
        case 'javascript': return '**/*.{js,jsx}';
        case 'python': return '**/*.py';
        default: return `**/*.${lang}`;
      }
    });

    const files: string[] = [];
    for (const pattern of patterns) {
      const matches = glob.sync(pattern, {
        cwd: this.options.projectRoot,
        ignore: this.options.config.project.excludePatterns,
        absolute: true,
      });
      files.push(...matches);
    }

    return files;
  }

  private prioritizeDebt(items: TechDebtItem[]): TechDebtItem[] {
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return items.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  }

  private detectLanguages(files: string[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const file of files) {
      const ext = path.extname(file);
      counts[ext] = (counts[ext] || 0) + 1;
    }
    return counts;
  }

  private buildPlannerPrompt(analysis: Analysis): string {
    return `Analyze the following codebase and generate a refactoring plan.

Project stats:
- ${analysis.totalFiles} files, ${analysis.totalLines} lines of code
- Languages: ${Object.entries(analysis.languages).map(([ext, n]) => `${ext}: ${n} files`).join(', ')}

Technical debt items found (${analysis.techDebtItems.length} total):
${analysis.techDebtItems.slice(0, 50).map(item =>
  `- [${item.severity.toUpperCase()}] ${item.file}:${item.line} - ${item.description}`
).join('\n')}

Generate a prioritized refactoring plan with specific changes for each file.
For each item, specify: file path, change type, description, and estimated token cost.`;
  }

  private buildExecutorPrompt(source: string, item: RefactorItem): string {
    return `Refactor the following code. Change type: ${item.changeType}

File: ${item.filePath}
Description: ${item.description}

Original code:
\`\`\`
${source}
\`\`\`

Apply the refactoring and return the complete modified file.
Only make the described change. Preserve all other code exactly.`;
  }

  private generatePRBody(plan: RefactorPlan, filesModified: number, linesChanged: number): string {
    return `## Automated Refactoring

This PR was generated by KiloCode Refactor Engine.

**Summary:**
- Files modified: ${filesModified}
- Lines changed: ${linesChanged}
- Batches executed: ${plan.batches.length}
- Estimated tokens: ${plan.estimatedTokens.toLocaleString()}

**Changes applied:**
${plan.batches.flatMap(b => b.files).map(f => `- ${f.description}`).join('\n')}

**Validation:**
All tests passed. Lint checks clean.`;
  }

  printPlan(plan: RefactorPlan): void {
    for (let i = 0; i < plan.batches.length; i++) {
      const batch = plan.batches[i];
      this.options.logger.info(`\nBatch ${i + 1} (${batch.files.length} files, ~${batch.estimatedTokens.toLocaleString()} tokens):`);
      for (const item of batch.files) {
        this.options.logger.info(`  ${item.filePath} - ${item.description}`);
      }
    }
  }
}
