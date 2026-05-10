# @arshad-shah/log-kit

Structured logger with pluggable transports and performance markers. Zero dependencies.

**1.4 KB core, transports tree-shaken on separate subpath imports.**

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
});

log.info("Server started", { port: 3000 });

const end = log.mark("query.users");
const users = await db.users.find();
end({ count: users.length });
// → { level: "info", message: "query.users", context: { durationMs: 12, count: 50 } }
```

## Transports

Each transport is a separate subpath import - tree-shaken away if unused:

- `@arshad-shah/log-kit/transports/console` - JSON or pretty-printed console output
- `@arshad-shah/log-kit/transports/http` - batched HTTP POST to any aggregator
- `@arshad-shah/log-kit/transports/file` - JSON Lines to disk (Node only)
- `@arshad-shah/log-kit/transports/datadog` - Datadog Logs intake

Or write your own - it's a `{ name, write, flush? }` object.

## What you get

- **Six levels** - `trace` < `debug` < `info` < `warn` < `error` < `fatal`
- **Structured records** - plain JSON, transport-friendly
- **Child loggers** - `log.child({ requestId })` for scoped context
- **Perf markers** - one-line operation timing
- **Failure isolation** - a transport that throws never breaks others

## Documentation

[https://kit.arshadshah.com/log-kit](https://kit.arshadshah.com/log-kit)

## License

MIT © Arshad Shah
