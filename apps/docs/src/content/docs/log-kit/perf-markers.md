---
title: Performance markers
description: Measure operation duration with one line of code.
---

Most performance measurement code looks like this:

```ts
const start = performance.now();
const result = await db.query(sql);
const durationMs = performance.now() - start;
log.info("query.users", { durationMs, count: result.length });
```

Five lines for one measurement. `log.mark()` collapses it to two:

```ts
const end = log.mark("query.users");
const result = await db.query(sql);
end({ count: result.length });
```

The returned function captures the start time. Calling it emits a record with `durationMs` automatically computed and any extra context merged in.

It also **returns the measured duration**, so you can reuse the number without reading it back off the record:

```ts
const end = log.mark("query.users");
const result = await db.query(sql);
const ms = end({ count: result.length }); // logs, and ms is yours to reuse
metrics.observe("db_query_ms", ms);
```

The duration is returned even when the mark's level is disabled (no record is emitted in that case), so timing code composes regardless of log level.

## Custom level

Marks default to `info` level. For high-volume measurements, drop to `debug`:

```ts
const end = log.mark("hot.path", { level: "debug" });
hotFunction();
end();
```

## Try/finally pattern

Marks aren't strictly tied to success - call `end()` from a `finally` block to measure failed operations too:

```ts
const end = log.mark("api.call");
try {
  await api.get("/x");
} finally {
  end();
}
```

If you want the failure case in a different record, branch:

```ts
const end = log.mark("api.call");
try {
  const data = await api.get("/x");
  end({ ok: true, size: data.length });
  return data;
} catch (err) {
  end({ ok: false });
  throw err;
}
```

## Nested marks

Marks compose. The outer measurement includes everything inside:

```ts
const total = log.mark("request.handle");
const auth = log.mark("request.auth");
await checkAuth();
auth();

const work = log.mark("request.work");
const result = await doWork();
work({ size: result.length });

total();
```

## What about real APM?

Marks are a coarse measurement primitive, not distributed tracing. If you need spans, parent/child relationships, or W3C tracecontext propagation, integrate OpenTelemetry. Keep marks for the lighter "how long did this take" question that you reach for ten times a day.
