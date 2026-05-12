# @arshad-shah/store-kit

Tiny, typed Zustand factory with persistence, versioned migrations, devtools, and reset baked in.

**1.4 KB gzipped.** No dependencies in the hot path — just `zustand` as a peer.

```bash
pnpm add @arshad-shah/store-kit zustand
```

## Quick example

```ts
import { createStore } from "@arshad-shah/store-kit";

export const useUser = createStore({
  name: "user",
  initial: { id: null as string | null, prefs: {} },
  actions: (set) => ({
    setUser: (id: string) => set({ id }),
    clear: () => set({ id: null, prefs: {} }),
  }),
  persist: { storage: "local", version: 1 },
  // Diagnostic channel - optional, fires on hydration / persist / reset failure.
  onError: (err, info) => console.warn(`[store:user:${info.op}]`, err),
});

// In a component
const id = useUser((s) => s.id);
const { setUser } = useUser.getState();
```

## What you get

- **Typed actions** with proper inference from `set`/`get`
- **Persistence** to localStorage, sessionStorage, memory, or any custom backend
- **Versioned migrations** for schema evolution without breaking existing users
- **Devtools** wired up automatically in development
- **`reset()`** that clears state *and* persisted data (detaches the persist subscription during the clear so it doesn't race itself)
- **`destroy()`** that unsubscribes the persist listener and removes the store from `resetAllStores()`'s registry — safe for SSR-per-request and tests
- **`resetAllStores()`** for logout flows
- **`onError`** diagnostic channel so silent persistence failures don't stay silent

## Notes

- `initial` is shallow-frozen in development to catch top-level mutations. Nested mutations (`state.nested.x = 1`) are not detected — wrap in a deep-freeze yourself if you need that guarantee.
- The persisted envelope is `{ version: number, state: ... }`. Migrating from a different persistence solution? Either write a one-time migration that reshapes the existing entry or accept that data will reset on first load.

## Documentation

[https://kit.arshadshah.com/store-kit](https://kit.arshadshah.com/store-kit)

## License

MIT © Arshad Shah
