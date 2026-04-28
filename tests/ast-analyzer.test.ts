import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ASTAnalyzer } from '../analysis/ast-analyzer';
import * as ts from 'typescript';

describe('ASTAnalyzer', () => {
  let analyzer: ASTAnalyzer;

  beforeEach(() => {
    analyzer = new ASTAnalyzer();
  });

  describe('findCallbackPatterns', () => {
    it('should detect callback-based function calls', () => {
      const source = `
        function readData(path, callback) {
          fs.readFile(path, (err, data) => {
            callback(err, data);
          });
        }
      `;
      const sourceFile = ts.createSourceFile('test.ts', source, ts.ScriptTarget.ES2022, true);
      const patterns = analyzer.findCallbackPatterns(sourceFile);

      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0].name).toBe('readFile');
    });

    it('should detect .then() chains', () => {
      const source = `
        function fetchData() {
          return api.get('/data')
            .then(res => res.data)
            .then(data => process(data));
        }
      `;
      const sourceFile = ts.createSourceFile('test.ts', source, ts.ScriptTarget.ES2022, true);
      const patterns = analyzer.findCallbackPatterns(sourceFile);

      expect(patterns.some(p => p.name === '.then() chain')).toBe(true);
    });

    it('should not flag async/await code', () => {
      const source = `
        async function readData(path: string) {
          const data = await fs.readFile(path);
          return data;
        }
      `;
      const sourceFile = ts.createSourceFile('test.ts', source, ts.ScriptTarget.ES2022, true);
      const patterns = analyzer.findCallbackPatterns(sourceFile);

      expect(patterns.length).toBe(0);
    });
  });

  describe('findMissingTypes', () => {
    it('should detect untyped parameters', () => {
      const source = `
        function greet(name) {
          return 'Hello ' + name;
        }
      `;
      const sourceFile = ts.createSourceFile('test.ts', source, ts.ScriptTarget.ES2022, true);
      const missing = analyzer.findMissingTypes(sourceFile);

      expect(missing.length).toBe(1);
      expect(missing[0].name).toBe('name');
      expect(missing[0].kind).toBe('parameter');
    });

    it('should not flag typed parameters', () => {
      const source = `
        function greet(name: string): string {
          return 'Hello ' + name;
        }
      `;
      const sourceFile = ts.createSourceFile('test.ts', source, ts.ScriptTarget.ES2022, true);
      const missing = analyzer.findMissingTypes(sourceFile);

      expect(missing.length).toBe(0);
    });
  });

  describe('findRawSQL', () => {
    it('should detect raw SQL queries', () => {
      const source = `
        const query = "SELECT * FROM users WHERE id = " + userId;
      `;
      const sourceFile = ts.createSourceFile('test.ts', source, ts.ScriptTarget.ES2022, true);
      const matches = analyzer.findRawSQL(sourceFile);

      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].hasParameters).toBe(false);
    });

    it('should detect SQL in template literals', () => {
      const source = `
        const query = \`SELECT * FROM users WHERE id = \${userId}\`;
      `;
      const sourceFile = ts.createSourceFile('test.ts', source, ts.ScriptTarget.ES2022, true);
      const matches = analyzer.findRawSQL(sourceFile);

      expect(matches.some(m => m.hasParameters)).toBe(true);
    });
  });

  describe('findErrorHandlingIssues', () => {
    it('should detect empty catch blocks', () => {
      const source = `
        try {
          doSomething();
        } catch (e) {
          // silently ignored
        }
      `;
      const sourceFile = ts.createSourceFile('test.ts', source, ts.ScriptTarget.ES2022, true);
      const issues = analyzer.findErrorHandlingIssues(sourceFile);

      expect(issues.some(i => i.pattern === 'empty-catch')).toBe(true);
    });

    it('should detect untyped catch', () => {
      const source = `
        try {
          doSomething();
        } catch {
          console.log('error');
        }
      `;
      const sourceFile = ts.createSourceFile('test.ts', source, ts.ScriptTarget.ES2022, true);
      const issues = analyzer.findErrorHandlingIssues(sourceFile);

      expect(issues.some(i => i.pattern === 'untyped-catch')).toBe(true);
    });

    it('should not flag proper error handling', () => {
      const source = `
        try {
          doSomething();
        } catch (error) {
          logger.error('Failed:', error);
          throw error;
        }
      `;
      const sourceFile = ts.createSourceFile('test.ts', source, ts.ScriptTarget.ES2022, true);
      const issues = analyzer.findErrorHandlingIssues(sourceFile);

      expect(issues.length).toBe(0);
    });
  });
});
