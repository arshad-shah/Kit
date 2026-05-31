# @arshad-shah/log-kit

## 1.1.0

### Minor Changes

- [#46](https://github.com/arshad-shah/Kit/pull/46) [`24ef603`](https://github.com/arshad-shah/Kit/commit/24ef60343fdc3b966d8d3a21ecf622f63e268fb9) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Add the hooks needed to wrap log-kit underneath a host logger (CLIs, build tools) without smuggling data through `context`.
  - **`log(input)`**: a full-control structured log method exposing first-class `meta` (host passthrough log-kit never reads), `kind` (presentation tag for badges, e.g. `success`), and `args` (printf-style) — alongside `level`, `message`, and `context`.
  - **Record fields**: `LogRecord` gains optional `scope`, `kind`, `meta`, and `args`. Only attached when present, so existing records are unchanged.
  - **Named / scoped child loggers**: `child(name)` and `child(name, context)` nest a string scope (`app:manifest`) that transports render as a prefix. New `scope` / `scopeSeparator` config.
  - **Configurable timestamps**: `timestamp: "iso" | "epoch" | (date) => string | number`. `LogRecord.timestamp` widened to `string | number`.
  - **`"silent"` level**: `level: "silent"` mutes the logger entirely instead of leaning on `trace`.
  - **`mark()` returns the duration**: the closer now returns the measured `durationMs` (and still returns it when the level is disabled) so callers can reuse the number.
  - **Runtime transports**: `logger.addTransport(t)` and `logger.removeTransport(name?)` (omit the name to clear all) — no need to rebuild the logger. Children share the parent's transport set, including transports added later.
  - **Console transport**: `stream: "auto" | "stdout" | "stderr"` routing, printf rendering of `record.args`, and `scope`/`kind` prefixes in pretty output. Handles numeric timestamps.

  Fully backwards compatible: existing record shape, level routing, child context, and APIs are unchanged.

## 1.0.1

### Patch Changes

- [#23](https://github.com/arshad-shah/Kit/pull/23) [`e5b1ec5`](https://github.com/arshad-shah/Kit/commit/e5b1ec5b61e537fd44505db5f445056ab44396bf) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Add a badge row at the top of each package README (npm version, monthly downloads, gzipped bundle size, TypeScript types, license, CI status). Documentation only — no runtime changes. Improves discoverability on npmjs.com and gives a one-glance health snapshot before consumers scroll the docs.

## 1.0.0

### Major Changes

- 6b920d1: First stable release: `log-kit` 1.0.0.

  Tiny structured logger with pluggable transports and perf markers. Zero runtime dependencies, zero peers.

  Public surface (stable from this release):
  - `createLogger({ level, transports, context?, onTransportError? })` — typed logger with `trace`/`debug`/`info`/`warn`/`error`/`fatal` levels. Levels collapse to four canonical buckets when shipped to Datadog (no `fatal` channel there).
  - **Child loggers**: `logger.child({ requestId, userId })` produces a logger whose context is merged into every record. Children inherit `level`, `transports`, and `onTransportError` from the parent.
  - **Perf markers**: `const end = logger.mark("server.boot"); end({ port: 3000 })` emits a structured record with `durationMs`. Markers are cheap (`performance.now()`-based) and tree-shakeable.
  - **Pluggable transports** — subpath imports, tree-shaken to only what you import:
    - `@arshad-shah/log-kit/transports/console` — pretty-printed in development, JSON in production.
    - `@arshad-shah/log-kit/transports/http` — batched POST with backoff and an `onError` hook.
    - `@arshad-shah/log-kit/transports/file` — append-only JSONL with a serialized write queue (no `PIPE_BUF` interleaving).
    - `@arshad-shah/log-kit/transports/datadog` — maps `level` to Datadog's canonical `status` field, defaults `host` to `os.hostname()` when running on Node.
  - **`logger.flush(): Promise<TransportStatus[]>`** — returns per-transport results so serverless shutdown hooks can detect failures instead of silently exiting.
  - **Error serialization** preserves `cause` chains (TC39 standard, depth-capped to 3) and Node's `code` property — neither of which the default JSON serializer keeps.
  - **Diagnostics**: `onTransportError(err, { transport, op })` at the logger level, plus per-transport `onError` hooks on file/HTTP/Datadog. Transport failures are still swallowed so logging never crashes the app — these hooks are purely for observability.
  - Bundle: 1.1 KB core, 0.4–1.0 KB per transport (gzipped).

  No peer dependencies. Node 20.11+ for built-in transports; the core works in any modern runtime.

## Unreleased

Initial release. See README for features.
