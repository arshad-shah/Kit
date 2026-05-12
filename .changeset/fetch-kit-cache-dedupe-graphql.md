---
"@arshad-shah/fetch-kit": minor
---

fetch-kit: response caching, request deduplication, GraphQL support, and a scheme-agnostic auth contract.

- `cache`: opt-in LRU+TTL cache with pluggable store (in-memory by default, bring your own for `sessionStorage` / IndexedDB / Redis). Per-request `cache: false | { ttl, key, bypass }` overrides; mutations never cached unless opted in. New `client.invalidate(key)` and `client.clearCache()` helpers.
- `dedupe`: in-flight identical GET/query requests share one fetch by default. Globally toggleable; opt in/out per request.
- `graphql`: built-in `client.graphql(query, options)` with typed `GraphQLError` (preserves partial `data` + error list). Integrates with the cache and dedupe (queries are cached, mutations are not). New `useGraphQL` React hook.
- **BREAKING (auth)**: `auth()` is no longer hardcoded to `Bearer`. The returned string is now used as the `Authorization` header value verbatim, so callers control the scheme:
  ```ts
  // Before
  auth: () => token                          // → "Authorization: Bearer <token>"
  // After
  auth: () => `Bearer ${token}`              // → "Authorization: Bearer <token>"
  auth: () => `Token ${token}`               // → "Authorization: Token <token>"
  auth: () => token                          // → "Authorization: <token>"   (raw key)
  auth: () => ({ header: "X-Api-Key", token })       // → "X-Api-Key: <token>"
  auth: () => ({ scheme: "Bearer", token })          // → "Authorization: Bearer <token>"
  ```
  Migration: prepend `` `Bearer ${...}` `` to existing `auth()` returns to keep the previous behavior.
- Bumped direct devDependencies (tsup, vitest, size-limit, jsdom, zustand, zod, @types/node) and added pnpm overrides for transitive vulnerable packages (esbuild, ajv, yaml, vite, tmp). `pnpm audit` is now clean.
