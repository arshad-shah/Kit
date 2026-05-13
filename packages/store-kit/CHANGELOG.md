# @arshad-shah/store-kit

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
