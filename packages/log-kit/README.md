# @arshad-shah/log-kit

[![npm version](https://img.shields.io/npm/v/@arshad-shah/log-kit?color=cb3837&logo=npm)](https://www.npmjs.com/package/@arshad-shah/log-kit)
[![npm downloads](https://img.shields.io/npm/dm/@arshad-shah/log-kit?color=cb3837&logo=npm)](https://www.npmjs.com/package/@arshad-shah/log-kit)
[![Bundle size](https://img.shields.io/bundlephobia/minzip/@arshad-shah/log-kit?label=gzip)](https://bundlephobia.com/package/@arshad-shah/log-kit)
[![Types](https://img.shields.io/npm/types/@arshad-shah/log-kit?color=3178c6&logo=typescript&logoColor=white)](https://www.npmjs.com/package/@arshad-shah/log-kit)
[![License](https://img.shields.io/npm/l/@arshad-shah/log-kit)](../../LICENSE)
[![CI](https://github.com/arshad-shah/kit/actions/workflows/ci.yml/badge.svg)](https://github.com/arshad-shah/kit/actions/workflows/ci.yml)

Structured logger with pluggable transports and performance markers. Zero dependencies.

**~1.8 KB core, transports tree-shaken on separate subpath imports.**

```bash
pnpm add @arshad-shah/log-kit
```

## Quick example

```ts
import { createLogger } from "@arshad-shah/log-kit";
import { consoleTransport } from "@arshad-shah/log-kit/transports/console";

const log = createLogger({
  level: "info",
  context: { app: "my-service" },
  transports: [consoleTransport({ pretty: process.env.NODE_ENV !== "production" })],
  // Diagnostic channel - optional, fires when a transport write or flush fails.
  onTransportError: (err, info) => {
    console.error(`[log-kit] ${info.transport} ${info.op} failed`, err);
  },
});

log.info("Server started", { port: 3000 });

const end = log.mark("query.users");
const users = await db.users.find();
end({ count: users.length });
// → { level: "info", message: "query.users", context: { durationMs: 12, count: 50 } }
```

## Errors and causes

`log.error(err)` and `log.fatal(err)` accept an `Error` and capture `name`,
`message`, `stack`, the recursive `cause` chain (depth-capped at 3), and
Node-style `code` if present:

```ts
const inner = new Error("DB unreachable");
const outer = new Error("user save failed", { cause: inner });
log.error(outer);
// → record.error: { name, message: "user save failed", stack,
//                   cause: { name, message: "DB unreachable", stack } }
```

## Draining on shutdown

`flush()` returns a per-transport status so you can detect a partial drain
(e.g. before exiting a serverless handler):

```ts
const results = await log.flush();
const failed = results.filter((r) => !r.ok);
if (failed.length > 0) process.exitCode = 1;
```

## Transports

Each transport is a separate subpath import — tree-shaken away if unused:

- `@arshad-shah/log-kit/transports/console` — JSON or pretty-printed console output
- `@arshad-shah/log-kit/transports/http` — batched HTTP POST to any aggregator
- `@arshad-shah/log-kit/transports/file` — JSON Lines to disk (Node only). Concurrent writes are serialized internally so two records can never interleave on disk.
- `@arshad-shah/log-kit/transports/datadog` — Datadog Logs intake. Defaults `host` to `os.hostname()` on Node (falls back to `HOSTNAME`/`COMPUTERNAME` env vars), maps `level` to Datadog's canonical `status` field (`fatal` collapses to `error`).

The HTTP, file, and Datadog transports each expose an `onError` hook for
diagnostics. Or write your own — it's a `{ name, write, flush? }` object.

## Wrapping log-kit in a host logger

log-kit is built to sit *under* a host's own logger (a CLI, a build tool). The
escape hatches that make wrapping clean:

```ts
const root = createLogger({ scope: "app", timestamp: "epoch" });

// Named child loggers nest a string scope a transport can render as a prefix:
const manifest = root.child("manifest");      // scope: "app:manifest"

// log() gives full control of the record — meta (host passthrough), kind
// (presentation badge), and printf args — without abusing `context`:
manifest.log({
  level: "info",
  message: "built %s in %dms",
  args: ["index.js", 12],
  kind: "success",                 // your transport maps this to a green ✔
  meta: { entry: hostEntry },      // log-kit never reads this; transports can
});

// Timing hands the measured ms back so callers can reuse it:
const ms = root.mark("bundle")();

// Transports can be managed at runtime instead of rebuilt:
root.addTransport(myTransport);
root.removeTransport("console");

// Mute entirely instead of leaning on `trace`:
createLogger({ level: "silent" });
```

See [Host loggers](https://kit.arshadshah.com/log-kit/host-loggers) for the full
wrapping guide.

## What you get

- **Six levels** — `trace` < `debug` < `info` < `warn` < `error` < `fatal`, plus `"silent"` to mute
- **Structured records** — plain JSON, transport-friendly, with first-class `scope`, `kind`, `meta`, and `args`
- **`log()` escape hatch** — build a record with full control for host wrappers
- **Child loggers** — `log.child({ requestId })` for context, `log.child("manifest")` for nested string scopes (both inherit `onTransportError`)
- **Configurable timestamps** — ISO (default), epoch ms, or your own `(date) => …`
- **Perf markers** — one-line operation timing that returns the duration
- **Runtime transports** — `addTransport` / `removeTransport` without rebuilding
- **Stream routing** — `consoleTransport({ stream })` for stdout/stderr control
- **Failure isolation with observability** — a transport that throws never breaks the others, and `onTransportError` lets you see it

## Documentation

[https://kit.arshadshah.com/log-kit](https://kit.arshadshah.com/log-kit)

## License

MIT © Arshad Shah
