# @arshad-shah/fetch-kit

Typed `fetch` client with retries, timeouts, schema validation, response caching, in-flight deduplication, GraphQL support, and React hooks. Native `fetch` under the hood — works in browsers, edge runtimes, Node 20+, Bun, and Deno.

```bash
pnpm add @arshad-shah/fetch-kit
# Optional: zod for schema validation, react for hooks
pnpm add zod react
```

## Quick example

```ts
import { createClient, HttpError } from "@arshad-shah/fetch-kit";

export const api = createClient({
  baseUrl: "https://api.example.com",
  timeout: 10_000,
  retry: { attempts: 3, backoff: "exponential" },
  // auth() returns the full Authorization header value - pick your scheme.
  auth: () => {
    const token = localStorage.getItem("token");
    return token ? `Bearer ${token}` : null;
  },
});

try {
  const user = await api.get<User>("/users/me");
} catch (err) {
  if (err instanceof HttpError && err.status === 401) {
    redirect("/login");
  }
}
```

### Auth schemes

`auth` is scheme-agnostic. It can return:

- A string — used as the `Authorization` header verbatim:
  ```ts
  auth: () => "Bearer xyz"     // Bearer (most common)
  auth: () => "Basic dXNlcjpwYXNz"
  auth: () => "Token xyz"       // GitHub-style
  auth: () => "raw-api-key"     // no scheme at all
  ```
- An object — for custom headers (API keys, etc.) or split scheme + token:
  ```ts
  auth: () => ({ header: "X-Api-Key", token: key })
  auth: () => ({ scheme: "Bearer", token: jwt })
  ```
- `null` / `undefined` — skip auth for this request (e.g. anonymous endpoints).

## Caching

Built-in LRU response cache with TTL. By default only GET requests are cached, and the cache is opt-in.

```ts
const api = createClient({
  baseUrl: "/api",
  cache: { ttl: 30_000, maxSize: 200 },
});

await api.get("/users");              // network
await api.get("/users");              // cache hit
await api.get("/users", { cache: false });          // bypass
await api.get("/users", { cache: { bypass: true } }); // fetch fresh + refill cache
await api.invalidate("GET /api/users");             // drop one entry
await api.clearCache();                              // drop everything
```

Bring your own store (sessionStorage, IndexedDB, Redis…):

```ts
const api = createClient({
  cache: {
    store: {
      get: async (key) => /* … */,
      set: async (key, entry) => /* … */,
      delete: async (key) => /* … */,
      clear: async () => /* … */,
    },
  },
});
```

## Request deduplication

Identical concurrent requests share a single in-flight fetch — no thundering herds when N components mount at once.

```ts
const api = createClient({ dedupe: true }); // on by default

// Both components trigger ONE fetch:
const [a, b] = await Promise.all([api.get("/users"), api.get("/users")]);
```

## GraphQL

GraphQL is built in. Configure an endpoint once and you get caching, dedupe, retry, schema validation, and typed errors for free.

```ts
import { createClient, GraphQLError } from "@arshad-shah/fetch-kit";

const api = createClient({
  baseUrl: "https://api.example.com",
  graphqlEndpoint: "/graphql",
  cache: true,
});

const data = await api.graphql<{ me: User }>(
  `query Me { me { id name } }`,
);

await api.graphql(`mutation Save($input: Input!) { save(input: $input) { id } }`, {
  variables: { input },
  operation: "mutation",
});
```

If the GraphQL response includes an `errors` array, `api.graphql(...)` throws a `GraphQLError` with the original error list and any partial `data`.

## React hooks

```tsx
import { useFetch, useGraphQL, useMutation } from "@arshad-shah/fetch-kit/react";

function Profile() {
  const { data, error, loading, refetch } = useFetch<User>(api, "/users/me");
  // ...
}

function Me() {
  const { data, loading } = useGraphQL<{ me: User }>(api, `query Me { me { id name } }`);
  // ...
}
```

## What you get

- **Typed errors** — `NetworkError`, `TimeoutError`, `AbortError`, `HttpError`, `ValidationError`, `GraphQLError` — `instanceof` everything
- **Configurable retry** with exponential, linear, or custom backoff
- **Response caching** — LRU+TTL by default, pluggable store
- **Request deduplication** — concurrent identical requests share one fetch
- **GraphQL** with cache + dedupe + typed errors out of the box
- **Schema validation** — drop in any library with a `parse` method (Zod, Valibot, ArkType)
- **Interceptors** for both requests and responses
- **Abort-on-unmount** baked into the React hooks

## Documentation

[https://kit.arshadshah.com/fetch-kit](https://kit.arshadshah.com/fetch-kit)

## License

MIT © Arshad Shah
