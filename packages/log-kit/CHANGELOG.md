# @arshad-shah/log-kit

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
