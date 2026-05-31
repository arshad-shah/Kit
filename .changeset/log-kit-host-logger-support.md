---
"@arshad-shah/log-kit": minor
---

Add the hooks needed to wrap log-kit underneath a host logger (CLIs, build tools) without smuggling data through `context`.

- **`log(input)`**: a full-control structured log method exposing first-class `meta` (host passthrough log-kit never reads), `kind` (presentation tag for badges, e.g. `success`), and `args` (printf-style) — alongside `level`, `message`, and `context`.
- **Record fields**: `LogRecord` gains optional `scope`, `kind`, `meta`, and `args`. Only attached when present, so existing records are unchanged.
- **Named / scoped child loggers**: `child(name)` and `child(name, context)` nest a string scope (`app:manifest`) that transports render as a prefix. New `scope` / `scopeSeparator` config.
- **Configurable timestamps**: `timestamp: "iso" | "epoch" | (date) => string | number`. `LogRecord.timestamp` widened to `string | number`.
- **`"silent"` level**: `level: "silent"` mutes the logger entirely instead of leaning on `trace`.
- **`mark()` returns the duration**: the closer now returns the measured `durationMs` (and still returns it when the level is disabled) so callers can reuse the number.
- **Runtime transports**: `logger.addTransport(t)` and `logger.removeTransport(name?)` (omit the name to clear all) — no need to rebuild the logger. Children share the parent's transport set, including transports added later.
- **Console transport**: `stream: "auto" | "stdout" | "stderr"` routing, printf rendering of `record.args`, and `scope`/`kind` prefixes in pretty output. Handles numeric timestamps.

Fully backwards compatible: existing record shape, level routing, child context, and APIs are unchanged.
