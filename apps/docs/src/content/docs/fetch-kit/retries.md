---
title: Retries
description: Backoff strategies, retry predicates, and what's retried by default.
---

Retries are off by default. Opt in by passing `retry`:

```ts
const api = createClient({
  retry: { attempts: 3, backoff: "exponential" },
});
```

## Backoff strategies

- **`"exponential"`** (default) - 100ms, 200ms, 400ms, 800ms... capped at 30 seconds
- **`"linear"`** - 100ms, 200ms, 300ms... capped at 30 seconds
- **`(attempt) => ms`** - custom function for full control

## What's retried by default

The default predicate retries transient failures only:

| Error               | Retried? |
|---------------------|----------|
| `NetworkError`      | yes |
| 5xx HTTP            | yes |
| 408 Request Timeout | yes |
| 429 Too Many        | yes |
| Other 4xx           | no  |
| `AbortError`        | no  |
| `ValidationError`   | no  |

The reasoning: 4xx errors are deterministic - retrying without changing the request gives the same answer. Aborts and validation errors are explicit and never retried.

## Custom retry predicate

For finer control, pass a `retryOn` function:

```ts
retry: {
  attempts: 5,
  backoff: "exponential",
  retryOn: (err, attempt) => {
    if (err instanceof HttpError && err.status === 503) return true;
    return false;
  },
}
```

The predicate gets the 1-indexed attempt number, so you can give up after a certain count even when the error type would normally retry.

## Per-request override

Override the client default for one call:

```ts
await api.get("/x", {
  retry: { attempts: 0 }, // disable retries for this request
});
```

## What you might want next

fetch-kit covers retries, response caching, and in-flight request deduplication out of the box. If you need richer server-state management - optimistic updates with rollback, normalized caches, or background refetching - that's TanStack Query territory. fetch-kit deliberately stops short of that.
