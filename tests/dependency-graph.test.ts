import { describe, it, expect, vi } from 'vitest';
import { DependencyGraph } from '../analysis/dependency-graph';
import * as path from 'path';

describe('DependencyGraph', () => {
  const projectRoot = '/test/project';

  it('should build a dependency graph from source files', async () => {
    const graph = new DependencyGraph(projectRoot);
    // Mock file system for testing
    const deps = await graph.build([
      path.join(projectRoot, 'src/a.ts'),
      path.join(projectRoot, 'src/b.ts'),
    ]);

    expect(deps).toBeDefined();
    expect(typeof deps).toBe('object');
  });

  it('should detect circular dependencies', () => {
    const graph = new DependencyGraph(projectRoot);
    // Simulate circular dependency
    (graph as any).graph = {
      'a.ts': ['b.ts'],
      'b.ts': ['c.ts'],
      'c.ts': ['a.ts'],
    };

    const cycles = graph.findCircularDependencies();
    expect(cycles.length).toBeGreaterThan(0);
  });

  it('should return files in topological order', () => {
    const graph = new DependencyGraph(projectRoot);
    (graph as any).graph = {
      'a.ts': ['b.ts'],
      'b.ts': ['c.ts'],
      'c.ts': [],
    };

    const order = graph.getOrderedFiles();
    const cIndex = order.indexOf('c.ts');
    const bIndex = order.indexOf('b.ts');
    const aIndex = order.indexOf('a.ts');

    expect(cIndex).toBeLessThan(bIndex);
    expect(bIndex).toBeLessThan(aIndex);
  });

  it('should get dependents of a file', () => {
    const graph = new DependencyGraph(projectRoot);
    (graph as any).graph = {
      'a.ts': ['utils.ts'],
      'b.ts': ['utils.ts'],
      'c.ts': ['a.ts'],
    };

    const dependents = graph.getDependents('utils.ts');
    expect(dependents).toContain('a.ts');
    expect(dependents).toContain('b.ts');
    expect(dependents).not.toContain('c.ts');
  });
});
