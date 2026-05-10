---
title: Persistence
description: Storage backends, partialize, custom serialization, and SSR safety.
---

State persistence is opt-in via the `persist` config. Omit it and you get an in-memory store that resets on reload.

## Storage backends

Four built-in backends:

```ts
persist: { storage: "local" }     // localStorage (default)
persist: { storage: "session" }   // sessionStorage
persist: { storage: "memory" }    // per-store Map - useful for SSR/tests
persist: { storage: customImpl }  // any KitStorage object
```

All four implement the same interface. The custom option is how you'd plug in IndexedDB, AsyncStorage (React Native), or a remote store.

## Fail-soft behaviour

Storage access can fail in surprising places: Safari private mode, sandboxed iframes, blocked third-party cookies, quota errors. `store-kit` treats these as soft failures - the store keeps working with in-memory state, never throws.

If you need to know about a failure, wrap your own writes around `setState` or use a custom storage backend that surfaces errors how you want.

## Partializing

Sometimes only part of state should persist (e.g. UI prefs yes, in-flight upload progress no):

```ts
createStore({
  name: "app",
  initial: {
    theme: "dark",
    sidebar: "open",
    uploadProgress: 0,    // ephemeral
    activeUploads: [],    // ephemeral
  },
  persist: {
    storage: "local",
    version: 1,
    partialize: (s) => ({ theme: s.theme, sidebar: s.sidebar }),
  },
});
```

## Custom serialization

By default, state is JSON-encoded. For Maps, Sets, BigInts, or Dates, provide custom serde:

```ts
persist: {
  storage: "local",
  version: 1,
  serialize: (v) => superjson.stringify(v),
  deserialize: (v) => superjson.parse(v),
}
```

## SSR

In Node, `localStorage` and `sessionStorage` are undefined. `store-kit` automatically falls back to memory storage when run server-side, so creating a store at module scope doesn't crash. Hydrate from real persisted state on the client when the component mounts.

## Async storage

Async backends (`getItem` returning a promise) work for writes but **not for synchronous initial hydration**. The first render uses initial state; the persisted data hydrates on the next tick. If you need synchronous hydration, use a sync storage layer (e.g. localStorage cached from IndexedDB).
