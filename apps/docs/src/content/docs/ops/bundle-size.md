---
title: Bundle size
description: Why we enforce size budgets and how the numbers are checked.
---

Every package in this repo has a hard size budget enforced in CI. Cross the limit, the PR fails.

## Current budgets

| Package    | Entry                       | Budget   | Actual (gzipped) |
|------------|-----------------------------|----------|------------------|
| store-kit  | `index.mjs`                 | 2 KB     | ~1.2 KB |
| fetch-kit  | `index.mjs`                 | 3.1 KB   | ~3 KB |
| fetch-kit  | `react.mjs`                 | 1.5 KB   | ~0.75 KB |
| log-kit    | `index.mjs`                 | 2 KB     | ~1.8 KB |
| log-kit    | `transports/console.mjs`    | 1 KB     | ~0.8 KB |
| log-kit    | `transports/http.mjs`       | 1.5 KB   | ~0.5 KB |
| log-kit    | `transports/file.mjs`       | 1 KB     | ~0.65 KB |
| log-kit    | `transports/datadog.mjs`    | 1.25 KB  | ~1.0 KB |
| config-kit | `index.mjs`                 | 2.5 KB   | ~2.2 KB |

## Why budgets

Bundle size regresses silently. A "small" helper here, a polyfill there, a transitive dep update - six months later your "tiny" library is 14 KB and nobody noticed. The budget makes regressions visible at the moment they happen.

## How it's measured

[`size-limit`](https://github.com/ai/size-limit) bundles the package the way a real consumer would (esbuild, with peer deps externalized), gzips the result, compares against the budget. Run locally:

```bash
pnpm -r --filter=./packages/* size
```

## When the budget is wrong

If a feature genuinely needs more bytes, the budget gets raised - in the same PR that adds the feature, with a one-line justification in the changeset entry. The budget is a forcing function for *intentional* growth, not a permanent ceiling.

## What's externalized

- `react` and `react-dom` (peer deps)
- `zustand` (peer dep of store-kit)
- `zod` (optional peer of fetch-kit)
