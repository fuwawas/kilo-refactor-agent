/**
 * AST Analyzer - Static analysis for code patterns
 * Identifies callbacks, missing types, raw SQL, error handling issues
 */

import * as ts from 'typescript';

export interface CallbackPattern {
  name: string;
  line: number;
  column: number;
  parentFunction: string;
}

export interface MissingType {
  name: string;
  line: number;
  kind: 'parameter' | 'return' | 'variable';
}

export interface RawSQLMatch {
  preview: string;
  line: number;
  hasParameters: boolean;
}

export interface ErrorHandlingIssue {
  line: number;
  description: string;
  pattern: 'empty-catch' | 'untyped-catch' | 'swallowed-error' | 'missing-catch';
}

export class ASTAnalyzer {
  /**
   * Find callback-based function patterns that should be async/await
   */
  findCallbackPatterns(sourceFile: ts.SourceFile): CallbackPattern[] {
    const patterns: CallbackPattern[] = [];

    const visit = (node: ts.Node) => {
      // Look for function calls with callback as last argument
      if (ts.isCallExpression(node)) {
        const args = node.arguments;
        if (args.length > 0) {
          const lastArg = args[args.length - 1];
          if (this.isCallbackFunction(lastArg)) {
            const funcName = this.getCallExpressionName(node);
            patterns.push({
              name: funcName,
              line: sourceFile.getLineAndCharacterOfPosition(lastArg.getStart()).line + 1,
              column: sourceFile.getLineAndCharacterOfPosition(lastArg.getStart()).character + 1,
              parentFunction: this.findParentFunctionName(node),
            });
          }
        }
      }

      // Look for .then()/.catch() chains
      if (ts.isPropertyAccessExpression(node) && node.name.text === 'then') {
        const parent = node.parent;
        if (ts.isCallExpression(parent)) {
          patterns.push({
            name: '.then() chain',
            line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
            column: sourceFile.getLineAndCharacterOfPosition(node.getStart()).character + 1,
            parentFunction: this.findParentFunctionName(node),
          });
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return patterns;
  }

  /**
   * Find parameters and variables missing type annotations
   */
  findMissingTypes(sourceFile: ts.SourceFile): MissingType[] {
    const missing: MissingType[] = [];

    const visit = (node: ts.Node) => {
      // Check function parameters
      if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isArrowFunction(node)) {
        for (const param of node.parameters) {
          if (!param.type && !param.questionToken) {
            missing.push({
              name: param.name.getText(sourceFile),
              line: sourceFile.getLineAndCharacterOfPosition(param.getStart()).line + 1,
              kind: 'parameter',
            });
          }
        }
      }

      // Check variable declarations
      if (ts.isVariableDeclaration(node)) {
        if (!node.type && !node.initializer) {
          missing.push({
            name: node.name.getText(sourceFile),
            line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
            kind: 'variable',
          });
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return missing;
  }

  /**
   * Find raw SQL queries that should use parameterized statements
   */
  findRawSQL(sourceFile: ts.SourceFile): RawSQLMatch[] {
    const matches: RawSQLMatch[] = [];
    const sourceText = sourceFile.getFullText();

    // Regex patterns for SQL strings
    const sqlPatterns = [
      /(?:SELECT|INSERT|UPDATE|DELETE|FROM|WHERE)\s+.+(?:FROM|INTO|SET|WHERE)\s+/gi,
      /`(?:SELECT|INSERT|UPDATE|DELETE)[^`]+`/gi,
      /"(?:SELECT|INSERT|UPDATE|DELETE)[^"]+"/gi,
      /'(?:SELECT|INSERT|UPDATE|DELETE)[^']+'/gi,
    ];

    const lines = sourceText.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of sqlPatterns) {
        pattern.lastIndex = 0;
        const match = pattern.exec(line);
        if (match) {
          // Check if it uses string interpolation (unsafe)
          const hasParameters = line.includes('${') || line.includes("' +") || line.includes("' +");
          matches.push({
            preview: match[0].substring(0, 80),
            line: i + 1,
            hasParameters,
          });
        }
      }
    }

    return matches;
  }

  /**
   * Find error handling anti-patterns
   */
  findErrorHandlingIssues(sourceFile: ts.SourceFile): ErrorHandlingIssue[] {
    const issues: ErrorHandlingIssue[] = [];

    const visit = (node: ts.Node) => {
      // Empty catch blocks
      if (ts.isCatchClause(node)) {
        if (!node.variableDeclaration) {
          issues.push({
            line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
            description: 'Catch clause without error variable',
            pattern: 'untyped-catch',
          });
        } else if (node.block.statements.length === 0) {
          issues.push({
            line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
            description: 'Empty catch block - errors are silently swallowed',
            pattern: 'empty-catch',
          });
        } else {
          // Check if error is re-thrown or logged
          const catchBody = node.block.getText(sourceFile);
          if (!catchBody.includes('throw') && !catchBody.includes('log') && !catchBody.includes('console')) {
            issues.push({
              line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
              description: 'Error caught but not logged or re-thrown',
              pattern: 'swallowed-error',
            });
          }
        }
      }

      // Promise without .catch()
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        if (node.expression.name.text === 'then') {
          const hasCatch = node.parent &&
            ts.isPropertyAccessExpression(node.parent) &&
            node.parent.name.text === 'catch';
          if (!hasCatch) {
            issues.push({
              line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
              description: 'Promise .then() without .catch() handler',
              pattern: 'missing-catch',
            });
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return issues;
  }

  private isCallbackFunction(node: ts.Node): boolean {
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      const func = node as ts.ArrowFunction | ts.FunctionExpression;
      return func.parameters.length >= 1;
    }
    return false;
  }

  private getCallExpressionName(node: ts.CallExpression): string {
    if (ts.isPropertyAccessExpression(node.expression)) {
      return node.expression.name.text;
    }
    if (ts.isIdentifier(node.expression)) {
      return node.expression.text;
    }
    return 'unknown';
  }

  private findParentFunctionName(node: ts.Node): string {
    let current = node.parent;
    while (current) {
      if (ts.isFunctionDeclaration(current) && current.name) {
        return current.name.text;
      }
      if (ts.isMethodDeclaration(current) && current.name) {
        return current.name.getText();
      }
      current = current.parent;
    }
    return '<module>';
  }
}
