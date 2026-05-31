---
title: Host loggers
description: Wrap log-kit underneath your own logger — scopes, presentation metadata, custom levels, timestamps, and runtime transports.
---

log-kit is designed to sit *underneath* a host's own logger — a CLI, a build tool, a framework — providing the structured-record plumbing while the host owns presentation and policy. These features make that wrapping clean, so you never have to smuggle host data through `context`.

## `log()` — the full-control escape hatch

The convenience methods (`info`, `warn`, …) take `(message, context?)`. To set the fields a wrapper needs — a presentation tag, a passthrough payload, printf args — use `log()`:

```ts
log.log({
  level: "info",
  message: "built %s in %dms",
  args: ["index.js", 12],     // printf args (rendered by the console transport)
  kind: "success",            // presentation tag — your transport picks a badge
  meta: { entry: hostEntry }, // host passthrough — log-kit never reads it
  context: { bytes: 4096 },   // the user's structured data
});
```

Every field lands on the [record](/log-kit/overview) as a first-class key:

```ts
{
  timestamp, level: "info", message: "built %s in %dms",
  args: ["index.js", 12],
  kind: "success",
  meta: { entry: hostEntry },
  context: { bytes: 4096 },
}
```

### `meta` vs `context`

`context` is the user's structured data — it merges with the logger's base context and child context. `meta` is **yours**: log-kit never reads, merges, or redacts it. It's the documented place to carry a host's own entry shape (the original call, presentation hints, a correlation object) to a custom transport, instead of overloading `context`.

### `kind` — presentation tags without custom levels

log-kit's six levels are fixed. When you need a category that isn't a severity — a green `✔ success`, a `skip`, a `note` — set `kind` and let a presentation transport map it to a badge or colour:

```ts
const badge = (record) => {
  if (record.kind === "success") return "✔";
  if (record.kind === "skip") return "ⷠ";
  return LEVEL_BADGE[record.level];
};
```

This keeps `level` meaning *severity* (for filtering and routing) while `kind` carries presentation.

## Named / scoped child loggers

`child(context)` adds context. `child(name)` nests a **string scope** that transports can render as a prefix — ideal for hierarchical CLI loggers:

```ts
const root = createLogger({ scope: "app" });
const manifest = root.child("manifest");        // scope: "app:manifest"
const write = manifest.child("write");          // scope: "app:manifest:write"

write.info("done");
// record.scope === "app:manifest:write"
```

Combine both forms — `child(name, context)` sets a scope and context together. Change the separator with `scopeSeparator` (default `":"`). The console transport renders the scope as a `[app:manifest]` prefix in pretty mode; JSON keeps it as a `scope` field.

## Configurable timestamps

The default timestamp is an ISO 8601 string. If your wire contract is epoch milliseconds — or anything else — set `timestamp`:

```ts
createLogger({ timestamp: "epoch" });             // record.timestamp = 1715342400000
createLogger({ timestamp: (d) => d.getTime() });  // same, explicit
createLogger({ timestamp: (d) => d.toUTCString() });
```

The formatter receives the raw `Date`, so the host keeps full control of the serialized shape without writing a transport just to rewrite timestamps.

## `silent` — fully mute

Set `level: "silent"` to disable output entirely — `isLevelEnabled` returns `false` for every level and nothing is emitted. Clearer than setting `trace` and relying on a transport to drop everything, and it lets a host that does its own gating turn log-kit off completely:

```ts
createLogger({ level: "silent" });
```

## Runtime transports

Transports are usually fixed at `createLogger`, but a host that lets users add or remove sinks at runtime can do so without rebuilding:

```ts
const log = createLogger();
log.addTransport(fileTransport({ path: "./run.log" }));
log.removeTransport("console"); // removes every transport named "console"; returns the count
log.removeTransport();          // no name → clears all
```

Children share the parent's transport set, including transports added later — so a scope created early still fans out to a sink registered afterwards.

## Timing that returns the duration

`mark()` logs the elapsed time *and* returns it, so a host's `timeEnd()`-style API can hand the number back to callers (see [Performance markers](/log-kit/perf-markers)):

```ts
const end = log.mark("bundle");
await bundle();
const ms = end({ files: 12 }); // logs { durationMs: ms, files: 12 } and returns ms
```

## Putting it together

A sketch of a host logger built on log-kit:

```ts
import { createLogger, type LogRecord } from "@arshad-shah/log-kit";

const presentationTransport = {
  name: "presentation",
  write: (r: LogRecord) => {
    const scope = r.scope ? `[${r.scope}] ` : "";
    const badge = r.kind === "success" ? "✔" : r.level.toUpperCase();
    render(badge, scope, r.message, r.args, r.meta);
  },
};

export function createHostLogger(scope?: string) {
  const log = createLogger({
    scope,
    level: "silent",            // host gates output itself
    timestamp: "epoch",
    transports: [presentationTransport],
  });

  return {
    child: (name: string) => createHostLogger(scope ? `${scope}:${name}` : name),
    success: (message: string, ...args: unknown[]) =>
      log.log({ level: "info", message, args, kind: "success" }),
    time: (label: string) => log.mark(label),
    // …
  };
}
```

No `context.__hostEntry` smuggling, no per-transport unpacking, no rebuilding the logger to change transports.
