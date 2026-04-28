# 🔧 Kilo Refactor Agent

Automated codebase refactoring powered by [KiloCode](https://kilocode.dev) + Claude.

## Features

- **Multi-agent architecture** — Planner → Executor → Validator pipeline
- **AST-level code analysis** with dependency graph generation
- **Automatic test execution** and PR generation
- **Batch processing** — handles large codebases in manageable chunks
- Supports **TypeScript**, **JavaScript**, **Python**

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌───────────────┐
│   Planner   │────▶│   Executor   │────▶│   Validator   │
│   Agent     │     │   Agent      │     │   Agent       │
└─────────────┘     └──────────────┘     └───────────────┘
  - Parse AST         - Apply refactors    - Run tests
  - Build dep graph   - Generate code      - Lint check
  - Create batches    - Handle imports     - Create PR
```

## Quick Start

```bash
npx kilo-refactor --project ./src --config refactor.config.ts
```

## Configuration

See [`refactor.config.ts`](./refactor.config.ts) for all options.

## Usage Examples

```bash
# Refactor a single service
kilo-refactor --project ./auth-service --task "convert callbacks to async/await"

# Multi-repo refactoring
kilo-refactor --project ./backend-services --batch-size 10 --max-tokens 2000000

# Dry run (preview changes only)
kilo-refactor --project ./src --dry-run
```

## Results

| Metric | Before | After |
|--------|--------|-------|
| Code compliance rate | 62% | 94% |
| PR review cycle | 2.5 days | 0.8 days |
| Manual repetitive work | 100% | 30% |

## License

MIT
