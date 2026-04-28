/**
 * Dependency Graph - Analyzes import/require relationships
 * Used for ordering refactoring batches
 */

import * as ts from 'typescript';
import * as path from 'path';
import * as fs from 'fs/promises';
import type { DependencyMap } from '../types';

export class DependencyGraph {
  private graph: DependencyMap = {};

  constructor(private readonly projectRoot: string) {}

  /**
   * Build dependency graph from source files
   */
  async build(files: string[]): Promise<DependencyMap> {
    this.graph = {};

    for (const file of files) {
      const source = await fs.readFile(file, 'utf-8');
      const sourceFile = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.ES2022,
        true
      );

      const imports = this.extractImports(sourceFile, file);
      this.graph[file] = imports;
    }

    return this.graph;
  }

  /**
   * Get files in dependency order (topological sort)
   */
  getOrderedFiles(): string[] {
    const visited = new Set<string>();
    const order: string[] = [];

    const visit = (file: string) => {
      if (visited.has(file)) return;
      visited.add(file);

      const deps = this.graph[file] || [];
      for (const dep of deps) {
        visit(dep);
      }

      order.push(file);
    };

    for (const file of Object.keys(this.graph)) {
      visit(file);
    }

    return order;
  }

  /**
   * Check for circular dependencies
   */
  findCircularDependencies(): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const inStack = new Set<string>();

    const dfs = (file: string, path: string[]) => {
      if (inStack.has(file)) {
        const cycleStart = path.indexOf(file);
        if (cycleStart >= 0) {
          cycles.push(path.slice(cycleStart).concat(file));
        }
        return;
      }

      if (visited.has(file)) return;

      visited.add(file);
      inStack.add(file);
      path.push(file);

      for (const dep of this.graph[file] || []) {
        dfs(dep, path);
      }

      path.pop();
      inStack.delete(file);
    };

    for (const file of Object.keys(this.graph)) {
      dfs(file, []);
    }

    return cycles;
  }

  /**
   * Get direct dependencies of a file
   */
  getDependencies(file: string): string[] {
    return this.graph[file] || [];
  }

  /**
   * Get files that depend on the given file
   */
  getDependents(file: string): string[] {
    return Object.entries(this.graph)
      .filter(([_, deps]) => deps.includes(file))
      .map(([f]) => f);
  }

  private extractImports(sourceFile: ts.SourceFile, currentFile: string): string[] {
    const imports: string[] = [];

    const visit = (node: ts.Node) => {
      // ES6 imports
      if (ts.isImportDeclaration(node) && node.moduleSpecifier) {
        const modulePath = this.resolveModulePath(
          node.moduleSpecifier.getText(sourceFile).replace(/['"]/g, ''),
          currentFile
        );
        if (modulePath) imports.push(modulePath);
      }

      // require() calls
      if (ts.isCallExpression(node) && node.expression.getText(sourceFile) === 'require') {
        if (node.arguments.length > 0 && ts.isStringLiteral(node.arguments[0])) {
          const modulePath = this.resolveModulePath(
            node.arguments[0].text,
            currentFile
          );
          if (modulePath) imports.push(modulePath);
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return imports;
  }

  private resolveModulePath(moduleSpecifier: string, fromFile: string): string | null {
    // Skip node_modules
    if (!moduleSpecifier.startsWith('.') && !moduleSpecifier.startsWith('/')) {
      return null;
    }

    const dir = path.dirname(fromFile);
    const resolved = path.resolve(dir, moduleSpecifier);

    // Try common extensions
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.js'];
    for (const ext of extensions) {
      const candidate = resolved + ext;
      if (this.isFileInProject(candidate)) {
        return candidate;
      }
    }

    return resolved;
  }

  private isFileInProject(filePath: string): boolean {
    return filePath.startsWith(this.projectRoot) && !filePath.includes('node_modules');
  }
}
