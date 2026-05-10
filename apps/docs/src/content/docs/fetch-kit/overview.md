---
title: fetch-kit overview
description: A typed fetch wrapper with retries, timeouts, error classes, and React hooks.
---

`fetch-kit` is a thin layer over the platform's `fetch`. It does the boring-but-essential things you'd otherwise reach for axios or ky for, in 2.5 KB.

## The shape of a client

```ts
import { createClient } from "@arshad-shah/fetch-kit";

export const api = createClient({
  baseUrl: "https://api.example.com",
  timeout: 10_000,
  retry: { attempts: 3, backoff: "exponential" },
  headers: { "x-app-version": APP_VERSION },
  auth: () => localStorage.getItem("token"),
  onError: (err) => logger.error(err),
});

const user = await api.get<User>("/users/me");
const created = await api.post<User>("/users", { name: "A" });
```

The client is plain - `get`, `post`, `put`, `patch`, `delete`, plus a generic `request` for anything exotic.

## The error hierarchy

Every error fetch-kit throws extends `FetchKitError`, so you can either catch broadly or check specific subclasses:

```ts
try {
  await api.get("/x");
} catch (err) {
  if (err instanceof HttpError && err.status === 404) handleNotFound();
  else if (err instanceof TimeoutError) showTimeoutToast();
  else if (err instanceof NetworkError) showOfflineBanner();
  else throw err;
}
```

See [Errors](/fetch-kit/errors/) for the full taxonomy.

## React hooks

Importing from `@arshad-shah/fetch-kit/react` gives you `useFetch` and `useMutation`. They're thin - declarative state for loading/error/data, abort-on-unmount, no caching:

```tsx
import { useFetch, useMutation } from "@arshad-shah/fetch-kit/react";

const { data, error, loading, refetch } = useFetch<User>(api, "/users/me");
const { mutate, loading, error: mutationError } = useMutation<User, NewUser>(api, "/users");
```

If you need caching, deduplication, or background refetching, pair fetch-kit with TanStack Query. The hooks here are for the simple case where a component owns a single request.

## What it doesn't do

- No response caching (use TanStack Query if you need it)
- No request deduplication
- No GraphQL helpers (it's `fetch`, GraphQL works fine - just POST a query)
- No mock-mode or recording (pass a custom `fetch` for tests)
