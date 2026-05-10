# Contributing

Thanks for considering a contribution. The packages in this repo are deliberately small — they exist to do one thing well and stay out of the way. New work is judged against that.

## Dependency rules

The four publishable packages are leaves:

```
config-kit    store-kit    fetch-kit    log-kit
```

None depends on another at runtime. `config-kit` can *consume* a logger structurally — it defines a small `Logger` interface internally and accepts any object satisfying it. The package declares an *optional* peer dep on `log-kit` purely as a version-compatibility hint for users wiring the two together; nothing in `config-kit/src` ever `import`s from `log-kit`. `store-kit` and `fetch-kit` don't consume loggers internally — consumers attach their own observability via callbacks (e.g. fetch-kit's `onError`).

This isolation keeps each package independently usable and avoids accidentally pulling all four into a consumer's bundle.

`packages/internal-config` is private and shared at build time only. Don't add runtime dependencies on it.

No circular workspace deps. If a change introduces one, redesign instead.

## Bundle budgets

Every published package has a size budget enforced by [size-limit](https://github.com/ai/size-limit) and checked in CI via `pnpm size`. Budgets are intentionally tight; the README's stated sizes are the ceilings, not aspirations.

If a feature genuinely needs more bytes:

1. Bump the budget in the same PR that introduces the feature.
2. Add a one-line justification to the PR description explaining why.

Bumping a budget without a justification will be requested-changes during review. Adding bytes for "convenience" or "in case someone needs it" is the path away from the project's reason for existing.

## Coverage threshold

Vitest is configured to enforce:

- 95% lines
- 95% functions
- 95% statements
- 90% branches

`pnpm test:coverage` runs the check. If new code drops a metric below threshold, add the tests rather than lower the threshold.

Mutation testing is also enforced per package via Stryker (threshold 70). See `stryker.config.mjs` in each package.

## Changesets

Every PR that touches `packages/*` needs a changeset:

```bash
pnpm changeset
```

The CLI prompts for affected packages and a semver level. The resulting markdown becomes the `CHANGELOG.md` entry and the release notes — write the description for someone reading the changelog later, not for the PR reviewer.

PRs that only touch `apps/docs`, `packages/internal-config`, or top-level config files do not need a changeset (`apps/docs` is in the changeset `ignore` list).

## Style and strictness

- Formatter and linter: [Biome](https://biomejs.dev), configured in `biome.json`. Run `pnpm lint:fix` before pushing.
- TypeScript: strict, with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and `noPropertyAccessFromIndexSignature`. Configured in `packages/internal-config/tsconfig.base.json`. No `any` types.
- Indentation: tabs, width 2 (per Biome config).

## Submitting a PR

1. Branch from `master`.
2. Make changes, add tests, run `pnpm ci` locally.
3. `pnpm changeset` if `packages/*` changed.
4. Open the PR. The PR template walks through the rest.
