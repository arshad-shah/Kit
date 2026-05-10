---
title: store-kit overview
description: A typed Zustand factory with persistence, migrations, devtools, and reset baked in.
---

`store-kit` is a thin factory over [Zustand](https://github.com/pmndrs/zustand). It bakes in conventions you'd reach for anyway, so creating a new store takes one call instead of ten lines of middleware composition.

## The shape of a store

```ts
import { createStore } from "@arshad-shah/store-kit";

const useUser = createStore({
  name: "user",                // unique storage key + devtools label
  initial: { id: null, prefs: {} },
  actions: (set, get) => ({
    setUser: (id: string) => set({ id }),
    clear: () => set({ id: null, prefs: {} }),
  }),
  persist: { storage: "local", version: 1 },
  devtools: true,              // defaults to true in development
});
```

The returned hook is a regular Zustand hook with two extras: `reset()` (clears state and persisted data) and `destroy()` (removes from the global registry).

## What you get

- **Typed actions** - the `actions` callback receives properly-typed `set` and `get`; the returned object is merged into the store
- **Persistence** - synchronous and async storage backends supported (`localStorage`, `sessionStorage`, `memory`, or any `KitStorage` implementation)
- **Versioned migrations** - bump `version` and add a migration; old persisted state is upgraded on hydration
- **Devtools** - Redux DevTools wired up automatically, named after the store
- **Frozen initial state** - in development, `initial` is `Object.freeze`'d to catch mutations
- **`resetAllStores()`** - wipe every store, perfect for logout flows

## What it deliberately doesn't do

- No immer middleware bundled - opt in if you want it
- No selectors helper beyond what Zustand provides
- No context providers - stores are global, like vanilla Zustand
- No middleware composition API - if you need exotic middleware, drop down to raw Zustand

The point is: a known-good 80% of what you'd build by hand, in 1.4 KB.
