# kit

Foundation packages for side projects, each independently versioned and publishable to npm.

[![CI](https://github.com/arshad-shah/kit/actions/workflows/ci.yml/badge.svg)](https://github.com/arshad-shah/kit/actions/workflows/ci.yml)
[![Docs](https://img.shields.io/badge/docs-kit.arshadshah.com-blue)](https://kit.arshadshah.com)

## Packages

| Package | Description | Size (gzipped) |
|---|---|---|
| [`@arshad-shah/store-kit`](./packages/store-kit) | Typed Zustand factory with persistence and migrations | ~1.2 KB |
| [`@arshad-shah/fetch-kit`](./packages/fetch-kit) | Typed `fetch` client with retries, caching, dedupe, GraphQL, schema validation, React hooks | ~3 KB core, ~0.75 KB hooks |
| [`@arshad-shah/log-kit`](./packages/log-kit) | Structured logger with pluggable transports and perf markers | ~1.1 KB core |
| [`@arshad-shah/config-kit`](./packages/config-kit) | Typed config loading from `.env`, `process.env`, remote sources, and module-based config files | ~2 KB |

Each package can be used on its own. They compose cleanly when combined - fetch-kit can take a log-kit `Logger` for telemetry, config-kit can take one for source-load diagnostics, but neither has a hard dependency.

[Read the docs →](https://kit.arshadshah.com)

## Why this exists

Every side project hits the same plumbing in the first week: state that survives a refresh, HTTP calls that are cancellable and typed, structured logging that ships somewhere, and config validated at boot. These four packages do exactly that, with strict TypeScript, enforced bundle budgets, and 95%+ test coverage.

## Repository layout

```
.
├── packages/
│   ├── internal-config/     # Shared TS, build, test, lint config (private)
│   ├── store-kit/
│   ├── fetch-kit/
│   ├── log-kit/
│   └── config-kit/
├── apps/
│   └── docs/                # Astro Starlight docs site
├── .changeset/              # Release notes
└── .github/workflows/       # CI, release, docs deploy, mutation testing
```

## Development

```bash
pnpm install             # one-time setup
pnpm test                # run all tests across packages
pnpm test:coverage       # with coverage thresholds enforced
pnpm build               # build every package
pnpm lint                # Biome check
pnpm typecheck           # tsc --noEmit across packages
pnpm size                # enforce bundle size budgets
pnpm docs:dev            # run the docs site locally
```

## Contributing

The packages are shaped to stay small and focused. New features need a clear use case from real projects, not "this would be cool". Bundle budgets are not negotiable - if a feature genuinely needs bytes, the budget moves up in the same PR with a one-line justification.

Add a changeset with every PR that affects a published package:

```bash
pnpm changeset
```

## Project policies

- [Security policy & vulnerability reporting](SECURITY.md)
- [Code of conduct](CODE_OF_CONDUCT.md)
- [Getting help / Support](SUPPORT.md)
- [Contributing guide](CONTRIBUTING.md)

## License

MIT © Arshad Shah
