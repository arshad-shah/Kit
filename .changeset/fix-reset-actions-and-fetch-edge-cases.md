---
"@arshad-shah/store-kit": patch
"@arshad-shah/fetch-kit": patch
---

Fix correctness bugs found in an audit:

- **store-kit:** `reset()` (and `resetAllStores()`) no longer wipe a store's action methods. The reset used `setState(initial, true)` with `replace: true`, which deleted every action from the store; actions are now merged back in so they stay callable after a reset.
- **fetch-kit:** a malformed error-response body (e.g. an HTML error page served with a JSON `Content-Type`) no longer throws an opaque `SyntaxError` that masks the status — the typed `HttpError` is thrown with the raw text as its `body`.
- **fetch-kit:** an explicit `Content-Type` set on the client (or per request) now wins over the JSON type inferred from an object body, instead of being silently overridden.
- **fetch-kit:** `createMemoryCache` with a non-positive `maxSize` now caches nothing instead of growing unbounded.
