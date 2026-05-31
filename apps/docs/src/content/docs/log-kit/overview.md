---
title: log-kit overview
description: A small structured logger with pluggable transports and perf markers.
---

`log-kit` is a structured logger built around three ideas: records are plain JSON, transports are independent, and a failing transport never breaks the host application.

## The shape of a logger

```ts
import { createLogger } from "@arshad-shah/log-kit";
import { consoleTransport } from "@arshad-shah/log-kit/transports/console";

const log = createLogger({
  level: "info",
  context: { app: "my-service" },
  transports: [consoleTransport({ pretty: process.env.NODE_ENV !== "production" })],
});

log.info("Server started", { port: 3000 });
log.error(new Error("DB connection failed"));
```

## What you get

- **Six levels**: `trace` < `debug` < `info` < `warn` < `error` < `fatal`, plus `"silent"` to mute a logger entirely
- **Structured records** - every log is `{ timestamp, level, message, context, error? }` with optional first-class `scope`, `kind`, `meta`, and `args`. Plain JSON, transport-friendly
- **Child loggers** via `log.child({ requestId })` for context, or `log.child("manifest")` for nested string [scopes](/log-kit/host-loggers)
- **`log()` escape hatch** - build a record with full control (`meta`, `kind`, `args`) when wrapping log-kit in a [host logger](/log-kit/host-loggers)
- **Configurable timestamps** - ISO string (default), epoch ms, or a custom `(date) => string | number`
- **Perf markers** - `const ms = log.mark("op")()` emits a record with `durationMs` *and* returns it
- **Runtime transports** - `addTransport` / `removeTransport` without rebuilding the logger
- **Fan-out transports** - configure as many as you want; each gets every record above the threshold
- **Failure isolation** - a transport that throws or rejects never blocks others or surfaces errors to the caller

## Why structured

Every record is a plain object with stable keys. Aggregators (Loki, Datadog, OpenSearch) parse them without regex. You can grep them, jq them, ship them to a file. There's no separate "string template" formatter to bypass when you need machine-readable output later.

## What it doesn't do

- No log sampling (add it via a custom transport if you need it)
- No automatic correlation IDs (use `child()` and pass IDs explicitly)
- No log redaction (do this in your transport or upstream)
- No ANSI color in production output - JSON only when `pretty: false`

## Composition with other kits

`log-kit` is a primitive. fetch-kit can take a logger via `onError`. config-kit can take one via the `logger` option. Build a logger once at boot and inject it everywhere.
