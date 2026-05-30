# @arshad-shah/config-kit

## 1.0.2

### Patch Changes

- [#38](https://github.com/arshad-shah/Kit/pull/38) [`acde61c`](https://github.com/arshad-shah/Kit/commit/acde61cfb072adc5d362698d7e1285162d8b3e81) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Fix: `parseDotenv` now accepts the optional `export ` prefix (e.g. `export FOO=bar`). Files that double as shell scripts commonly carry it; previously those lines were silently dropped because `export FOO` isn't a valid key. A genuine variable named `exportFOO` (no whitespace) is left untouched.

## 1.0.1

### Patch Changes

- [#23](https://github.com/arshad-shah/Kit/pull/23) [`e5b1ec5`](https://github.com/arshad-shah/Kit/commit/e5b1ec5b61e537fd44505db5f445056ab44396bf) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Add a badge row at the top of each package README (npm version, monthly downloads, gzipped bundle size, TypeScript types, license, CI status). Documentation only — no runtime changes. Improves discoverability on npmjs.com and gives a one-glance health snapshot before consumers scroll the docs.

- Updated dependencies [[`e5b1ec5`](https://github.com/arshad-shah/Kit/commit/e5b1ec5b61e537fd44505db5f445056ab44396bf)]:
  - @arshad-shah/log-kit@1.0.1

## 1.0.0

### Major Changes

- 6b920d1: First stable release: `config-kit` 1.0.0.

  Typed config loader: env vars, `.env` files, and remote sources merged with schema validation. Zero direct coupling to the other kits.

  Public surface (stable from this release):
  - `loadConfig({ schema, sources, onSourceError? })` — async loader. Returns a strongly-typed config inferred from the Zod schema (or any object with a compatible `.parse()` method). Sources are merged in declaration order; later sources win.
  - **Built-in sources**:
    - `processEnvSource()` — reads `process.env`.
    - `dotenvFileSource(path, { encoding? })` — parses a single `.env` file. `ENOENT` is soft-handled (file optional); permission errors, "is a directory", parse failures, and any other error surface via `onSourceError` instead of being silently treated as missing.
    - `remoteSource(fetcher)` — for secret managers and config services. Returned objects are flattened: strings stay strings; numbers and booleans coerce to strings (`{ PORT: 3000 } → { PORT: "3000" }`) so downstream `z.coerce.*` schemas work as expected; complex values (objects, arrays, `null`) are dropped since they have no unambiguous string form.
  - **Schema validation**: any validator with a `.parse(input): T` interface works (Zod is the most common). On failure, the parser's error is rethrown — `loadConfig` does not catch it.
  - **`.env` parser** handles quoted values, escape sequences, multiline values, and comment lines without pulling in a runtime dep.
  - **Diagnostics**: `onSourceError(err, { source: SourceDescriptor })` — fired when a source's `load()` throws. The source is treated as empty so the merge still completes; the hook lets you see why a key didn't show up.
  - **Optional logger integration**: pass an `@arshad-shah/log-kit` logger and validation/source diagnostics are forwarded to it instead of `console`. Declared as an optional peer; the dependency is not imported.
  - Bundle: 1.4 KB ESM gzipped (excluding Zod and the optional logger peer).

  Peer dependencies: `zod >=3.22.0` (required); `@arshad-shah/log-kit` (optional).

### Patch Changes

- Updated dependencies [6b920d1]
  - @arshad-shah/log-kit@1.0.0

## Unreleased

Initial release. See README for features.
