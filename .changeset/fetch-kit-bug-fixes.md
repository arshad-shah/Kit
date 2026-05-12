---
"@arshad-shah/fetch-kit": minor
---

fetch-kit: fix six bugs found during a staff review.

- **Dedupe + AbortSignal isolation (correctness)**: when two callers shared an in-flight request via dedupe, aborting one used to cancel the underlying fetch and surface `AbortError` to the others. Now each caller's signal is isolated — your own abort throws only to you, and the underlying fetch is cancelled only after every sharer has aborted. The shared entry is also evicted eagerly so a fresh call after a full abort doesn't subscribe to a dead request.
- **`useFetch` / `useGraphQL` stale-response race (correctness)**: when `deps` changed before a previous request completed, the stale response could overwrite the new state. The in-flight request is now aborted on dep change/unmount, and a request-id guard drops stale resolutions on the floor.
- **`combineSignals` listener leak**: abort listeners attached to a caller's long-lived `AbortSignal` are now removed after each request settles, so long-lived signals issuing many requests no longer accumulate dead listeners holding closures over internal state.
- **GraphQL `cache.key` override now respected**: previously the auto-generated GraphQL cache key always won over a user-supplied `options.cache.key`. The user-supplied key now wins, matching HTTP behavior.
- **`cache: { ttl: 0 }` now disables caching** instead of writing entries that are dead on arrival.
- **`HEAD` and `OPTIONS` are now first-class methods**: `client.head()` and `client.options()` exist, are typed, and `HEAD` is treated as a safe/idempotent read (eligible for cache + dedupe like GET).

All six are covered by tests added in the same change (TDD: tests reproduced each bug before the fix).
