---
"@arshad-shah/fetch-kit": major
---

First stable release: `fetch-kit` 1.0.0.

Typed `fetch` client with retries, timeouts, schema validation, response caching, request deduplication, GraphQL, and React hooks. Zero runtime dependencies; React and Zod are optional peers.

Public surface (stable from this release):

- `createClient({ baseUrl, timeout?, retry?, auth?, headers?, cache?, dedupe?, hooks? })` — typed factory returning `.get` / `.post` / `.put` / `.patch` / `.delete` / `.head` / `.options` / `.graphql` / `.invalidate` / `.clearCache`.
- **All HTTP verbs are first-class**, including `HEAD` and `OPTIONS`. `HEAD` is treated as a safe/idempotent read (eligible for cache + dedupe like `GET`).
- **Retries**: `retry: { attempts, backoff: "exponential" | "linear" | (attempt) => ms, retryOn?: (err, attempt) => boolean }`. Default policy retries idempotent methods on network errors and 5xx with exponential backoff and jitter.
- **Timeouts** are per-request; `AbortSignal` is honored and composed with the timeout signal without leaking listeners (`combineSignals` removes its listeners after each request settles).
- **Schema validation**: pass `schema: { parse: (json) => T }` per request or per client. Any validator that exposes `.parse()` works; the inferred `T` flows through.
- **Auth contract is scheme-agnostic**: `auth: () => string | null | Promise<...>` returns the full `Authorization` header value verbatim. Callers control the scheme (`Bearer`, `Basic`, `DPoP`, `mac`, ...). Earlier prereleases hardcoded `Bearer`; that's gone.
- **Response cache**: opt-in LRU+TTL with a pluggable store (in-memory by default; bring your own for `sessionStorage` / IndexedDB / Redis). Per-request override: `cache: false | { ttl, key, bypass }`. Mutations are never cached unless explicitly opted in. `cache: { ttl: 0 }` disables caching (no longer writes dead-on-arrival entries). `client.invalidate(key)` and `client.clearCache()` for manual control.
- **Request deduplication**: in-flight identical GET/query requests share one fetch by default. Per-caller `AbortSignal` isolation — your own abort only throws to you; the underlying fetch is cancelled only after every sharer aborts. Shared entries are evicted eagerly so a fresh call after a full abort starts a new request.
- **GraphQL**: `client.graphql(query, options)` returns typed results with a typed `GraphQLError` (preserves partial `data` alongside the error list). User-supplied `cache.key` wins over the auto-generated one (matches HTTP behavior). Queries are cached; mutations are not.
- **React hooks** (`@arshad-shah/fetch-kit/react`):
  - `useFetch(client, path, options)` — declarative GET with `data` / `error` / `loading` / `refetch`. Stale-response races on dep change are blocked by a request-id guard; in-flight requests abort on dep change or unmount.
  - `useMutation(client, mutator)` — imperative POST/PUT/PATCH/DELETE.
  - `useGraphQL(client, query, options)` — same lifecycle as `useFetch`, GraphQL-shaped.
- **Bundle**: 2.97 KB core (ESM), 0.75 KB React hooks (gzipped, peer-excluded).

Peer dependencies: `react >=18.0.0` (optional, only needed for the `/react` entry); `zod >=3.22.0` (optional, only if you use schema validation).
