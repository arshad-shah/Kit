---
title: fetch-kit overview
description: A typed fetch wrapper with retries, timeouts, error classes, and React hooks.
---

`fetch-kit` is a thin layer over the platform's `fetch`. It does the boring-but-essential things you'd otherwise reach for axios or ky for, in ~3 KB.

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

The client gives you `get`, `post`, `put`, `patch`, `delete`, `head`, and `options`, plus a generic `request` for anything exotic. There's also `graphql()` for GraphQL operations and `invalidate()` / `clearCache()` for managing the response cache.

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

Importing from `@arshad-shah/fetch-kit/react` gives you `useFetch`, `useMutation`, and `useGraphQL`. They're thin - declarative state for loading/error/data with abort-on-unmount, layered over the client (so they share its response cache and dedupe):

```tsx
import { useFetch, useMutation, useGraphQL } from "@arshad-shah/fetch-kit/react";

const { data, error, loading, refetch } = useFetch<User>(api, "/users/me");
const { mutate, loading, error: mutationError } = useMutation<User, NewUser>(api, "/users");
const { data: me } = useGraphQL<{ me: User }>(api, `query { me { id name } }`);
```

See [React hooks](/fetch-kit/react-hooks/) for the full API. For richer server-state management - normalized caches, optimistic updates, background refetching - reach for TanStack Query.

## What it doesn't do

- No normalized cache, optimistic updates, or background refetching (use TanStack Query if you need them)
- No request/response transforms by default (predictable behaviour over clever defaults)
- No mock-mode or recording (pass a custom `fetch` for tests)
