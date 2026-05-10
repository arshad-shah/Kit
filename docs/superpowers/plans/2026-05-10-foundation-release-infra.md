# Foundation Release Infrastructure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take the `kit` monorepo from "all source present, nothing committed, no release machinery" to "ready to publish v0.1.0", without modifying source code in the four published packages.

**Architecture:** Foundation pass writing only markdown and CI/repo config. Two CI changes (`audit` job in `ci.yml`, dependabot config). Verification is `pnpm install` + `pnpm ci` + `pnpm audit` + `pnpm changeset status`. Commits are sequenced as one initial-import then per-deliverable.

**Tech Stack:** pnpm 9 workspaces, Changesets, GitHub Actions, Dependabot v2, Biome (markdown unaffected), Astro Starlight (for the security.md change rendering).

**Spec:** [docs/superpowers/specs/2026-05-10-foundation-release-infra-design.md](../specs/2026-05-10-foundation-release-infra-design.md)

---

## Task 0: Kick off `pnpm install` in the background

This runs alongside Tasks 1-11 so verification later doesn't block on a cold install.

**Files:** none

- [ ] **Step 1: Start install in background**

Run: `pnpm install` (background)
Expected: takes 3-5 min on first run; produces `node_modules/`, `pnpm-lock.yaml` may be updated.

- [ ] **Step 2: Capture the background job ID** for later polling.

---

## Task 1: Add `.nvmrc` and `.npmrc`

**Files:**
- Create: `.nvmrc`
- Create: `.npmrc`

- [ ] **Step 1: Write `.nvmrc`**

Content (single line, no trailing newline matters less than no other lines):

```
22
```

- [ ] **Step 2: Write `.npmrc`**

Content:

```
engine-strict=true
auto-install-peers=true
```

- [ ] **Step 3: Verify files exist and contents match**

Read both files; confirm exact byte-level content.

(No commit yet — bundled with Task 2's commit.)

---

## Task 2: Commit "initial import" + Task 1 follow-up

The repo currently has zero commits and everything is untracked. Make the first commit be the existing source code only, then a separate commit with the new repo-root configuration (`.gitignore` already written from earlier in session, plus the new `.nvmrc` / `.npmrc`).

**Files:** stage by explicit path.

- [ ] **Step 1: Stage existing-source files only**

Run:
```bash
git add packages/ apps/ .changeset/config.json .github/workflows/ biome.json package.json pnpm-lock.yaml pnpm-workspace.yaml LICENSE README.md
```

(Deliberately *not* staged: `.gitignore`, `.nvmrc`, `.npmrc`, `docs/superpowers/`)

- [ ] **Step 2: Verify the staged set looks right**

Run: `git status --short`
Expected: tracked entries (A) for the existing source; untracked (??) for `.gitignore`, `.nvmrc`, `.npmrc`, `docs/`.

- [ ] **Step 3: Commit the import**

Run:
```bash
git commit -m "$(cat <<'EOF'
chore: initial import of kit monorepo

Imports the four publishable packages (store-kit, fetch-kit, log-kit,
config-kit), the shared internal-config, the Astro Starlight docs site,
and the four GitHub Actions workflows. Foundation work for the v0.1.0
release lands in subsequent commits.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Stage and commit the repo-root config files**

Run:
```bash
git add .gitignore .nvmrc .npmrc
git commit -m "$(cat <<'EOF'
chore: add .gitignore, .nvmrc, .npmrc

- .gitignore: ignores node_modules, build output, caches, logs, env files,
  per-IDE settings (with shared .vscode allowed through), and the
  per-package generated typedoc API docs.
- .nvmrc: pins local development to Node 22 (engines.node still allows
  >= 20.11.0 for consumers).
- .npmrc: engine-strict prevents accidental installs on unsupported Node
  versions; auto-install-peers handles the React peer dep on fetch-kit/react.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Verify**

Run: `git log --oneline`
Expected: 2 commits, in order: chore initial import, chore repo-root config.

---

## Task 3: Write `SETUP.md`

**Files:**
- Create: `SETUP.md`
- Reference: `README.md` (for prose style)
- Reference: `package.json` scripts (lines 14-34)

- [ ] **Step 1: Re-read `README.md`** to absorb the prose style (short paragraphs, concrete commands, no marketing).

- [ ] **Step 2: Write `SETUP.md`**

Content:

````markdown
# Setup

This is a pnpm monorepo with four publishable packages and an Astro docs site.

## Prerequisites

- Node 22 (a `.nvmrc` is included; `nvm use` picks it up).
- pnpm 9.15.0 or newer. The repo declares `packageManager` in `package.json`, so [Corepack](https://nodejs.org/api/corepack.html) will handle this automatically when enabled.

## Clone and install

```bash
git clone https://github.com/arshad-shah/kit.git
cd kit
pnpm install
```

The first install pulls dependencies for every workspace package and the docs site; expect 3-5 minutes.

## Daily commands

```bash
pnpm test            # Vitest across every package
pnpm test:watch      # Vitest in watch mode
pnpm test:coverage   # enforces 95% lines/funcs/statements, 90% branches
pnpm lint            # Biome check
pnpm typecheck       # tsc --noEmit across packages
pnpm build           # tsup build for every package
pnpm size            # size-limit budget enforcement
pnpm ci              # the full pre-merge pipeline
```

## Docs site

```bash
pnpm docs:dev        # Astro dev server on http://localhost:4321
pnpm docs:build      # production build (regenerates the typedoc API pages first)
```

The API reference under `apps/docs/src/content/docs/<package>/api/` is generated by `apps/docs/scripts/generate-api-docs.mjs`. Don't edit those files by hand.

## Adding a changeset

Every PR that touches `packages/*` needs a changeset describing the user-visible change.

```bash
pnpm changeset
```

The CLI walks you through which packages changed and at what semver level. The generated markdown lands in `.changeset/` and gets consumed by the release workflow on `main`.

## Release flow

The release is automated via [`changesets/action`](https://github.com/changesets/action) in `.github/workflows/release.yml`. The flow:

1. Merge a PR with one or more changesets to `main`.
2. The release workflow opens (or updates) a "Version Packages" PR that consumes the changesets, bumps versions, and updates each package's `CHANGELOG.md`.
3. Merging the Version Packages PR triggers npm publish via OIDC trusted publishing — there is no `NPM_TOKEN` secret. Each package must have a trusted publisher configured on npmjs.com first; see [docs/ops/security](apps/docs/src/content/docs/ops/security.md) for the bootstrap procedure.

You will not normally run `pnpm changeset version` or `pnpm release` locally — those are for the release workflow.

## Mutation testing

Each published package has a `stryker.config.mjs` and a `pnpm test:mutation` script. The threshold is 70 (configured as `break` in each Stryker config). This runs in `.github/workflows/mutation.yml`.

```bash
cd packages/store-kit
pnpm test:mutation
```
````

- [ ] **Step 3: Read back and verify** prose flows, no broken links, no marketing copy.

- [ ] **Step 4: Commit**

Run:
```bash
git add SETUP.md
git commit -m "$(cat <<'EOF'
docs: add SETUP.md

Covers prerequisites, install, daily commands, docs site, changesets,
release flow, and mutation testing entry points. References the existing
ops/security.md for the trusted-publisher bootstrap.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Write `CONTRIBUTING.md`

**Files:**
- Create: `CONTRIBUTING.md`
- Reference: `biome.json`, `packages/internal-config/tsconfig.base.json`, `.changeset/config.json`

- [ ] **Step 1: Confirm dependency tree** by reading the four published packages' `package.json` files for any cross-workspace dep edges.

Run: `cat packages/store-kit/package.json packages/fetch-kit/package.json packages/log-kit/package.json packages/config-kit/package.json | grep -A2 dependencies`
Expected: zero `workspace:*` cross-edges between the four (only `internal-config` may appear). This validates the "all four are leaves" claim before writing it as policy.

- [ ] **Step 2: Write `CONTRIBUTING.md`**

Content:

````markdown
# Contributing

Thanks for considering a contribution. The packages in this repo are deliberately small — they exist to do one thing well and stay out of the way. New work is judged against that.

## Dependency rules

The four publishable packages are leaves:

```
config-kit    store-kit    fetch-kit    log-kit
```

None depends on another at runtime. `fetch-kit` and `config-kit` can *consume* a logger structurally — i.e., they accept any object satisfying a small `Logger` interface — but they never `import` from `log-kit`. This keeps each package independently usable and avoids accidentally pulling all four into a consumer's bundle.

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

1. Branch from `main`.
2. Make changes, add tests, run `pnpm ci` locally.
3. `pnpm changeset` if `packages/*` changed.
4. Open the PR. The PR template walks through the rest.
````

- [ ] **Step 3: Verify the dep claim survived contact with reality.** If Step 1 surfaced any cross-workspace edges between the four published packages, fix this CONTRIBUTING.md text *and* raise the discrepancy as a separate concern.

- [ ] **Step 4: Commit**

Run:
```bash
git add CONTRIBUTING.md
git commit -m "$(cat <<'EOF'
docs: add CONTRIBUTING.md

Documents the dependency tree (four leaf packages, structural-typed cross
consumption), bundle budget discipline (move budgets in same PR with
justification), coverage thresholds (95/95/95/90 + Stryker 70), the
changeset rule, and pointers to biome.json + tsconfig.base.json for style
and strictness.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Add PR and issue templates

**Files:**
- Create: `.github/PULL_REQUEST_TEMPLATE.md`
- Create: `.github/ISSUE_TEMPLATE/bug_report.md`
- Create: `.github/ISSUE_TEMPLATE/feature_request.md`

- [ ] **Step 1: Write the PR template**

Path: `.github/PULL_REQUEST_TEMPLATE.md`

Content:

```markdown
## What and why

<!-- One paragraph: what does this change, and why is it needed? -->

## Checklist

- [ ] Changeset added (`pnpm changeset`) if `packages/*` was touched
- [ ] Tests added or updated; `pnpm test` passes locally
- [ ] Docs updated if behavior or public API changed
- [ ] Bundle budget impact considered; budget moved up (with justification) if needed

## Notes for reviewers

<!-- Anything specific you want eyes on, edge cases you're unsure about, or follow-ups planned. -->
```

- [ ] **Step 2: Write the bug report template**

Path: `.github/ISSUE_TEMPLATE/bug_report.md`

Content:

```markdown
---
name: Bug report
about: Something is broken or behaves unexpectedly
labels: bug
---

## Environment

- Package and version: `@arshad-shah/<package>@x.y.z`
- Node version: <output of `node --version`>
- pnpm/npm/yarn version:
- OS:

## What happened

<!-- What did you see? Include error messages and stack traces in code fences. -->

## What you expected

<!-- What did you expect instead? -->

## Minimal reproduction

<!-- A snippet, a link to a repo, or a CodeSandbox. The smaller the better. -->

```ts
// minimal repro here
```
```

- [ ] **Step 3: Write the feature request template**

Path: `.github/ISSUE_TEMPLATE/feature_request.md`

Content:

```markdown
---
name: Feature request
about: Suggest a new capability or change to an existing one
labels: enhancement
---

## Problem

<!-- What are you trying to do that's currently hard or impossible? -->

## Proposed API (optional)

<!-- A code sketch of how you'd want to use it. -->

```ts
// sketch here
```

## Alternatives considered

<!-- What else have you tried or thought about? -->

## Why it belongs here

<!-- These packages are intentionally small. Why is this feature in scope rather than a userland helper? -->
```

- [ ] **Step 4: Commit**

Run:
```bash
git add .github/PULL_REQUEST_TEMPLATE.md .github/ISSUE_TEMPLATE/
git commit -m "$(cat <<'EOF'
chore: add PR and issue templates

PR template surfaces the four required checks (changeset, tests, docs,
bundle). Issue templates ask for environment + minimal repro on bugs and
problem-first framing on features (consistent with the "small by design"
project posture).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Add `.github/dependabot.yml`

**Files:**
- Create: `.github/dependabot.yml`

- [ ] **Step 1: Write `dependabot.yml`**

Content:

```yaml
version: 2
updates:
  # GitHub Actions across all workflows
  - package-ecosystem: github-actions
    directory: "/"
    schedule:
      interval: weekly
    groups:
      actions:
        patterns:
          - "*"

  # Root workspace devDependencies (Biome, Changesets, tsup, Vitest, etc.)
  - package-ecosystem: npm
    directory: "/"
    schedule:
      interval: weekly
    groups:
      root-devdeps:
        dependency-type: development

  # Docs site (Astro, Starlight, sharp, typedoc) - private, no changeset needed
  - package-ecosystem: npm
    directory: "/apps/docs"
    schedule:
      interval: weekly
    groups:
      docs-deps:
        patterns:
          - "*"

  # internal-config - private build-time only, no changeset needed
  - package-ecosystem: npm
    directory: "/packages/internal-config"
    schedule:
      interval: weekly
    groups:
      internal-config-deps:
        patterns:
          - "*"

  # Published packages: prod deps individually, devDeps grouped.
  # Prod dep updates need their own PR + changeset because they affect bundle
  # size and downstream consumers.
  - package-ecosystem: npm
    directory: "/packages/store-kit"
    schedule:
      interval: weekly
    groups:
      store-kit-devdeps:
        dependency-type: development

  - package-ecosystem: npm
    directory: "/packages/fetch-kit"
    schedule:
      interval: weekly
    groups:
      fetch-kit-devdeps:
        dependency-type: development

  - package-ecosystem: npm
    directory: "/packages/log-kit"
    schedule:
      interval: weekly
    groups:
      log-kit-devdeps:
        dependency-type: development

  - package-ecosystem: npm
    directory: "/packages/config-kit"
    schedule:
      interval: weekly
    groups:
      config-kit-devdeps:
        dependency-type: development
```

- [ ] **Step 2: Verify YAML parses**

Run (PowerShell or Bash):
```bash
node -e "const y=require('js-yaml');const f=require('fs');console.log('OK'); y.load(f.readFileSync('.github/dependabot.yml','utf8'))"
```
Expected: prints `OK` (the require may fail if `js-yaml` isn't installed; if so, fall back to a syntax-only check via `node -e "console.log(require('fs').readFileSync('.github/dependabot.yml','utf8'))"` and visual inspection — this is YAML 1.2, structurally simple).

If `js-yaml` is unavailable AND there's any doubt, use Python: `python -c "import yaml; yaml.safe_load(open('.github/dependabot.yml'))" && echo OK`.

- [ ] **Step 3: Commit**

Run:
```bash
git add .github/dependabot.yml
git commit -m "$(cat <<'EOF'
chore: add dependabot config

Weekly updates with grouping that reflects the architectural distinction
between published packages and internal/private code:

- Published packages: prod deps get individual PRs (each needs a changeset
  + bundle review); devDeps batched per package.
- internal-config and apps/docs: aggressive batching (private, ignored
  in changeset config).
- GitHub Actions: one grouped PR.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Seed per-package `CHANGELOG.md` files

**Files:**
- Create: `packages/store-kit/CHANGELOG.md`
- Create: `packages/fetch-kit/CHANGELOG.md`
- Create: `packages/log-kit/CHANGELOG.md`
- Create: `packages/config-kit/CHANGELOG.md`

- [ ] **Step 1: Write store-kit CHANGELOG.md**

Path: `packages/store-kit/CHANGELOG.md`

Content:

```markdown
# @arshad-shah/store-kit

## Unreleased

Initial release. See README for features.
```

- [ ] **Step 2: Write fetch-kit CHANGELOG.md**

Path: `packages/fetch-kit/CHANGELOG.md`

Content:

```markdown
# @arshad-shah/fetch-kit

## Unreleased

Initial release. See README for features.
```

- [ ] **Step 3: Write log-kit CHANGELOG.md**

Path: `packages/log-kit/CHANGELOG.md`

Content:

```markdown
# @arshad-shah/log-kit

## Unreleased

Initial release. See README for features.
```

- [ ] **Step 4: Write config-kit CHANGELOG.md**

Path: `packages/config-kit/CHANGELOG.md`

Content:

```markdown
# @arshad-shah/config-kit

## Unreleased

Initial release. See README for features.
```

- [ ] **Step 5: Commit**

Run:
```bash
git add packages/store-kit/CHANGELOG.md packages/fetch-kit/CHANGELOG.md packages/log-kit/CHANGELOG.md packages/config-kit/CHANGELOG.md
git commit -m "$(cat <<'EOF'
chore: seed per-package CHANGELOG.md

Changesets prepends to existing CHANGELOG.md files on `pnpm changeset
version`, so seeding with an Unreleased block is safe and gives each
package a stable initial state for the first release entry to land
above.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Add the initial-release changeset

**Files:**
- Create: `.changeset/initial-release.md`

- [ ] **Step 1: Write the changeset**

Path: `.changeset/initial-release.md`

Content:

```markdown
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

- [ ] **Step 2: Verify Changesets sees it**

This requires `pnpm install` to be done. If the background install (Task 0) is still running, wait. Otherwise:

Run: `pnpm changeset status`
Expected output includes the four packages and "Releases" mentioning a minor bump for each going to `0.1.0`. Failure modes: if Changesets reports "no packages to release", the changeset frontmatter syntax is wrong; re-check the package names and the YAML.

- [ ] **Step 3: Commit**

Run:
```bash
git add .changeset/initial-release.md
git commit -m "$(cat <<'EOF'
chore: declare initial-release changeset

Minor bump for all four publishable packages (v0.x convention treats
minor as the feature-release verb; major is reserved for v1.0.0 stability
promise). Description summarizes each package's surface for the changelog.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Extend `apps/docs/src/content/docs/ops/security.md`

**Files:**
- Modify: `apps/docs/src/content/docs/ops/security.md`

- [ ] **Step 1: Read the current file** end-to-end to absorb its prose style and find the right insertion point.

- [ ] **Step 2: Append the new sections**

The exact insert should be at the end of the file (or before any existing "References" section if one exists — adjust based on Step 1's read). Use Edit to add this block:

````markdown
## npm trusted publisher setup

The `release.yml` workflow uses [npm trusted publishing](https://docs.npmjs.com/trusted-publishers) via OpenID Connect. There is no `NPM_TOKEN` secret in the repository — authentication is short-lived and tied to a verified GitHub Actions run.

For each package (`@arshad-shah/store-kit`, `@arshad-shah/fetch-kit`, `@arshad-shah/log-kit`, `@arshad-shah/config-kit`), configure a trusted publisher on npmjs.com:

1. Sign in to [npmjs.com](https://www.npmjs.com/) as a maintainer of the package.
2. Open the package page → Settings → Publishing.
3. Add trusted publisher with:
   - **Publisher**: GitHub Actions
   - **Organization or user**: `arshad-shah`
   - **Repository**: `kit`
   - **Workflow filename**: `release.yml`
   - **Environment**: leave empty (the release workflow does not declare one)
4. Save.

Once configured, the next merged Changesets release PR triggers a publish that npm authenticates against the OIDC token issued by GitHub for that exact workflow + repo + branch combination. No tokens to rotate, nothing to leak.

### First release of a new package

Trusted publishers can only be configured *after* a package exists on npm. So the first publish of any new package — including all four packages on first release — needs an alternative auth path.

The bootstrap procedure for a new package:

1. Generate a [granular access token](https://www.npmjs.com/settings/<your-username>/tokens/granular-access-tokens/new) on npmjs.com scoped to the package and the `automation` purpose. Set the shortest expiry that lets you complete steps 2-4.
2. Add it as a repository secret named `NPM_TOKEN`.
3. Temporarily uncomment the `NPM_TOKEN` env line in the `release` job of `.github/workflows/release.yml` (currently absent — add `NPM_TOKEN: ${{ secrets.NPM_TOKEN }}` to the `Create release PR or publish to npm` step).
4. Merge the release PR. The package publishes for the first time using the token.
5. Configure the trusted publisher on npmjs.com per the steps above.
6. Revert the workflow change. Delete the `NPM_TOKEN` repository secret. Revoke the token on npmjs.com.

Future releases of that package use OIDC.
````

Use the Edit tool with the exact closing context of the existing file as `old_string` and `old_string + new content` as `new_string`. (Step 1's read tells you what the current file ends with.)

- [ ] **Step 3: Verify the docs site builds with the change**

Run: `pnpm docs:build`
Expected: build succeeds, including the `gen:api` typedoc step. If `gen:api` fails because packages weren't built, run `pnpm build` first.

If you don't want to wait for the full build (slow), at minimum run: `pnpm --filter=docs astro check` to type-check the markdown.

- [ ] **Step 4: Commit**

Run:
```bash
git add apps/docs/src/content/docs/ops/security.md
git commit -m "$(cat <<'EOF'
docs(ops): document npm trusted publisher setup

Adds step-by-step OIDC trusted publisher configuration for all four
packages and a first-release bootstrap procedure (token-based publish,
then switch to trusted publisher). Documents the chicken-and-egg of
trusted publishers requiring an existing package.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Add the `audit` job to `ci.yml`

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Read the current `ci.yml`** to understand the job structure (job names, runs-on, action versions used).

- [ ] **Step 2: Run audit locally first** to know what to expect

Run: `pnpm audit --prod --audit-level=high`
Expected: either exit 0 (no HIGH/CRITICAL vulnerabilities) or a list of findings.

If findings:
- For each HIGH/CRITICAL: STOP and surface to the user. Do not bump prod deps unilaterally per the design doc's branch points.
- For LOW/MODERATE: continue with the plan; these don't fail the gate.

- [ ] **Step 3: Add the audit job**

Use Edit to append a new job after the existing job(s) in `ci.yml`. The job should:

```yaml
  audit:
    name: Audit
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9.15.0
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Audit production dependencies
        run: pnpm audit --prod --audit-level=high
```

(Adjust the `pnpm/action-setup` and `actions/setup-node` versions to match what the existing jobs use; Step 1's read tells you.)

- [ ] **Step 4: Verify the file is still valid YAML**

Run: `node -e "const y=require('js-yaml');const f=require('fs');console.log(y.load(f.readFileSync('.github/workflows/ci.yml','utf8')).jobs ? 'OK' : 'NO JOBS')"`
Expected: `OK`. If the parse fails, the indentation of the new job is off (YAML is whitespace-sensitive).

- [ ] **Step 5: Commit**

Run:
```bash
git add .github/workflows/ci.yml
git commit -m "$(cat <<'EOF'
ci: add audit job

Runs pnpm audit --prod --audit-level=high as a separate job parallel
to lint/test/build, so a fresh CVE doesn't gate unrelated PR feedback.
Threshold is HIGH+CRITICAL; LOW/MODERATE findings get tracked via
dependabot and ops/security.md instead.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Full local verification

**Files:** none (running commands only)

- [ ] **Step 1: Ensure background install (Task 0) is finished**

If still running, wait for it.

- [ ] **Step 2: Run the full CI pipeline**

Run: `pnpm ci`
Expected: lint + typecheck + test + build + size all pass. If any of these fail, this is the spec's claimed-but-unverified baseline failing — surface the failure rather than papering over it.

- [ ] **Step 3: Run audit again** (in case the lockfile was updated)

Run: `pnpm audit --prod --audit-level=high`
Expected: exit 0 (or surface findings per Task 10 Step 2 rules).

- [ ] **Step 4: Confirm Changesets**

Run: `pnpm changeset status`
Expected: 4 packages listed, each going to `0.1.0`.

- [ ] **Step 5: Confirm git log shape**

Run: `git log --oneline`
Expected: ~10 commits in this order:
1. chore: initial import of kit monorepo
2. chore: add .gitignore, .nvmrc, .npmrc
3. docs: add SETUP.md
4. docs: add CONTRIBUTING.md
5. chore: add PR and issue templates
6. chore: add dependabot config
7. chore: seed per-package CHANGELOG.md
8. chore: declare initial-release changeset
9. docs(ops): document npm trusted publisher setup
10. ci: add audit job

---

## Task 12: Commit the brainstorm spec and plan

**Files:**
- Existing untracked: `docs/superpowers/specs/2026-05-10-foundation-release-infra-design.md`
- Existing untracked: `docs/superpowers/plans/2026-05-10-foundation-release-infra.md`

- [ ] **Step 1: Stage and commit**

Run:
```bash
git add docs/superpowers/
git commit -m "$(cat <<'EOF'
docs(superpowers): add brainstorm spec and plan for foundation pass

Records the design and implementation plan that produced commits 2-10
in this branch, for traceability.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 2: Final `git log --oneline`**

Run: `git log --oneline`
Expected: 11 commits ending with the docs(superpowers) commit.

---

## Branch points (from spec)

These are not tasks — they're decision points that may interrupt the plan above:

- **`pnpm install` fails (Task 0 or Task 11)**: stop, surface error to user. Likely Windows-specific issue (sharp, native modules) or pnpm version mismatch.
- **`pnpm ci` fails (Task 11 Step 2)**: surface failure. The spec claimed this passes; a failure means the baseline assumption was wrong and the user needs to know.
- **Audit finds HIGH/CRITICAL (Task 10 Step 2 or Task 11 Step 3)**: STOP. List findings. Propose fix path per finding. Do not silently bump prod deps. DevDep bumps proceed unilaterally.
- **`pnpm changeset status` doesn't show 4 packages (Task 8 Step 2 or Task 11 Step 4)**: the changeset frontmatter package names are wrong; re-check.

## Out of scope (deferred, do not attempt)

- Section 3: mutation testing baseline.
- Section 4: `apps/integration/` workspace.
- Section 5: `apps/hooks-demo/` + Playwright + visual workflow.
- Any `git push`.
- Any actual npm trusted publisher configuration on npmjs.com (docs only).
- Any `pnpm changeset version` or `pnpm release` invocation.
- Any source modification in the four published packages.
