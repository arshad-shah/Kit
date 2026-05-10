---
title: Releases
description: Semver, changesets, and how a change becomes a published version.
---

## Semver, strictly

Every public symbol gets a stability guarantee:

- **Patch** - bug fixes, perf improvements, internal refactors that don't change behaviour
- **Minor** - new features, new exports, additions to existing types that don't break consumers
- **Major** - removed or renamed exports, changed function signatures, narrowed types, anything that breaks `tsc` for an existing consumer

Type-level changes count. If your code compiled against `2.x` and stops compiling against `2.y`, that's a breaking change and we got the versioning wrong.

## Changesets

Each PR includes a changeset describing the change in user-facing terms:

```bash
pnpm changeset
```

The CLI walks you through which packages changed, at what level, and asks for a one-line summary. The summary becomes the changelog entry on release.

## The release flow

1. Merge a PR with changesets
2. The release workflow opens (or updates) a "Version Packages" PR with the version bumps and changelog updates
3. Reviewing and merging that PR triggers the publish workflow
4. Each affected package publishes to npm with provenance, gets a git tag, and a GitHub release with the changelog

## What gets published

Only `dist/`, `README.md`, `LICENSE`, and `package.json`. Source files, tests, configs, and tooling are excluded via the `files` field. This keeps the unpacked size tiny and prevents accidentally shipping internal modules.

## Yanking a release

If a published version turns out to be broken, deprecate it (don't unpublish - that breaks lockfiles in user projects):

```bash
npm deprecate @arshad-shah/fetch-kit@2.3.0 "Critical bug, use 2.3.1"
```

Then publish a fix as a new patch.
