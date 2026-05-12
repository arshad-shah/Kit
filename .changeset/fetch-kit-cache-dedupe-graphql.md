---
"@arshad-shah/fetch-kit": minor
---

fetch-kit: response caching, request deduplication, and GraphQL support out of the box.

- `cache`: opt-in LRU+TTL cache with pluggable store (in-memory by default, bring your own for `sessionStorage` / IndexedDB / Redis). Per-request `cache: false | { ttl, key, bypass }` overrides; mutations never cached unless opted in. New `client.invalidate(key)` and `client.clearCache()` helpers.
- `dedupe`: in-flight identical GET/query requests share one fetch by default. Globally toggleable; opt in/out per request.
- `graphql`: built-in `client.graphql(query, options)` with typed `GraphQLError` (preserves partial `data` + error list). Integrates with the cache and dedupe (queries are cached, mutations are not). New `useGraphQL` React hook.
- Bumped direct devDependencies (tsup, vitest, size-limit, jsdom, zustand, zod, @types/node) and added pnpm overrides for transitive vulnerable packages (esbuild, ajv, yaml, vite, tmp). `pnpm audit` is now clean.
