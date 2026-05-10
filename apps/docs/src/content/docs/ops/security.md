---
title: Security
description: Provenance, OIDC publishing, and how to report vulnerabilities.
---

## Trusted publishing

Every package in this repo publishes to npm via [OIDC trusted publishing](https://docs.npmjs.com/trusted-publishers) - no long-lived tokens stored anywhere. The release workflow exchanges a GitHub Actions OIDC token for a short-lived npm credential at publish time. Tokens cannot leak from CI logs because they don't exist as static values.

## Provenance attestations

Every published package includes a [provenance statement](https://docs.npmjs.com/generating-provenance-statements) cryptographically linking it to:

- The exact GitHub commit SHA
- The workflow file that built it
- The runner that executed it

Verify before installing:

```bash
npm audit signatures
```

## SLSA Level 3

The combination of OIDC + provenance + a hardened release workflow puts these packages at SLSA Build Level 3. The build is hermetic, the provenance is non-forgeable, and the publishing identity is bound to the source.

## Dependency hygiene

- `pnpm audit` runs in CI; high or critical advisories fail the build
- Dependabot opens PRs for security updates daily
- Dev dependencies are pinned with exact versions; runtime dependencies use `^` for patch flexibility
- New dependencies require an explicit justification in the changeset

## Reporting

If you find a vulnerability, please don't open a public issue. Email `security@arshadshah.com` or use GitHub's private disclosure feature on the repo. You'll get an acknowledgment within 48 hours.
