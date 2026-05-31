---
title: Errors
description: Typed error classes for predictable handling.
---

Every error thrown by fetch-kit extends `FetchKitError`. Subclasses let you discriminate without parsing strings.

## The hierarchy

```
FetchKitError                       // base, never thrown directly
├── NetworkError                    // DNS, offline, CORS, refused
├── TimeoutError                    // exceeded configured timeout
├── AbortError                      // external signal aborted the request
├── HttpError                       // non-2xx status code
├── ValidationError                 // schema validation failed
└── GraphQLError                    // GraphQL response carried an errors array
```

## When each is thrown

**`NetworkError`** - the browser/runtime couldn't reach the server. The original error is on `cause`. Retried by default.

**`TimeoutError`** - the request exceeded its timeout. Has `timeoutMs` for context. Not retried by default - a timeout aborts the in-flight request; opt in with a custom `retryOn` if you want timeouts retried.

**`AbortError`** - an external `AbortSignal` (component unmount, manual cancel) aborted the request. Never retried.

**`HttpError`** - the server responded, but with a non-2xx status. Exposes:

```ts
error.status        // 404
error.statusText    // "Not Found"
error.response      // the full Response object
error.body          // parsed body (JSON, text, or Blob)
error.isClientError // 4xx
error.isServerError // 5xx
```

5xx, 408, and 429 are retried by default; other 4xx are not.

**`ValidationError`** - the response body failed schema validation. The validator's issues are on `issues`. Never retried (the server already sent the bad data; retrying won't fix it).

**`GraphQLError`** - a `client.graphql()` (or `useGraphQL`) call got an HTTP 2xx response whose body carried a non-empty `errors` array. Exposes:

```ts
error.errors  // the GraphQL spec error entries: { message, locations?, path?, extensions? }
error.data    // any partial data the server returned alongside the errors
```

Never retried by default (the transport succeeded; the error is in the payload).

## A practical handler

```ts
import {
  HttpError,
  NetworkError,
  TimeoutError,
  ValidationError,
} from "@arshad-shah/fetch-kit";

function handle(err: unknown) {
  if (err instanceof HttpError) {
    if (err.status === 401) return redirect("/login");
    if (err.status === 403) return showToast("Permission denied");
    if (err.status === 404) return show404();
    if (err.isServerError) return showRetryToast();
    return showGenericError();
  }
  if (err instanceof NetworkError) return showOfflineBanner();
  if (err instanceof TimeoutError) return showTimeoutToast();
  if (err instanceof ValidationError) return reportToBackend(err);
  throw err; // unknown - re-raise so error boundary catches it
}
```
