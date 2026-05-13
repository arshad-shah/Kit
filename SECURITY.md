# Security Policy

## Supported versions

Each package follows independent semver. The latest minor of the latest major is supported with security fixes. Older majors are only patched at the maintainer's discretion.

| Package                       | Supported          |
| ----------------------------- | ------------------ |
| `@arshad-shah/store-kit`      | latest `1.x`       |
| `@arshad-shah/fetch-kit`      | latest `1.x`       |
| `@arshad-shah/log-kit`        | latest `1.x`       |
| `@arshad-shah/config-kit`     | latest `1.x`       |

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Use GitHub's [private vulnerability reporting](https://github.com/arshad-shah/kit/security/advisories/new) on this repo, or email `security@arshadshah.com`.

You'll receive an acknowledgment within 72 hours and a remediation plan or rejection rationale within 7 days. Coordinated disclosure: once a fix is released, the advisory is published with a CVE if appropriate.

## Supply chain hardening

- **OIDC trusted publishing**: every release is published from a hardened GitHub Actions workflow using a short-lived npm credential exchanged for a GitHub OIDC token. No long-lived `NPM_TOKEN` lives in CI after bootstrap. See [`apps/docs/src/content/docs/ops/security.md`](apps/docs/src/content/docs/ops/security.md) for the trusted-publisher setup.
- **Provenance attestations**: every tarball is published with `--provenance`, cryptographically linking it to the commit SHA, the workflow file, and the runner. Verify with `npm audit signatures`.
- **SHA-pinned actions**: every third-party GitHub Action is pinned to a commit SHA, not a floating tag. Updates flow through Dependabot.
- **`pnpm audit --audit-level=high`** runs as a dedicated CI job on every PR; high or critical advisories fail the build.
- **CodeQL** scans the TypeScript surface on every PR and on a weekly schedule.
- **CODEOWNERS** require maintainer review on every CI workflow, lockfile, and published `package.json`.
- **Dependabot** raises grouped weekly PRs for non-security updates and immediate PRs for security advisories.

## What is in scope

- Runtime vulnerabilities in published `dist/` output of any of the four packages.
- Build/publish pipeline vulnerabilities that could lead to unauthorized package publication.
- Vulnerabilities in `pnpm-lock.yaml` (transitive deps) that affect production code.

## What is out of scope

- Vulnerabilities only reproducible in the dev/test/build toolchain (Vitest, Stryker, Astro, etc.) without a path to production code.
- Issues in the docs site that don't expose data.
- Theoretical attacks requiring write access to the repo or maintainer credentials.
