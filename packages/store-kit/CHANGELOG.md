# @arshad-shah/store-kit

## 1.0.3

### Patch Changes

- [#44](https://github.com/arshad-shah/Kit/pull/44) [`4f5d699`](https://github.com/arshad-shah/Kit/commit/4f5d6990be5b4fd13176c1a5615882f6b502a2f4) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Fix correctness bugs found in an audit:
  - **store-kit:** `reset()` (and `resetAllStores()`) no longer wipe a store's action methods. The reset used `setState(initial, true)` with `replace: true`, which deleted every action from the store; actions are now merged back in so they stay callable after a reset.
  - **fetch-kit:** a malformed error-response body (e.g. an HTML error page served with a JSON `Content-Type`) no longer throws an opaque `SyntaxError` that masks the status — the typed `HttpError` is thrown with the raw text as its `body`.
  - **fetch-kit:** an explicit `Content-Type` set on the client (or per request) now wins over the JSON type inferred from an object body, instead of being silently overridden.
  - **fetch-kit:** `createMemoryCache` with a non-positive `maxSize` now caches nothing instead of growing unbounded.

## 1.0.2

### Patch Changes

- [#38](https://github.com/arshad-shah/Kit/pull/38) [`acde61c`](https://github.com/arshad-shah/Kit/commit/acde61cfb072adc5d362698d7e1285162d8b3e81) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Performance: persisted stores no longer rewrite storage when the persisted slice is unchanged. A store with both persisted and transient fields previously re-serialized and wrote to storage on _every_ update — including transient changes the persisted slice didn't care about. Each write is now skipped when the serialized payload matches the last one, eliminating needless serialization and synchronous `localStorage` writes for high-frequency stores. The baseline is reseeded after `reset()` so a post-reset write is never wrongly skipped.

## 1.0.1

### Patch Changes

- [#23](https://github.com/arshad-shah/Kit/pull/23) [`e5b1ec5`](https://github.com/arshad-shah/Kit/commit/e5b1ec5b61e537fd44505db5f445056ab44396bf) Thanks [@arshad-shah](https://github.com/arshad-shah)! - Add a badge row at the top of each package README (npm version, monthly downloads, gzipped bundle size, TypeScript types, license, CI status). Documentation only — no runtime changes. Improves discoverability on npmjs.com and gives a one-glance health snapshot before consumers scroll the docs.

## 1.0.0

### Major Changes

- 6b920d1: First stable release: `store-kit` 1.0.0.

  A typed Zustand factory with persistence, versioned migrations, and devtools baked in. Designed as a leaf package: no runtime dependency on the other kits, no internal coupling.

  Public surface (stable from this release):
  - `createStore({ name, initial, actions, persist?, onError?, devtools? })` — typed store factory. `state` and `actions` are type-narrowed end-to-end; selectors keep their inferred return types.
  - **Persistence**: `persist: { storage: "local" | "session" | StorageLike, version, migrate? }`. Storage is pluggable — `localStorage` / `sessionStorage` are detected at runtime, and any object that implements `getItem` / `setItem` / `removeItem` works (memory shim, AsyncStorage adapter, etc.).
  - **Schema-validated migrations**: a `migrate` map keyed by source version returns the next-shape state. Hydration validates the envelope (`{ v, state }`) and refuses to write into a newer schema than the runtime knows about.
  - **Diagnostics**: `onError(err, { phase: "hydrate" | "persist" | "reset" })` — the store never crashes on storage failure; this hook is the only way to see what failed.
  - **Lifecycle**: `destroy()` unsubscribes the persistence listener (fixes a real leak in SSR-per-request stores); `reset()` no longer races itself.
  - **Tree-shakeable**: 1.1 KB gzipped (ESM, excluding Zustand).

  Peer dependency: `zustand >=4.5.0 <6.0.0`.

## Unreleased

Initial release. See README for features.
