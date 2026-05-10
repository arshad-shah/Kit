# Foundation pass: initial release infrastructure

**Date:** 2026-05-10
**Status:** Approved (pending user review of this written spec)
**Scope:** Foundation pass only (sections 1, 2, 6, 7 of original prompt + security verification + CI audit gate). Sections 3 (mutation testing), 4 (`apps/integration/`), and 5 (`apps/hooks-demo/` + Playwright) are deferred to follow-up sessions, each getting its own brainstorm.

## Goal

Take the `kit` monorepo from "all source code present, nothing committed, no release machinery" to "ready to cut v0.1.0 of all four published packages" — without touching the four published packages' source code.

## Non-goals

- No source changes in `packages/store-kit`, `packages/fetch-kit`, `packages/log-kit`, `packages/config-kit`.
- No mutation testing run (deferred).
- No new workspace apps (deferred).
- No actual release. No `git push`. No npm trusted publisher configuration on npmjs.com (that's a manual step you do, the docs explain how).
- No `pnpm changeset version` invocation — that mutates every package version and consumes the changeset file; it belongs to the release workflow.

## Constraints (from prompt + repo conventions)

- No new runtime deps in any of the four published packages without explicit changeset justification.
- No circular workspace deps. Current tree: store-kit, fetch-kit, log-kit, config-kit are all leaves. config-kit accepts a logger structurally only.
- No `any` types. Strict TS with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`.
- Match prose style of existing READMEs/docs: short paragraphs, concrete examples, no marketing copy, no bullet soup.
- Don't change docs site visual design beyond what's in `apps/docs/src/styles/terminal.css`.

## Deliverables

### New files

| Path | Purpose |
|---|---|
| `.changeset/initial-release.md` | Declares v0.1.0 minor bumps for the four published packages |
| `SETUP.md` | Clone → install → test → build → docs → changeset → release flow |
| `CONTRIBUTING.md` | Dependency rules, bundle budgets, coverage threshold, changeset rule, style/strictness pointers |
| `.nvmrc` | `22` |
| `.npmrc` | `engine-strict=true`, `auto-install-peers=true` |
| `.github/PULL_REQUEST_TEMPLATE.md` | Checklist: changeset / tests / docs / bundle + "what and why" prose |
| `.github/ISSUE_TEMPLATE/bug_report.md` | Env, package + version, minimal repro, expected vs actual |
| `.github/ISSUE_TEMPLATE/feature_request.md` | Problem, proposed API sketch (optional), alternatives |
| `.github/dependabot.yml` | Weekly npm + GitHub Actions updates with grouping (see below) |
| `packages/store-kit/CHANGELOG.md` | Seed `## Unreleased` |
| `packages/fetch-kit/CHANGELOG.md` | Seed `## Unreleased` |
| `packages/log-kit/CHANGELOG.md` | Seed `## Unreleased` |
| `packages/config-kit/CHANGELOG.md` | Seed `## Unreleased` |

### Modified files

| Path | Change |
|---|---|
| `apps/docs/src/content/docs/ops/security.md` | Append "npm trusted publisher setup" + "first-release bootstrap" sections, matching existing prose style |
| `.github/workflows/ci.yml` | Add a separate `audit` job running `pnpm audit --prod --audit-level=high` |

## Meaningful design decisions

### 1. Changeset bump verb is `minor`, not `patch`

For v0.x packages, semver convention treats minor as the "feature release" verb. Major (v1.0.0) is reserved for "API stability promise". Patch is for fixes. Since this is the first public release introducing the entire API surface, minor is the right verb.

### 2. Initial-release changeset content

```md
---
"@arshad-shah/store-kit": minor
"@arshad-shah/fetch-kit": minor
"@arshad-shah/log-kit": minor
"@arshad-shah/config-kit": minor
---

Initial public release.

- store-kit: typed Zustand factory with persistence, schema-validated migrations, and pluggable storage.
- fetch-kit: typed fetch client with retries, schema validation, abort support, and React hooks.
- log-kit: structured logger with pluggable transports (console, HTTP, file, Datadog) and perf markers.
- config-kit: typed env loading from `.env`, `process.env`, and remote sources.
```

### 3. Dependabot grouping strategy

PR volume management. Grouping rules:

- **Workspace devDependencies**: one PR per directory (root, each package, docs app). Batched aggressively because they don't affect consumers.
- **`actions/*`**: one PR. GitHub Action version bumps are low-risk and best handled in bulk.
- **Production `dependencies` of the four published packages**: separate PRs per dep. These affect bundle size and downstream consumers, so each gets its own scrutiny + changeset.
- **`apps/docs` and `packages/internal-config`**: aggressive batching — these are private/ignored per `.changeset/config.json:10`, so dep updates don't need changesets.

### 4. CI audit gate as a separate job

`pnpm audit --prod --audit-level=high` runs as its own job in `ci.yml`, parallel to the existing lint/test/build jobs. Rationale: a fresh CVE shouldn't gate unrelated work's lint/test feedback in the PR check list. Job-level separation surfaces audit failures distinctly.

The `--prod` flag scopes to runtime deps. The `--audit-level=high` threshold means LOW/MODERATE findings get reported but don't fail the build (they get tracked via dependabot and `ops/security.md`).

### 5. CONTRIBUTING.md structure

Five sections in this order:
1. **Dependency rules** — the tree (4 leaf packages + private `internal-config`), no-circular rule, structural-typing rule for any cross-package logger consumption.
2. **Bundle budgets** — budgets are enforced via size-limit; if a feature genuinely needs bytes, the budget moves up *in the same PR* with a one-line justification.
3. **Coverage threshold** — 95% lines/funcs/statements, 90% branches.
4. **Changesets** — every PR touching `packages/*` needs `pnpm changeset`.
5. **Style and strictness** — pointer to `biome.json` and `packages/internal-config/tsconfig.base.json`. No commentary.

### 6. PR template

Four checkboxes (changeset, tests, docs, bundle) plus a "What and why" prose section. No marketing copy, no required emoji icons.

### 7. Bug/feature templates

- **Bug**: env (Node, pnpm, OS), package + version, minimal repro, expected vs actual.
- **Feature**: problem, proposed API sketch (optional), alternatives considered.

Both stay under 30 lines.

## Execution plan

Approach C — parallel verify and write:

1. Kick off `pnpm install` in the background.
2. While install runs, write all 11 new files and the two modifications.
3. Make the **initial-import** git commit containing only the existing-source files. Stage explicitly by path so the new foundation files stay unstaged for separate commits. This keeps the foundation work reviewable as a clean diff series on top of the import.
4. When install completes: run `pnpm ci` (lint + typecheck + test + build + size).
5. Run `pnpm audit --prod --audit-level=high`.
6. Address audit findings per the branch points below.
7. Run `pnpm changeset status` to confirm the four packages are detected.
8. Per-deliverable commits on top of the import, in this order:
   - `chore: add .nvmrc, .npmrc, root .gitignore`  (gitignore already written)
   - `docs: add SETUP.md`
   - `docs: add CONTRIBUTING.md`
   - `chore: add PR and issue templates`
   - `chore: add dependabot config`
   - `chore: seed per-package CHANGELOG.md`
   - `chore: declare initial-release changeset`
   - `docs(ops): document npm trusted publisher setup`
   - `ci: add audit job`
   - (optional, last) `docs: add brainstorming spec for foundation pass`

## Branch points (where I pause to ask)

- **`pnpm install` fails** — stop, surface error.
- **`pnpm ci` fails** — surface failure; quick fix or escalate.
- **Audit finds HIGH/CRITICAL** — list findings, propose fix path per finding, do NOT silently bump prod deps. DevDep bumps proceed unilaterally.
- **Audit finds LOW/MODERATE only** — document in `ops/security.md`, don't fail build (consistent with `--audit-level=high`).

## Verification per artifact

| Artifact | Verification |
|---|---|
| All markdown | Visual read-through; prose-style match against existing READMEs |
| `.changeset/initial-release.md` | `pnpm changeset status` reports 4 packages → 0.1.0 |
| `dependabot.yml` | YAML parse via Node; visual review |
| `ci.yml` audit job | Run `pnpm audit --prod --audit-level=high` locally first; same command the job runs |
| `.nvmrc`, `.npmrc` | Implicit via `pnpm install` succeeding |
| Per-package `CHANGELOG.md` | Visual inspection. Skip `--snapshot` testing because it would mutate `package.json` versions; revert mechanics add risk for low value. The Changesets convention is to *prepend* to existing CHANGELOG.md, so a seeded `## Unreleased` block is safe. |
| `security.md` change | Visual; spot-check render with `pnpm docs:dev` (the docs site exists and the security page is part of it, so this is a free check) |

## Out of scope for this spec

These are tracked for follow-up brainstorms, each their own design doc:

- **Section 3** — Mutation testing baseline. Open-ended depending on surviving mutants. Needs its own time-box discussion.
- **Section 4** — `apps/integration/` end-to-end smoke test app. Needs design choices about which scenario to demonstrate.
- **Section 5** — `apps/hooks-demo/` + Playwright + `visual.yml`. Needs design choices about screenshot baseline storage and CI matrix.

## Success criteria

- `pnpm ci` passes from a clean clone.
- `pnpm audit --prod --audit-level=high` exits 0.
- `pnpm changeset status` reports 4 packages bumping to 0.1.0.
- All new markdown reads cleanly when viewed (READMEs, templates, CONTRIBUTING).
- Repo has a clean linear commit history from "initial import" through each foundation deliverable.
- Nothing in `packages/store-kit/src`, `packages/fetch-kit/src`, `packages/log-kit/src`, or `packages/config-kit/src` was modified.
