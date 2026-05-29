---
"@arshad-shah/fetch-kit": patch
---

Fix: GraphQL responses containing `errors` are no longer written to the response cache. Because GraphQL servers return HTTP 200 even on failure, an errored envelope was previously cached and replayed (re-throwing `GraphQLError`) on every hit until the TTL expired — poisoning the cache and blocking a recovered server from being re-queried. Errored envelopes now bypass the cache so the next call hits the network again. Also dedupes the per-request `cache` option resolution internally (no behavior change).
