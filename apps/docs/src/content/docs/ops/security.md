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

## Configuring trusted publishers

Trusted publishing only works after the npm side knows which workflow to trust. Configure each package once, on npmjs.com:

1. Sign in to [npmjs.com](https://www.npmjs.com/) as a maintainer.
2. Open the package page → Settings → Publishing.
3. Add trusted publisher with:
    - **Publisher**: GitHub Actions
    - **Organization or user**: `arshad-shah`
    - **Repository**: `kit`
    - **Workflow filename**: `release.yml`
    - **Environment**: leave empty (the release workflow does not declare one)
4. Save.

Repeat for each of `@arshad-shah/store-kit`, `@arshad-shah/fetch-kit`, `@arshad-shah/log-kit`, and `@arshad-shah/config-kit`. After this, every merged Changesets release PR triggers a publish that npm authenticates against the OIDC token issued by GitHub for that exact workflow + repo + branch combination.

## First release of a new package

Trusted publishers can only be configured after a package exists on npm. The first publish of any new package needs an alternative auth path:

1. Generate a [granular access token](https://www.npmjs.com/) on npmjs.com scoped to the package and the `automation` purpose. Use the shortest expiry that lets you complete the bootstrap.
2. Add it as a repository secret named `NPM_TOKEN`.
3. Temporarily add `NPM_TOKEN: ${{ secrets.NPM_TOKEN }}` under the `env:` block of the "Create release PR or publish to npm" step in `.github/workflows/release.yml`.
4. Merge the release PR. The package publishes for the first time using the token.
5. Configure the trusted publisher on npmjs.com per the steps above.
6. Revert the workflow change. Delete the `NPM_TOKEN` repository secret. Revoke the token on npmjs.com.

Future releases of that package use OIDC.

## Dependency hygiene

- `pnpm audit --audit-level=high` runs as a dedicated job in CI; high or critical advisories fail the build
- Dependabot opens grouped PRs weekly for non-security updates and immediate PRs for security advisories
- Dev dependencies are pinned with exact versions; runtime dependencies use `^` for patch flexibility
- New dependencies require an explicit justification in the changeset

## Reporting

If you find a vulnerability, please don't open a public issue. Email `security@arshadshah.com` or use GitHub's private disclosure feature on the repo. You'll get an acknowledgment within 48 hours.
