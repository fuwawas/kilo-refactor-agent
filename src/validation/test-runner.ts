/**
 * Test Runner - Executes test suites for validation
 */

import { exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';

export interface TestResult {
  passed: number;
  total: number;
  failures: string[];
  duration: number;
  coverage?: CoverageReport;
}

export interface CoverageReport {
  statements: number;
  branches: number;
  functions: number;
  lines: number;
}

export class TestRunner {
  constructor(private readonly projectRoot: string) {}

  /**
   * Run all tests in the project
   */
  async run(): Promise<TestResult> {
    const testCommand = await this.detectTestCommand();
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      exec(testCommand, {
        cwd: this.projectRoot,
        env: { ...process.env, CI: 'true' },
        timeout: 300000, // 5 minutes
      }, (error, stdout, stderr) => {
        const duration = Date.now() - startTime;

        if (error && error.code !== 0) {
          // Parse test output even on failure
          const result = this.parseTestOutput(stdout + stderr);
          resolve({
            ...result,
            duration,
          });
        } else {
          const result = this.parseTestOutput(stdout);
          resolve({
            ...result,
            duration,
          });
        }
      });
    });
  }

  /**
   * Run tests for specific files
   */
  async runFiles(files: string[]): Promise<TestResult> {
    const testFiles = files.filter(f => f.includes('.test.') || f.includes('.spec.'));
    if (testFiles.length === 0) {
      return { passed: 0, total: 0, failures: [], duration: 0 };
    }

    const testCommand = `npx vitest run ${testFiles.join(' ')}`;
    const startTime = Date.now();

    return new Promise((resolve) => {
      exec(testCommand, {
        cwd: this.projectRoot,
        timeout: 120000,
      }, (error, stdout, stderr) => {
        const duration = Date.now() - startTime;
        const result = this.parseTestOutput(stdout + (error ? stderr : ''));
        resolve({ ...result, duration });
      });
    });
  }

  private async detectTestCommand(): Promise<string> {
    try {
      const packageJson = JSON.parse(
        await fs.readFile(path.join(this.projectRoot, 'package.json'), 'utf-8')
      );

      if (packageJson.scripts?.test) {
        return 'npm test';
      }

      // Check for common test frameworks
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
      if (deps.vitest) return 'npx vitest run';
      if (deps.jest) return 'npx jest';
      if (deps.mocha) return 'npx mocha';
    } catch {
      // Fall back to vitest
    }

    return 'npx vitest run';
  }

  private parseTestOutput(output: string): Omit<TestResult, 'duration'> {
    let passed = 0;
    let total = 0;
    const failures: string[] = [];

    // Vitest/Jest pattern: "Tests 3 passed (3)"
    const passMatch = output.match(/(\d+)\s+passed/i);
    const failMatch = output.match(/(\d+)\s+failed/i);
    const totalMatch = output.match(/(\d+)\s+total/i);

    if (passMatch) passed = parseInt(passMatch[1]);
    if (failMatch) {
      const failed = parseInt(failMatch[1]);
      total = passed + failed;
    }
    if (totalMatch) total = parseInt(totalMatch[1]);
    if (total === 0) total = passed;

    // Extract failure details
    const failLines = output.match(/(?:FAIL|✗|✕)\s+.+/g);
    if (failLines) {
      failures.push(...failLines.map(l => l.trim()));
    }

    return { passed, total, failures };
  }
}
