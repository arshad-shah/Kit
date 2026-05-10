---
title: Transports
description: Built-in transports for console, HTTP, file, and Datadog - or roll your own.
---

A transport is anything implementing `{ name, write, flush? }`. Configure as many as you want; each receives every record above the logger's level threshold.

## Console

Default if you don't pass any transports. JSON output by default, pretty-printed colored output with `pretty: true`:

```ts
import { consoleTransport } from "@arshad-shah/log-kit/transports/console";

consoleTransport({ pretty: process.env.NODE_ENV !== "production" });
```

Levels are routed to the matching `console` method - `trace`/`debug` → `console.debug`, `info` → `console.info`, `warn` → `console.warn`, `error`/`fatal` → `console.error`. Logging infra and browser devtools both pick this up correctly.

## HTTP

Batches records and POSTs them as JSON arrays. Designed for fire-and-forget telemetry to log aggregators:

```ts
import { httpTransport } from "@arshad-shah/log-kit/transports/http";

httpTransport({
  url: "https://logs.example.com/ingest",
  headers: { "x-api-key": process.env.LOG_KEY! },
  batchSize: 100,
  flushIntervalMs: 5000,
  level: "info",         // optional per-transport filter
});
```

Records buffer up to `batchSize` or `flushIntervalMs`, whichever comes first. Failed POSTs are dropped silently - the contract is fire-and-forget. Need at-least-once delivery? Persist to disk via the file transport first, then ship from there.

Call `await log.flush()` before process exit to drain the buffer.

## File

Appends records as JSON Lines to a local file. **Node only** - it dynamically imports `node:fs/promises`:

```ts
import { fileTransport } from "@arshad-shah/log-kit/transports/file";

fileTransport({ path: "./logs/app.log", batchSize: 50 });
```

JSON Lines is the standard format for log shippers like Vector, Fluent Bit, and Promtail. Tail the file from any of them.

## Datadog

Specialization over the HTTP transport with the Datadog endpoint and headers pre-configured:

```ts
import { datadogTransport } from "@arshad-shah/log-kit/transports/datadog";

datadogTransport({
  apiKey: process.env.DD_API_KEY!,
  service: "my-app",
  env: "production",
  site: "datadoghq.eu",  // or "datadoghq.com" (default)
  tags: ["region:eu", "team:platform"],
});
```

Each record is enriched with Datadog-required fields (`service`, `ddsource`, `ddtags`) before being shipped. The same batching and fail-soft semantics as `httpTransport` apply.

## Custom transports

Implement the interface:

```ts
import type { Transport } from "@arshad-shah/log-kit";

const myTransport: Transport = {
  name: "my-transport",
  write: (record) => {
    // sync or async, doesn't matter
    process.stderr.write(`${record.message}\n`);
  },
  flush: async () => {
    // optional
  },
};
```

Throwing in `write` is safe - errors are caught and ignored so other transports keep working.

## Composition

Mix freely:

```ts
const log = createLogger({
  level: "info",
  transports: [
    consoleTransport({ pretty: true }),         // dev: stdout
    fileTransport({ path: "./app.log" }),       // always: disk
    httpTransport({ url: "...", level: "warn" }), // prod: aggregator, warn+
  ],
});
```

Each transport runs independently. The HTTP transport's per-transport `level` filter is independent of the logger's threshold - the logger filters first, then each transport filters again.
