/**
 * PR Generator - Creates GitHub pull requests from refactoring results
 */

import { exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';

interface PROptions {
  branchPrefix: string;
  title: string;
  body: string;
  assignees?: string[];
  labels?: string[];
}

export class PRGenerator {
  constructor(private readonly projectRoot: string) {}

  /**
   * Create a branch, commit changes, and open a PR
   */
  async createPR(files: string[], options: PROptions): Promise<string> {
    const branchName = `${options.branchPrefix}${Date.now()}`;

    // Create branch
    await this.exec(`git checkout -b ${branchName}`);

    // Stage modified files
    for (const file of files) {
      const relative = path.relative(this.projectRoot, file);
      await this.exec(`git add ${relative}`);
    }

    // Commit
    await this.exec(`git commit -m "${options.title}"`);

    // Push
    await this.exec(`git push origin ${branchName}`);

    // Create PR using gh CLI
    const prResult = await this.exec(
      `gh pr create --title "${options.title}" --body "${this.escapeShell(options.body)}" --base main`
    );

    return prResult.trim();
  }

  /**
   * Check if working directory is clean
   */
  async isClean(): Promise<boolean> {
    const status = await this.exec('git status --porcelain');
    return status.trim().length === 0;
  }

  /**
   * Get current branch name
   */
  async getCurrentBranch(): Promise<string> {
    return (await this.exec('git rev-parse --abbrev-ref HEAD')).trim();
  }

  private async exec(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      exec(command, { cwd: this.projectRoot }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Command failed: ${command}\n${stderr}`));
        } else {
          resolve(stdout);
        }
      });
    });
  }

  private escapeShell(str: string): string {
    return str.replace(/"/g, '\\"').replace(/\n/g, '\\n');
  }
}
